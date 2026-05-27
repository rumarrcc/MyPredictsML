"""
Blueprint: /api/alerts — CRUD de alertas de precio/predicción/tendencia
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.alert import Alert
from app.models.user import User
from app.utils.helpers import validate_ticker
from app.utils.constants import VALID_ALERT_TYPES
from app.services.subscription_service import SubscriptionService

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("", methods=["POST"])
@jwt_required()
def create_alert():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    ticker = (data.get("ticker") or "").strip().upper()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    alert_type = data.get("alert_type", "")
    if alert_type not in VALID_ALERT_TYPES:
        return jsonify({
            "error": "BAD_REQUEST",
            "message": f"alert_type debe ser uno de: {', '.join(VALID_ALERT_TYPES)}",
            "status": 400,
        }), 400

    # Validaciones específicas por tipo
    if alert_type == "price_threshold":
        if not data.get("trigger_value"):
            return jsonify({"error": "BAD_REQUEST", "message": "trigger_value requerido para price_threshold", "status": 400}), 400
        if data.get("condition") not in ("above", "below"):
            return jsonify({"error": "BAD_REQUEST", "message": "condition debe ser 'above' o 'below'", "status": 400}), 400

    user = User.query.get(user_id)
    plan_limit = SubscriptionService.get_limit(user, "max_alerts")   # None = ilimitado

    # Sumar alertas extra de gamificación por encima del límite del plan
    try:
        from app.services.gamification_service import GamificationService
        extra_alerts = GamificationService.get_extra_alerts(user_id)
    except Exception:
        extra_alerts = 0

    active_alerts = Alert.query.filter_by(user_id=user_id, is_active=True).count()

    if plan_limit is not None:
        alert_limit = plan_limit + int(extra_alerts or 0)
        if active_alerts >= alert_limit:
            effective_plan = SubscriptionService.get_user_plan(user)
            return jsonify({
                "error": "LIMIT_REACHED",
                "message": (
                    f"Límite de alertas activas alcanzado ({alert_limit}). "
                    f"Tu plan '{effective_plan}' permite {plan_limit} alertas. "
                    "Actualiza tu plan o usa la ruleta para obtener alertas extra temporales."
                ),
                "status": 403,
                "active_alerts": active_alerts,
                "alert_limit": alert_limit,
                "plan_limit": plan_limit,
                "extra_alerts": extra_alerts,
                "effective_plan": effective_plan,
            }), 403

    alert = Alert(
        user_id=user_id,
        ticker=ticker,
        alert_type=alert_type,
        condition=data.get("condition"),
        trigger_value=data.get("trigger_value"),
        model=data.get("model"),
        change_percent=data.get("change_percent"),
        description=data.get("description"),
        is_active=True,
        email_enabled=data.get("email_enabled", True),
        priority=data.get("priority", "medium"),
    )
    db.session.add(alert)
    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "alert_created", "alert", alert.id)
    except Exception:
        pass

    # ── Enviar email de confirmación de creación ───────────────────────────
    if alert.email_enabled:
        try:
            from app.services.email_service import EmailService
            EmailService.send_alert_created_email(alert)
        except Exception:
            pass

    return jsonify({
        **alert.to_dict(),
        "message": "Alerta creada. Recibirás un email cuando se cumpla la condición.",
    }), 201


@alerts_bp.route("", methods=["GET"])
@jwt_required()
def get_alerts():
    user_id = int(get_jwt_identity())
    is_active = request.args.get("is_active")

    query = Alert.query.filter_by(user_id=user_id)
    if is_active is not None:
        active_bool = is_active.lower() == "true"
        query = query.filter_by(is_active=active_bool)

    alerts = query.order_by(Alert.created_at.desc()).all()
    active_count = sum(1 for a in alerts if a.is_active)

    return jsonify({
        "alerts": [a.to_dict() for a in alerts],
        "total": len(alerts),
        "active": active_count,
    }), 200


@alerts_bp.route("/<int:alert_id>", methods=["GET"])
@jwt_required()
def get_alert(alert_id: int):
    user_id = int(get_jwt_identity())
    alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first_or_404()
    return jsonify(alert.to_dict()), 200


@alerts_bp.route("/<int:alert_id>", methods=["PUT"])
@jwt_required()
def update_alert(alert_id: int):
    user_id = int(get_jwt_identity())
    alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first_or_404()

    data = request.get_json(silent=True) or {}
    allowed = ["is_active", "email_enabled", "trigger_value", "condition", "description"]
    for field in allowed:
        if field in data:
            setattr(alert, field, data[field])

    db.session.commit()

    msg = "Alerta actualizada"
    if "is_active" in data:
        msg = "Alerta activada" if data["is_active"] else "Alerta desactivada"

    return jsonify({**alert.to_dict(), "message": msg}), 200


@alerts_bp.route("/<int:alert_id>", methods=["DELETE"])
@jwt_required()
def delete_alert(alert_id: int):
    user_id = int(get_jwt_identity())
    alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first_or_404()
    db.session.delete(alert)
    db.session.commit()
    return jsonify({"message": "Alerta eliminada"}), 200
