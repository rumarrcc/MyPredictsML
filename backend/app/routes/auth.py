"""
Blueprint: /api/auth — Registro, login y perfil.
"""
from hashlib import sha256

from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from app import db
from app.models.user import User
from app.utils.validators import validate_register, validate_login

auth_bp = Blueprint("auth", __name__)


# mcajamar - 15/02/2026: dejé funcionando registro, login y protección con token en las rutas privadas.
DEFAULT_USER_SETTINGS = {
    "default_ticker": "AAPL",
    "default_horizon_days": 20,
    "default_historical_days": 1825,
    "risk_profile": "moderate",
    "trading_style_default": "swing",
    "preferred_market": "US",
    "currency": "EUR",
    "timezone": "Europe/Madrid",
    "landing_after_login": "/dashboard",
    "email_alerts": True,
    "prediction_notifications": True,
    "marketplace_notifications": True,
    "public_profile": True,
    "show_predictions_on_profile": True,
    "compact_dashboard": False,
}


def _merged_settings(user: User) -> dict:
    settings = dict(DEFAULT_USER_SETTINGS)
    if isinstance(user.settings, dict):
        settings.update(user.settings)
    return settings


def _token_hash(token: str) -> str:
    return sha256((token or "").encode("utf-8")).hexdigest()


def _find_user_by_verification_token(token: str) -> User | None:
    if not token:
        return None
    return User.query.filter_by(email_verification_token_hash=_token_hash(token)).first()


def _find_user_by_reset_token(token: str) -> User | None:
    if not token:
        return None
    return User.query.filter_by(password_reset_token_hash=_token_hash(token)).first()


def _send_verification(user: User) -> bool:
    from app.services.email_service import EmailService

    token = user.create_email_verification_token()
    db.session.commit()
    return EmailService.send_email_verification(user, token)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    errors = validate_register(data)
    if errors:
        return jsonify({"error": "BAD_REQUEST", "message": errors, "status": 400}), 400

    if User.query.filter_by(email=data["email"].lower()).first():
        return jsonify({"error": "BAD_REQUEST", "message": "El email ya está registrado", "status": 400}), 400

    if User.query.filter_by(username=data["username"].lower()).first():
        return jsonify({"error": "BAD_REQUEST", "message": "El username ya está en uso", "status": 400}), 400

    user = User(
        username=data["username"].lower().strip(),
        email=data["email"].lower().strip(),
        full_name=data.get("full_name", "").strip() or None,
    )
    user.set_password(data["password"])
    if not current_app.config.get("EMAIL_REQUIRE_VERIFICATION", True):
        user.email_verified = True
    db.session.add(user)
    db.session.commit()

    verification_sent = False
    if not user.email_verified:
        try:
            verification_sent = _send_verification(user)
        except Exception:
            current_app.logger.exception("No se pudo enviar verificación de email a %s", user.email)
    else:
        try:
            from app.services.email_service import EmailService
            EmailService.send_welcome_email(user)
        except Exception:
            pass

    return jsonify({
        "user": user.to_dict(),
        "requires_email_verification": not user.email_verified,
        "verification_email_sent": verification_sent,
        "message": "Cuenta creada. Revisa tu correo para activarla." if not user.email_verified else "Usuario registrado correctamente",
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    errors = validate_login(data)
    if errors:
        return jsonify({"error": "BAD_REQUEST", "message": errors, "status": 400}), 400

    user = User.query.filter_by(email=data["email"].lower().strip()).first()
    if not user or not user.check_password(data["password"]):
        return jsonify({"error": "UNAUTHORIZED", "message": "Credenciales inválidas", "status": 401}), 401

    if not user.is_active:
        return jsonify({"error": "FORBIDDEN", "message": "Cuenta desactivada", "status": 403}), 403

    if user.is_blocked:
        return jsonify({"error": "FORBIDDEN", "message": "Cuenta suspendida. Contacta con soporte.", "status": 403}), 403

    if current_app.config.get("EMAIL_REQUIRE_VERIFICATION", True) and not user.email_verified:
        return jsonify({
            "error": "EMAIL_NOT_VERIFIED",
            "message": "Necesitas verificar tu correo antes de iniciar sesión.",
            "status": 403,
            "email": user.email,
        }), 403

    # Registrar último acceso
    user.touch_login()
    db.session.commit()

    # ── Gamificación: racha + puntos de login ──────────────────────────────
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user.id, "login")
    except Exception:
        pass

    token = create_access_token(identity=str(user.id))
    return jsonify({
        "user": user.to_dict(),
        "token": token,
        "expires_in": 86400,
    }), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict(include_stats=True)), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    # JWT stateless — el cliente elimina el token
    return jsonify({"message": "Sesión cerrada exitosamente"}), 200


