"""
Blueprint: /api/reviews — Valoraciones públicas de la plataforma MyPredicts.
Cada usuario registrado puede publicar UNA valoración (create/update).
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request

from app import db

reviews_bp = Blueprint("reviews", __name__)


def _get_review_model():
    from app.models.review import AppReview
    return AppReview


# ── Listar valoraciones ───────────────────────────────────────────────────────

@reviews_bp.route("", methods=["GET"])
def list_reviews():
    """GET /api/reviews?page=1&per_page=20&stars=5&sort=recent — Público"""
    AppReview = _get_review_model()

    page     = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)
    stars    = request.args.get("stars")
    sort     = request.args.get("sort", "recent")

    query = AppReview.query
    if stars:
        query = query.filter_by(stars=int(stars))

    if sort == "top":
        query = query.order_by(AppReview.stars.desc(), AppReview.created_at.desc())
    elif sort == "oldest":
        query = query.order_by(AppReview.created_at.asc())
    else:
        query = query.order_by(AppReview.created_at.desc())

    total    = query.count()
    reviews  = query.limit(per_page).offset((page - 1) * per_page).all()

    # Stats
    all_reviews = AppReview.query.all()
    avg = round(sum(r.stars for r in all_reviews) / len(all_reviews), 1) if all_reviews else 0
    dist = {s: sum(1 for r in all_reviews if r.stars == s) for s in range(1, 6)}

    return jsonify({
        "reviews":  [r.to_dict() for r in reviews],
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "avg_rating": avg,
        "distribution": dist,
    }), 200


# ── Mi valoración ─────────────────────────────────────────────────────────────

@reviews_bp.route("/mine", methods=["GET"])
@jwt_required()
def my_review():
    AppReview = _get_review_model()
    user_id = int(get_jwt_identity())
    rev = AppReview.query.filter_by(user_id=user_id).first()
    return jsonify(rev.to_dict() if rev else None), 200


# ── Crear / actualizar valoración ─────────────────────────────────────────────

@reviews_bp.route("", methods=["POST"])
@jwt_required()
def create_or_update_review():
    AppReview = _get_review_model()
    user_id   = int(get_jwt_identity())
    data      = request.get_json(silent=True) or {}

    stars = int(data.get("stars", 5))
    if not (1 <= stars <= 5):
        return jsonify({"error": "BAD_REQUEST", "message": "stars debe estar entre 1 y 5"}), 400

    role = (data.get("role") or "").strip()
    text = (data.get("text") or "").strip()
    if len(text) < 1:
        return jsonify({"error": "BAD_REQUEST", "message": "La valoracion no puede estar vacia"}), 400
    if len(text) > 500:
        return jsonify({"error": "BAD_REQUEST", "message": "Máximo 500 caracteres"}), 400

    existing = AppReview.query.filter_by(user_id=user_id).first()
    if existing:
        existing.stars      = stars
        existing.role       = role or existing.role
        existing.text       = text
        existing.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({**existing.to_dict(), "updated": True}), 200
    else:
        from app.models.user import User
        user = User.query.get(user_id)
        rev  = AppReview(
            user_id    = user_id,
            stars      = stars,
            role       = role,
            text       = text,
            author_name = user.full_name or user.username if user else "Usuario",
        )
        db.session.add(rev)
        db.session.commit()

        # Gamificación
        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(user_id, "review_published", "review", rev.id)
        except Exception:
            pass

        return jsonify({**rev.to_dict(), "created": True}), 201


# ── Eliminar propia valoración ────────────────────────────────────────────────

@reviews_bp.route("/mine", methods=["DELETE"])
@jwt_required()
def delete_my_review():
    AppReview = _get_review_model()
    user_id   = int(get_jwt_identity())
    rev = AppReview.query.filter_by(user_id=user_id).first()
    if not rev:
        return jsonify({"error": "NOT_FOUND", "message": "No tienes valoración publicada"}), 404
    db.session.delete(rev)
    db.session.commit()
    return jsonify({"message": "Valoración eliminada"}), 200
