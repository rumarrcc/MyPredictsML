"""
Blueprint: /api/portfolio — Portafolios virtuales y posiciones
"""
from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.portfolio import VirtualPortfolio, PortfolioPosition
from app.models.billing import Payment
from app.utils.helpers import validate_ticker

portfolio_bp = Blueprint("portfolio", __name__)


def _wallet_balance(user_id: int) -> float:
    from sqlalchemy import func
    topups = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_topup",
    ).scalar() or 0
    spends = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_spend",
    ).scalar() or 0
    return round(float(topups) - float(spends), 2)


def _wallet_entry(user_id: int, amount: float, description: str, external_id: str) -> None:
    db.session.add(Payment(
        user_id=user_id,
        provider="wallet",
        amount=round(float(amount), 2),
        currency="EUR",
        status="succeeded",
        plan="wallet_spend",
        external_payment_id=external_id,
        description=description,
    ))


# ── Portafolios ────────────────────────────────────────────────────────────

@portfolio_bp.route("", methods=["POST"])
@jwt_required()
def create_portfolio():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "BAD_REQUEST", "message": "name requerido", "status": 400}), 400

    initial_capital = float(data.get("initial_capital", 10000))
    is_investment_wallet = name.lower() in {"inversiones desde señales", "mis inversiones"}
    if is_investment_wallet:
        initial_capital = 0
    elif initial_capital < 1:
        return jsonify({"error": "BAD_REQUEST", "message": "initial_capital debe ser > 0", "status": 400}), 400

    portfolio = VirtualPortfolio(
        user_id=user_id,
        name=name,
        initial_capital=initial_capital,
        current_value=initial_capital,
    )
    db.session.add(portfolio)
    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "portfolio_created", "portfolio", portfolio.id)
    except Exception:
        pass

    return jsonify(portfolio.to_dict(include_positions=True)), 201


@portfolio_bp.route("", methods=["GET"])
@jwt_required()
def list_portfolios():
    user_id = int(get_jwt_identity())
    portfolios = VirtualPortfolio.query.filter_by(user_id=user_id).order_by(VirtualPortfolio.created_at.desc()).all()
    for portfolio in portfolios:
        if portfolio.is_investment_wallet and float(portfolio.initial_capital or 0) != 0:
            portfolio.initial_capital = 0
            _update_portfolio_value(portfolio)
    return jsonify({"portfolios": [p.to_dict() for p in portfolios], "total": len(portfolios)}), 200


@portfolio_bp.route("/<int:portfolio_id>", methods=["GET"])
@jwt_required()
def get_portfolio(portfolio_id: int):
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    if portfolio.is_investment_wallet and float(portfolio.initial_capital or 0) != 0:
        portfolio.initial_capital = 0

    # Actualizar precios
    _refresh_prices(portfolio)

    return jsonify(portfolio.to_dict(include_positions=True)), 200


@portfolio_bp.route("/<int:portfolio_id>", methods=["PUT"])
@jwt_required()
def update_portfolio(portfolio_id: int):
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    data = request.get_json(silent=True) or {}

    if "name" in data:
        portfolio.name = data["name"].strip()

    db.session.commit()
    return jsonify(portfolio.to_dict()), 200


@portfolio_bp.route("/<int:portfolio_id>", methods=["DELETE"])
@jwt_required()
def delete_portfolio(portfolio_id: int):
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    db.session.delete(portfolio)
    db.session.commit()
    return jsonify({"message": "Portafolio eliminado"}), 200


# ── Posiciones ─────────────────────────────────────────────────────────────

@portfolio_bp.route("/<int:portfolio_id>/positions", methods=["POST"])
@jwt_required()
def add_position(portfolio_id: int):
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    data = request.get_json(silent=True) or {}

    ticker = (data.get("ticker") or "").strip().upper()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    try:
        quantity  = float(data["quantity"])
        buy_price = float(data["buy_price"])
        # buy_date puede llegar como "2024-01-18" o "2024-01-18T00:00:00.000Z" (yup lo serializa así)
        raw_date = data.get("buy_date") or date.today().isoformat()
        if isinstance(raw_date, str) and "T" in raw_date:
            raw_date = raw_date.split("T")[0]
        buy_date = date.fromisoformat(raw_date)
    except (KeyError, ValueError, TypeError) as exc:
        return jsonify({"error": "BAD_REQUEST", "message": f"quantity, buy_price y buy_date son requeridos ({exc})", "status": 400}), 400

    if quantity <= 0 or buy_price <= 0:
        return jsonify({"error": "BAD_REQUEST", "message": "quantity y buy_price deben ser positivos", "status": 400}), 400

    invested_amount = round(quantity * buy_price, 2)
    if portfolio.is_investment_wallet and _wallet_balance(user_id) < invested_amount:
        return jsonify({
            "error": "INSUFFICIENT_WALLET",
            "message": "Saldo insuficiente. Recarga tu capital de inversiones con tarjeta desde Stripe.",
            "required": invested_amount,
            "wallet_balance": _wallet_balance(user_id),
            "status": 402,
        }), 402

    # Obtener precio actual
    current_price = buy_price
    try:
        from app.services.data_service import DataService
        stock = DataService.get_stock_data(ticker, days=5)
        current_price = stock.get("last_price") or buy_price
    except Exception:
        pass

    position = PortfolioPosition(
        portfolio_id=portfolio_id,
        ticker=ticker,
        quantity=quantity,
        buy_price=buy_price,
        buy_date=buy_date,
        current_price=current_price,
        source_type=(data.get("source_type") or "manual")[:30],
        source_id=data.get("source_id"),
        source_label=(data.get("source_label") or None),
        signal_type=(data.get("signal_type") or None),
        signal_score=data.get("signal_score"),
        source_note=(data.get("source_note") or None),
    )
    position.recalculate()
    db.session.add(position)
    db.session.flush()
    if portfolio.is_investment_wallet:
        _wallet_entry(
            user_id,
            invested_amount,
            f"Inversion {ticker} desde {position.source_type or 'manual'}",
            f"invest-buy-{portfolio_id}-{position.id}",
        )

    # Actualizar portafolio
    _update_portfolio_value(portfolio)
    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "portfolio_updated", "portfolio", portfolio_id)
    except Exception:
        pass

    return jsonify({
        **position.to_dict(),
    }), 201