@auth_bp.route("/role", methods=["GET"])
@jwt_required()
def check_role():
    """rumarrcc: endpoint rapido para comprobar el rol real guardado en base de datos."""
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify({
        "id":       user.id,
        "username": user.username,
        "role":     user.role,
        "is_admin": user.is_admin,
    }), 200


# ── Perfil ─────────────────────────────────────────────────────────────────

@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict(include_stats=True)), 200


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    if "username" in data:
        username = str(data.get("username") or "").strip().lower()
        if len(username) < 3:
            return jsonify({"error": "BAD_REQUEST", "message": "El username debe tener al menos 3 caracteres", "status": 400}), 400
        existing = User.query.filter(User.username == username, User.id != user.id).first()
        if existing:
            return jsonify({"error": "BAD_REQUEST", "message": "El username ya está en uso", "status": 400}), 400
        user.username = username

    allowed = ["full_name", "avatar_url", "bio", "headline", "location", "website", "trading_style"]
    for field in allowed:
        if field in data:
            value = data[field]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(user, field, value)

    if "favorites" in data and isinstance(data["favorites"], list):
        from app.models.user import FavoriteTicker
        FavoriteTicker.query.filter_by(user_id=user.id).delete()
        for ticker in data["favorites"][:50]:
            symbol = str(ticker).strip().upper()
            if symbol:
                db.session.add(FavoriteTicker(user_id=user.id, ticker=symbol))

    db.session.commit()
    payload = user.to_dict()
    payload["favorites"] = [f.ticker for f in user.favorite_tickers]
    return jsonify(payload), 200


@auth_bp.route("/profile/predictions", methods=["GET"])
@jwt_required()
def profile_predictions():
    """Predicciones ML guardadas del usuario."""
    from sqlalchemy import func
    from app.models.prediction import Prediction

    user_id = int(get_jwt_identity())
    limit = min(int(request.args.get("limit", 12)), 50)
    ticker_filter = (request.args.get("ticker") or "").strip().upper()

    groups_q = (
        db.session.query(Prediction.prediction_group_id, func.max(Prediction.created_at).label("last_created"))
        .filter(Prediction.user_id == user_id)
    )
    if ticker_filter:
        groups_q = groups_q.filter(Prediction.ticker == ticker_filter)
    groups = (
        groups_q
        .group_by(Prediction.prediction_group_id)
        .order_by(func.max(Prediction.created_at).desc())
        .limit(limit)
        .all()
    )
    ml_items = []
    for group_id, _ in groups:
        first_pred = (
            Prediction.query
            .filter_by(user_id=user_id, prediction_group_id=group_id)
            .order_by(Prediction.prediction_date.asc())
            .first()
        )
        last_pred = (
            Prediction.query
            .filter_by(user_id=user_id, prediction_group_id=group_id)
            .order_by(Prediction.prediction_date.desc())
            .first()
        )
        if not first_pred:
            continue
        item = first_pred.to_dict()
        item["trend"] = "up" if last_pred and float(last_pred.predicted_price or 0) >= float(first_pred.predicted_price or 0) else "down"
        item["type"] = "ml_prediction"
        ml_items.append(item)

    return jsonify({
        "ml_predictions": ml_items,
        "totals": {
            "ml_predictions": len(ml_items),
        },
    }), 200


@auth_bp.route("/verify-email", methods=["GET", "POST"])
def verify_email():
    token = request.args.get("token") if request.method == "GET" else (request.get_json(silent=True) or {}).get("token")
    user = _find_user_by_verification_token(token or "")
    if not user:
        return jsonify({"error": "BAD_REQUEST", "message": "Enlace de verificación inválido o caducado", "status": 400}), 400

    max_age = int(current_app.config.get("EMAIL_VERIFICATION_TOKEN_HOURS", 24))
    if not user.verify_email_token(token, max_age_hours=max_age):
        return jsonify({"error": "BAD_REQUEST", "message": "Enlace de verificación inválido o caducado", "status": 400}), 400

    db.session.commit()
    try:
        from app.services.email_service import EmailService
        EmailService.send_welcome_email(user)
    except Exception:
        pass

    auth_token = create_access_token(identity=str(user.id))
    return jsonify({
        "message": "Correo verificado correctamente",
        "user": user.to_dict(),
        "token": auth_token,
        "expires_in": 86400,
    }), 200


