"""
Blueprint: /api/predictions — Generación y consulta de predicciones ML
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.prediction import Prediction
from app.utils.helpers import validate_ticker
from app.utils.constants import VALID_MODELS

predictions_bp = Blueprint("predictions", __name__)

DISCLAIMER = (
    "Las predicciones tienen ~55-60% precisión. No constituyen asesoramiento financiero."
)


# mcajamar - 01/03/2026: preparé el endpoint de predicciones para recibir ticker, modelos y horizonte desde el frontend.
@predictions_bp.route("", methods=["POST"])
@jwt_required()
def create_prediction():
    """POST /api/predictions — Genera predicciones (requiere login)."""
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    ticker = (data.get("ticker") or "").strip().upper()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    models = data.get("models", ["prophet", "arima", "sma"])
    if not isinstance(models, list) or not models:
        models = ["prophet", "arima", "sma"]
    models = [m for m in models if m in VALID_MODELS]

    horizon_days = int(data.get("horizon_days", 20))
    if horizon_days < 1 or horizon_days > 60:
        return jsonify({"error": "BAD_REQUEST", "message": "horizon_days debe estar entre 1 y 60", "status": 400}), 400

    historical_days = int(data.get("historical_days", 1825))
    if historical_days < 90 or historical_days > 3650:
        historical_days = 1825

    try:
        from app.services.ml_service import MLService
        result = MLService.predict_all(ticker, horizon_days=horizon_days, historical_days=historical_days)
    except ValueError as exc:
        return jsonify({"error": "NOT_FOUND", "message": str(exc), "status": 404}), 404
    except Exception as exc:
        return jsonify({"error": "SERVER_ERROR", "message": f"Error en predicción: {exc}", "status": 500}), 500

    # ── Guardar predicciones en BD ─────────────────────────────────────────
    group_id = _next_group_id()
    saved_ids: list[int] = []

    for model_data in result.get("models", []):
        if model_data.get("error") or not model_data.get("predictions"):
            continue
        model_name = model_data["name"]
        metrics = model_data.get("metrics", {})

        for pred_point in model_data["predictions"]:
            from datetime import date
            pred_date = date.fromisoformat(pred_point["date"])
            p = Prediction(
                user_id=user_id,
                ticker=ticker,
                model_type=model_name,
                prediction_date=pred_date,
                predicted_price=pred_point["predicted_price"],
                confidence_interval_low=pred_point.get("lower_bound"),
                confidence_interval_high=pred_point.get("upper_bound"),
                confidence_level=pred_point.get("confidence_level", 0.95),
                horizon_days=horizon_days,
                mae=metrics.get("mae"),
                rmse=metrics.get("rmse"),
                mape=metrics.get("mape"),
                training_samples=metrics.get("training_samples"),
                prediction_group_id=group_id,
                historical_days=historical_days,
            )
            db.session.add(p)
            db.session.flush()
            saved_ids.append(p.id)

    portfolio_position = None
    try:
        portfolio_position = _save_prediction_to_virtual_portfolio(
            user_id=user_id,
            ticker=ticker,
            group_id=group_id,
            result=result,
            horizon_days=horizon_days,
        )
    except Exception:
        portfolio_position = None

    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "prediction_created", "prediction", group_id)
    except Exception:
        pass

    # ── Disparar alertas de predicción activas para este usuario/ticker ──────
    try:
        from app.services.alert_service import AlertService
        from app.models.alert import Alert
        pred_alerts = Alert.query.filter_by(
            user_id=user_id, ticker=ticker,
            alert_type="prediction_change", is_active=True
        ).all()
        if pred_alerts:
            AlertService.check_prediction_change_alerts()
    except Exception:
        pass

    return jsonify({
        "prediction_id": group_id,
        "ticker": ticker,
        "generated_at": result["generated_at"],
        "horizon_days": horizon_days,
        "models": result["models"],
        "consensus": result["consensus"],
        "disclaimer": DISCLAIMER,
        "portfolio_position": portfolio_position,
    }), 201


@predictions_bp.route("", methods=["GET"])
@jwt_required()
def get_my_predictions():
    """GET /api/predictions?ticker=APPLE&limit=10&offset=0

    Devuelve una entrada por grupo de predicción (no una por cada punto),
    ordenadas de más reciente a más antigua, con el campo `trend` calculado.
    """
    user_id = int(get_jwt_identity())
    ticker_filter = request.args.get("ticker")
    limit = min(int(request.args.get("limit", 10)), 100)
    offset = int(request.args.get("offset", 0))

    # Obtener grupos únicos (prediction_group_id) ordenados por fecha desc
    from sqlalchemy import func

    groups_q = (
        db.session.query(
            Prediction.prediction_group_id,
            func.max(Prediction.created_at).label("last_created"),
        )
        .filter(Prediction.user_id == user_id)
    )
    if ticker_filter:
        groups_q = groups_q.filter(Prediction.ticker == ticker_filter.upper())

    groups_q = groups_q.group_by(Prediction.prediction_group_id)
    total = groups_q.count()

    group_rows = (
        groups_q
        .order_by(func.max(Prediction.created_at).desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    summaries = []
    for (group_id, _) in group_rows:
        rows = (
            Prediction.query
            .filter_by(user_id=user_id, prediction_group_id=group_id)
            .order_by(Prediction.prediction_date.asc())
            .all()
        )
        if not rows:
            continue

        first_pred = rows[0]
        models = sorted({row.model_type for row in rows if row.model_type})
        first_prices = []
        final_prices = []
        for model in models:
            model_rows = [row for row in rows if row.model_type == model]
            if not model_rows:
                continue
            first_prices.append(float(model_rows[0].predicted_price or 0))
            final_prices.append(float(model_rows[-1].predicted_price or 0))

        avg_first = sum(first_prices) / len(first_prices) if first_prices else float(first_pred.predicted_price or 0)
        avg_final = sum(final_prices) / len(final_prices) if final_prices else avg_first

        entry = first_pred.to_dict()
        entry["prediction_id"] = group_id
        entry["group_id"] = group_id
        entry["models"] = models
        entry["model_count"] = len(models)
        entry["model"] = models[0] if models else entry.get("model")
        entry["first_prediction"] = round(avg_first, 4) if avg_first else None
        entry["target_prediction"] = round(avg_final, 4) if avg_final else None
        entry["trend"] = "up" if avg_final >= avg_first else "down"
        summaries.append(entry)

    return jsonify({
        "predictions": summaries,
        "total": total,
        "page": offset // limit + 1,
        "per_page": limit,
    }), 200


@predictions_bp.route("/<int:prediction_id>", methods=["GET"])
@jwt_required()
def get_prediction(prediction_id: int):
    """GET /api/predictions/:id — reconstruye la predicción guardada en el mismo
    formato que devuelve el POST, para que el frontend pueda mostrarla igual."""
    import numpy as np

    user_id = int(get_jwt_identity())
    rows = (
        Prediction.query
        .filter_by(user_id=user_id, prediction_group_id=prediction_id)
        .order_by(Prediction.prediction_date.asc())
        .all()
    )
    if not rows:
        return jsonify({"error": "NOT_FOUND", "message": "Predicción no encontrada", "status": 404}), 404

    # ── Agrupar por modelo ─────────────────────────────────────────────────
    models_dict: dict = {}
    for p in rows:
        mt = p.model_type
        if mt not in models_dict:
            models_dict[mt] = {
                "name": mt,
                "predictions": [],
                "metrics": {
                    "mae":              float(p.mae)              if p.mae              else None,
                    "rmse":             float(p.rmse)             if p.rmse             else None,
                    "mape":             float(p.mape)             if p.mape             else None,
                    "training_samples": p.training_samples,
                },
            }
        models_dict[mt]["predictions"].append({
            "date":            p.prediction_date.isoformat(),
            "predicted_price": float(p.predicted_price),
            "lower_bound":     float(p.confidence_interval_low)  if p.confidence_interval_low  else None,
            "upper_bound":     float(p.confidence_interval_high) if p.confidence_interval_high else None,
            "confidence_level": float(p.confidence_level)        if p.confidence_level         else 0.95,
        })

    models_list = list(models_dict.values())

    # ── Consenso ──────────────────────────────────────────────────────────
    first_prices = [
        m["predictions"][0]["predicted_price"]
        for m in models_list if m["predictions"]
    ]
    consensus = {}
    if first_prices:
        consensus = {
            "average_prediction": round(float(np.mean(first_prices)), 4),
            "std_dev":            round(float(np.std(first_prices)),  4),
            "models_agree":       len(first_prices),
        }

    first_row = rows[0]
    return jsonify({
        "prediction_id":  prediction_id,
        "ticker":         first_row.ticker,
        "generated_at":   first_row.created_at.isoformat() if first_row.created_at else None,
        "horizon_days":   first_row.horizon_days,
        "models":         models_list,
        "consensus":      consensus,
        "disclaimer":     DISCLAIMER,
        "from_history":   True,
    }), 200


def _next_group_id() -> int:
    """Genera ID de grupo correlativo para agrupar predicciones de una misma solicitud."""
    last = db.session.query(db.func.max(Prediction.prediction_group_id)).scalar()
    return (last or 0) + 1


def _save_prediction_to_virtual_portfolio(
    user_id: int,
    ticker: str,
    group_id: int,
    result: dict,
    horizon_days: int,
) -> dict | None:
    from datetime import date

    from app.models.portfolio import PortfolioPosition, VirtualPortfolio

    portfolio = (
        VirtualPortfolio.query
        .filter(VirtualPortfolio.user_id == user_id)
        .filter(db.func.lower(VirtualPortfolio.name).in_(["mis inversiones", "cartera virtual", "portfolio " + "demo", "portfolio " + "demo ml"]))
        .order_by(VirtualPortfolio.created_at.asc())
        .first()
    )
    if not portfolio:
        portfolio = VirtualPortfolio(
            user_id=user_id,
            name="Mis inversiones",
            initial_capital=0,
            current_value=0,
        )
        db.session.add(portfolio)
        db.session.flush()

    current_price = None
    try:
        from app.services.data_service import DataService
        stock = DataService.get_stock_data(ticker, days=5)
        current_price = float(stock.get("last_price") or 0) or None
    except Exception:
        current_price = None

    model_names = []
    first_targets = []
    final_targets = []
    for model_data in result.get("models", []):
        if model_data.get("error") or not model_data.get("predictions"):
            continue
        model_names.append(model_data.get("name"))
        points = model_data.get("predictions") or []
        if points:
            first_targets.append(float(points[0].get("predicted_price") or 0))
            final_targets.append(float(points[-1].get("predicted_price") or 0))

    target = result.get("consensus", {}).get("average_prediction")
    if target is None and final_targets:
        target = sum(final_targets) / len(final_targets)
    if current_price is None and first_targets:
        current_price = sum(first_targets) / len(first_targets)
    if current_price is None:
        return None

    target_float = float(target or current_price)
    direction = "buy" if target_float >= current_price else "sell"
    expected_pct = ((target_float - current_price) / current_price) * 100 if current_price else 0

    existing = PortfolioPosition.query.filter_by(
        portfolio_id=portfolio.id,
        source_type="prediction",
        source_id=group_id,
    ).first()
    if existing:
        return existing.to_dict()

    position = PortfolioPosition(
        portfolio_id=portfolio.id,
        ticker=ticker,
        quantity=1,
        buy_price=round(current_price, 4),
        buy_date=date.today(),
        current_price=round(current_price, 4),
        source_type="prediction",
        source_id=group_id,
        source_label="Prediccion ML",
        signal_type=direction,
        signal_score=None,
        source_note=(
            f"Prediccion ML {ticker}: objetivo {target_float:.2f}, "
            f"escenario {'alcista' if direction == 'buy' else 'bajista'} "
            f"({expected_pct:+.2f}%), horizonte {horizon_days} dias, "
            f"modelos {', '.join([m for m in model_names if m])}."
        ),
    )
    position.recalculate()
    db.session.add(position)
    db.session.flush()

    positions = portfolio.positions.all()
    total_current = sum(float(p.current_price or p.buy_price) * float(p.quantity) for p in positions)
    total_invested = sum(float(p.buy_price) * float(p.quantity) for p in positions)
    portfolio.current_value = total_current
    portfolio.total_return = ((total_current - total_invested) / total_invested) if total_invested else 0

    return position.to_dict()
