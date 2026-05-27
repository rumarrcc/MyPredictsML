"""
Blueprint: /api/backtest — Ejecución y consulta de backtesting

Límites por plan:
  FREE    → 0 backtests (bloqueado)
  PRO     → 5 backtests por día
  PREMIUM → ilimitado
"""
from datetime import date, datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.backtest import BacktestResult
from app.models.user import User
from app.utils.helpers import validate_ticker
from app.utils.constants import VALID_MODELS
from app.services.subscription_service import SubscriptionService

backtest_bp = Blueprint("backtest", __name__)


@backtest_bp.route("", methods=["POST"])
@jwt_required()
def run_backtest():
    """POST /api/backtest — Ejecuta backtesting."""
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    # ── Comprobación de plan ───────────────────────────────────────────────────
    user = User.query.get(user_id)
    backtests_limit = SubscriptionService.get_limit(user, "backtests_per_day")

    if backtests_limit == 0:
        # Plan FREE — sin acceso a backtesting
        return jsonify({
            "error": "PLAN_REQUIRED",
            "message": (
                "El backtesting no está disponible en el plan gratuito. "
                "Actualiza a PRO para backtesting ilimitado."
            ),
            "status": 403,
            "effective_plan": SubscriptionService.get_user_plan(user),
            "backtests_limit": 0,
        }), 403

    if backtests_limit is not None:
        # Contar backtests de hoy
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = BacktestResult.query.filter(
            BacktestResult.user_id == user_id,
            BacktestResult.created_at >= today_start,
        ).count()
        if today_count >= backtests_limit:
            return jsonify({
                "error": "LIMIT_REACHED",
                "message": (
                    f"Has alcanzado el límite diario de {backtests_limit} backtests para tu plan. "
                    "El límite se reinicia a medianoche (UTC). "
                    "PRO incluye acceso ilimitado."
                ),
                "status": 403,
                "effective_plan": SubscriptionService.get_user_plan(user),
                "backtests_today": today_count,
                "backtests_limit": backtests_limit,
            }), 403

    ticker = (data.get("ticker") or "").strip().upper()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    # Fechas
    try:
        start_date = date.fromisoformat(data["start_date"])
        end_date = date.fromisoformat(data["end_date"])
    except (KeyError, ValueError):
        return jsonify({"error": "BAD_REQUEST", "message": "start_date y end_date requeridos (YYYY-MM-DD)", "status": 400}), 400

    if start_date >= end_date:
        return jsonify({"error": "BAD_REQUEST", "message": "start_date debe ser anterior a end_date", "status": 400}), 400

    if (end_date - start_date).days < 10:
        return jsonify({"error": "BAD_REQUEST", "message": "El período debe ser de al menos 10 días", "status": 400}), 400

    models = data.get("models", ["prophet", "arima", "sma"])
    models = [m for m in models if m in VALID_MODELS]
    if not models:
        models = ["sma"]

    trade_type = data.get("trade_type", "long")
    if trade_type not in ("long", "short", "both"):
        trade_type = "long"

    initial_capital = float(data.get("initial_capital", 10000))
    if initial_capital < 100:
        return jsonify({"error": "BAD_REQUEST", "message": "initial_capital mínimo: 100", "status": 400}), 400

    position_size_percent = float(data.get("position_size_percent", 100))
    if not (1 <= position_size_percent <= 100):
        position_size_percent = 100

    try:
        from app.services.backtest_service import BacktestService
        result = BacktestService.run(
            ticker=ticker,
            start_date=start_date,
            end_date=end_date,
            models=models,
            initial_capital=initial_capital,
            trade_type=trade_type,
            position_size_percent=position_size_percent,
        )
    except ValueError as exc:
        return jsonify({"error": "BAD_REQUEST", "message": str(exc), "status": 400}), 400
    except Exception as exc:
        return jsonify({"error": "SERVER_ERROR", "message": f"Error en backtesting: {exc}", "status": 500}), 500

    valid_results = {m: r for m, r in result.get("results", {}).items() if "error" not in r}
    if not valid_results:
        errors = {m: r.get("error") for m, r in result.get("results", {}).items()}
        return jsonify({
            "error": "BAD_REQUEST",
            "message": "No se pudo completar ningun modelo de backtesting",
            "details": errors,
            "status": 400,
        }), 400

    # ── Guardar en BD ─────────────────────────────────────────────────────
    group_id = _next_group_id()
    first_bt_id = None

    for model_name, model_result in result["results"].items():
        if "error" in model_result:
            continue
        bt = BacktestResult(
            user_id=user_id,
            ticker=ticker,
            model_type=model_name,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            trade_type=trade_type,
            position_size_percent=position_size_percent,
            total_return=model_result.get("total_return"),
            win_rate=model_result.get("win_rate"),
            num_trades=model_result.get("num_trades"),
            winning_trades=model_result.get("winning_trades"),
            losing_trades=model_result.get("losing_trades"),
            max_consecutive_wins=model_result.get("max_consecutive_wins"),
            max_consecutive_losses=model_result.get("max_consecutive_losses"),
            max_drawdown=model_result.get("max_drawdown"),
            sharpe_ratio=model_result.get("sharpe_ratio"),
            sortino_ratio=model_result.get("sortino_ratio"),
            profit_factor=model_result.get("profit_factor"),
            average_win=model_result.get("average_win"),
            average_loss=model_result.get("average_loss"),
            final_capital=model_result.get("final_capital"),
            results_json={"equity_curve": result.get("equity_curve", [])},
            group_id=group_id,
        )
        db.session.add(bt)
        db.session.flush()
        if first_bt_id is None:
            first_bt_id = bt.id

    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "backtest_run", "backtest", group_id)
    except Exception:
        pass

    return jsonify({
        "backtest_id": group_id,
        **result,
    }), 201


@backtest_bp.route("/<int:backtest_id>", methods=["GET"])
@jwt_required()
def get_backtest(backtest_id: int):
    """GET /api/backtest/:id — Obtiene resultados de un backtest previo."""
    user_id = int(get_jwt_identity())

    records = (
        BacktestResult.query
        .filter_by(user_id=user_id, group_id=backtest_id)
        .all()
    )
    if not records:
        # Intentar por ID directo
        record = BacktestResult.query.filter_by(id=backtest_id, user_id=user_id).first_or_404()
        records = [record]

    first = records[0]
    results = {r.model_type: r.to_dict() for r in records}
    equity_curve = first.results_json.get("equity_curve", []) if first.results_json else []

    return jsonify({
        "backtest_id": backtest_id,
        "ticker": first.ticker,
        "period": f"{first.start_date} to {first.end_date}",
        "results": results,
        "equity_curve": equity_curve,
        "metadata": {
            "completed_at": first.created_at.isoformat() if first.created_at else None,
        },
    }), 200


@backtest_bp.route("", methods=["GET"])
@jwt_required()
def list_backtests():
    """GET /api/backtest — Lista mis backtests."""
    user_id = int(get_jwt_identity())
    limit = min(int(request.args.get("limit", 10)), 50)
    offset = int(request.args.get("offset", 0))

    query = BacktestResult.query.filter_by(user_id=user_id)
    total = query.count()
    records = query.order_by(BacktestResult.created_at.desc()).limit(limit).offset(offset).all()

    return jsonify({
        "backtests": [r.to_dict() for r in records],
        "total": total,
        "page": offset // limit + 1,
        "per_page": limit,
    }), 200


def _next_group_id() -> int:
    last = db.session.query(db.func.max(BacktestResult.group_id)).scalar()
    return (last or 0) + 1