@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "BAD_REQUEST", "message": "Email requerido", "status": 400}), 400

    user = User.query.filter_by(email=email).first()
    sent = False
    if user and not user.email_verified:
        try:
            sent = _send_verification(user)
        except Exception:
            current_app.logger.exception("No se pudo reenviar verificación a %s", email)

    return jsonify({
        "message": "Si el correo existe y está pendiente, te enviaremos un nuevo enlace de verificación.",
        "sent": sent,
    }), 200


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "BAD_REQUEST", "message": "Email requerido", "status": 400}), 400

    user = User.query.filter_by(email=email).first()
    if user and user.is_active and not user.is_blocked:
        try:
            from app.services.email_service import EmailService
            token = user.create_password_reset_token()
            db.session.commit()
            EmailService.send_password_reset_email(user, token)
        except Exception:
            current_app.logger.exception("No se pudo enviar recuperación de contraseña a %s", email)

    return jsonify({
        "message": "Si existe una cuenta con ese correo, enviaremos instrucciones para restablecer la contraseña."
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    token = data.get("token") or ""
    password = data.get("password") or ""

    from app.utils.validators import _validate_password
    pwd_error = _validate_password(password)
    if pwd_error:
        return jsonify({"error": "BAD_REQUEST", "message": pwd_error, "status": 400}), 400

    user = _find_user_by_reset_token(token)
    max_age = int(current_app.config.get("PASSWORD_RESET_TOKEN_MINUTES", 30))
    if not user or not user.verify_password_reset_token(token, max_age_minutes=max_age):
        return jsonify({"error": "BAD_REQUEST", "message": "Enlace de recuperación inválido o caducado", "status": 400}), 400

    user.set_password(password)
    user.clear_password_reset_token()
    db.session.commit()

    return jsonify({"message": "Contraseña actualizada correctamente"}), 200


@auth_bp.route("/settings", methods=["GET"])
@jwt_required()
def get_settings():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify({"settings": _merged_settings(user)}), 200


@auth_bp.route("/settings", methods=["PUT"])
@jwt_required()
def update_settings():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    allowed = set(DEFAULT_USER_SETTINGS.keys())
    current = _merged_settings(user)
    for key, value in data.items():
        if key not in allowed:
            continue
        if key in ("default_horizon_days", "default_historical_days"):
            value = int(value or current[key])
            if key == "default_horizon_days":
                value = max(1, min(value, 60))
            else:
                value = max(90, min(value, 3650))
        if key == "default_ticker":
            value = str(value or "AAPL").strip().upper()[:10]
        current[key] = value

    user.settings = current
    db.session.commit()
    return jsonify({"settings": current, "user": user.to_dict(include_stats=True)}), 200


# ── Tickers favoritos ──────────────────────────────────────────────────────

@auth_bp.route("/favorites", methods=["GET"])
@jwt_required()
def get_favorites():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify({"favorites": [f.to_dict() for f in user.favorite_tickers]}), 200


@auth_bp.route("/favorites", methods=["POST"])
@jwt_required()
def add_favorite():
    from app.models.user import FavoriteTicker
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    ticker = (data.get("ticker") or "").strip().upper()
    if not ticker:
        return jsonify({"error": "BAD_REQUEST", "message": "ticker requerido", "status": 400}), 400

    existing = FavoriteTicker.query.filter_by(user_id=user_id, ticker=ticker).first()
    if existing:
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker ya en favoritos", "status": 400}), 400

    fav = FavoriteTicker(user_id=user_id, ticker=ticker, name=data.get("name"), sector=data.get("sector"))
    db.session.add(fav)
    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "favorite_added", "ticker", None)
    except Exception:
        pass

    return jsonify(fav.to_dict()), 201


@auth_bp.route("/favorites/<ticker>", methods=["DELETE"])
@jwt_required()
def remove_favorite(ticker: str):
    from app.models.user import FavoriteTicker
    user_id = int(get_jwt_identity())
    fav = FavoriteTicker.query.filter_by(user_id=user_id, ticker=ticker.upper()).first_or_404()
    db.session.delete(fav)
    db.session.commit()
    return jsonify({"message": "Eliminado de favoritos"}), 200