@portfolio_bp.route("/<int:portfolio_id>/positions/<int:position_id>", methods=["DELETE"])
@jwt_required()
def delete_position(portfolio_id: int, position_id: int):
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    position = PortfolioPosition.query.filter_by(id=position_id, portfolio_id=portfolio_id).first_or_404()
    db.session.delete(position)
    _update_portfolio_value(portfolio)
    db.session.commit()
    return jsonify({"message": "Posición eliminada"}), 200


# ── Helpers ────────────────────────────────────────────────────────────────

@portfolio_bp.route("/<int:portfolio_id>/positions/<int:position_id>/sell", methods=["POST"])
@jwt_required()
def sell_position(portfolio_id: int, position_id: int):
    """Vende una posicion virtual y devuelve el valor actual a la wallet."""
    user_id = int(get_jwt_identity())
    portfolio = VirtualPortfolio.query.filter_by(id=portfolio_id, user_id=user_id).first_or_404()
    position = PortfolioPosition.query.filter_by(id=position_id, portfolio_id=portfolio_id).first_or_404()

    current_price = float(position.current_price or position.buy_price)
    try:
        from app.services.data_service import DataService
        stock = DataService.get_stock_data(position.ticker, days=5)
        current_price = float(stock.get("last_price") or current_price)
    except Exception:
        pass

    position.current_price = current_price
    position.recalculate()
    proceeds = round(float(position.quantity) * current_price, 2)
    pnl = round(float(position.gain_loss or 0), 2)

    returns_to_wallet = portfolio.is_investment_wallet and position.source_type != "prediction"
    if returns_to_wallet:
        _wallet_entry(
            user_id,
            -proceeds,
            f"Venta {position.ticker} ({'beneficio' if pnl >= 0 else 'perdida'} {pnl:.2f} EUR)",
            f"invest-sell-{portfolio_id}-{position.id}",
        )
    sold = position.to_dict()
    db.session.delete(position)
    _update_portfolio_value(portfolio)
    db.session.commit()

    return jsonify({
        "message": "Posicion vendida y capital devuelto a tu wallet." if returns_to_wallet else "Posicion virtual cerrada.",
        "proceeds": proceeds,
        "pnl": pnl,
        "wallet_balance": _wallet_balance(user_id) if returns_to_wallet else None,
        "sold_position": sold,
        "portfolio": portfolio.to_dict(include_positions=True),
    }), 200


def _refresh_prices(portfolio: VirtualPortfolio) -> None:
    """Actualiza current_price de cada posición con precio actual de mercado."""
    from app.services.data_service import DataService

    positions = portfolio.positions.all()
    tickers = list({p.ticker for p in positions})

    prices: dict[str, float] = {}
    for ticker in tickers:
        try:
            stock = DataService.get_stock_data(ticker, days=5)
            if stock.get("last_price"):
                prices[ticker] = stock["last_price"]
        except Exception:
            pass

    for pos in positions:
        if pos.ticker in prices:
            pos.current_price = prices[pos.ticker]
            pos.recalculate()

    _update_portfolio_value(portfolio)
    db.session.commit()


def _update_portfolio_value(portfolio: VirtualPortfolio) -> None:
    positions = portfolio.positions.all()
    total_current = sum(
        (float(p.current_price or p.buy_price) * float(p.quantity))
        for p in positions
    )
    total_invested = sum(float(p.buy_price) * float(p.quantity) for p in positions)
    if getattr(portfolio, "is_investment_wallet", False):
        portfolio.current_value = total_current
        portfolio.total_return = ((total_current - total_invested) / total_invested) if total_invested else 0
        return

    cash = float(portfolio.initial_capital) - total_invested
    portfolio.current_value = total_current + cash
    ic = float(portfolio.initial_capital)
    portfolio.total_return = ((total_current + cash) - ic) / ic if ic else 0
