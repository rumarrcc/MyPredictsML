"""
Decoradores personalizados para las rutas Flask.
"""
import functools
import logging
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

logger = logging.getLogger(__name__)


def admin_required(fn):
    """Verifica admin global. Acepta role='admin' como alias legacy."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        from app.models.user import User
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not user.is_global_admin:
            return jsonify({"error": "FORBIDDEN", "message": "Acceso restringido a administradores", "status": 403}), 403
        return fn(*args, **kwargs)
    return wrapper


def role_required(*roles):
    """Decorador flexible para permisos globales."""
    allowed = set(roles)

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            from app.models.user import User
            verify_jwt_in_request()
            user_id = int(get_jwt_identity())
            user = User.query.get(user_id)
            user_roles = {user.role} if user else set()
            if user and user.role == "admin":
                user_roles.add("global_admin")
            if not user or not (user_roles & allowed):
                return jsonify({"error": "FORBIDDEN", "message": "Permisos insuficientes", "status": 403}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def global_admin_required(fn):
    return admin_required(fn)


def optional_jwt(fn):
    """Decorador que intenta leer JWT si existe, pero no falla si no hay token."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request(optional=True)
        except Exception:
            pass
        return fn(*args, **kwargs)
    return wrapper


def validate_json(*required_fields):
    """Decorador que verifica que el body es JSON y contiene los campos requeridos."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            data = request.get_json(silent=True)
            if data is None:
                return jsonify({
                    "error": "BAD_REQUEST",
                    "message": "Se requiere Content-Type: application/json",
                    "status": 400,
                }), 400
            missing = [f for f in required_fields if not data.get(f)]
            if missing:
                return jsonify({
                    "error": "BAD_REQUEST",
                    "message": f"Campos requeridos: {', '.join(missing)}",
                    "status": 400,
                }), 400
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def log_request(fn):
    """rumarrcc: trazas ligeras de requests para desarrollo."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        logger.debug("%s %s — %s", request.method, request.path, request.remote_addr)
        return fn(*args, **kwargs)
    return wrapper


def owner_required(model_class, id_param: str = "id", user_field: str = "user_id"):
    """
    Decorador que verifica que el recurso pertenece al usuario autenticado.
    Uso: @owner_required(Alert, id_param='alert_id')
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = int(get_jwt_identity())
            resource_id = kwargs.get(id_param)
            if resource_id is None:
                return jsonify({"error": "BAD_REQUEST", "message": "ID requerido", "status": 400}), 400

            resource = model_class.query.get(resource_id)
            if not resource:
                return jsonify({"error": "NOT_FOUND", "message": "Recurso no encontrado", "status": 404}), 404

            if getattr(resource, user_field) != user_id:
                return jsonify({"error": "FORBIDDEN", "message": "Sin permisos", "status": 403}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
