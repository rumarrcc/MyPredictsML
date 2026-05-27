"""
Blueprint: /api/community — Análisis compartidos, likes y comentarios
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request

from app import db
from app.models.analysis import SharedAnalysis, AnalysisComment, AnalysisLike

community_bp = Blueprint("community", __name__)


# ── Análisis ───────────────────────────────────────────────────────────────

@community_bp.route("/share", methods=["POST"])
@jwt_required()
def share_analysis():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    ticker = (data.get("ticker") or "").strip().upper()
    if not title or not ticker:
        return jsonify({"error": "BAD_REQUEST", "message": "title y ticker son requeridos", "status": 400}), 400

    analysis = SharedAnalysis(
        user_id=user_id,
        ticker=ticker,
        title=title,
        description=data.get("description"),
        models_compared=data.get("models_compared", []),
        prediction_summary=data.get("prediction_summary"),
        technical_summary=data.get("technical_summary"),
        backtest_id=data.get("backtest_id"),
        is_public=data.get("is_public", True),
    )
    db.session.add(analysis)
    db.session.commit()

    # Gamificación
    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(user_id, "analysis_shared", "analysis", analysis.id)
    except Exception:
        pass

    return jsonify(analysis.to_dict(include_user=True)), 201


@community_bp.route("/analyses", methods=["GET"])
def list_analyses():
    """GET /api/community/analyses?sort=trending&limit=20 — Público"""
    _ensure_starter_community()

    sort = request.args.get("sort_by") or request.args.get("sort") or "recent"
    limit = request.args.get("per_page") or request.args.get("limit") or 20
    limit = min(max(int(limit), 1), 100)
    page = max(int(request.args.get("page", 1)), 1)
    offset = (page - 1) * limit
    ticker = request.args.get("ticker")
    search = (request.args.get("search") or "").strip()

    query = SharedAnalysis.query.filter_by(is_public=True)
    if ticker:
        query = query.filter_by(ticker=ticker.upper())
    if search:
        from sqlalchemy import or_
        query = query.filter(or_(
            SharedAnalysis.ticker.ilike(f"%{search.upper()}%"),
            SharedAnalysis.title.ilike(f"%{search}%"),
            SharedAnalysis.description.ilike(f"%{search}%"),
        ))

    if sort == "trending":
        query = query.order_by(SharedAnalysis.views_count.desc(), SharedAnalysis.likes_count.desc())
    elif sort == "likes":
        query = query.order_by(SharedAnalysis.likes_count.desc())
    elif sort == "views":
        query = query.order_by(SharedAnalysis.views_count.desc())
    elif sort == "comments":
        query = query.order_by(SharedAnalysis.comments_count.desc())
    else:
        query = query.order_by(SharedAnalysis.created_at.desc())

    total = query.count()
    analyses = query.limit(limit).offset(offset).all()

    return jsonify({
        "analyses": [a.to_dict(include_user=True) for a in analyses],
        "total": total,
        "page": page,
        "per_page": limit,
    }), 200


@community_bp.route("/analyses/<int:analysis_id>", methods=["GET"])
def get_analysis(analysis_id: int):
    analysis = SharedAnalysis.query.get_or_404(analysis_id)
    if not analysis.is_public:
        # Verificar si es el autor
        try:
            verify_jwt_in_request(optional=True)
            from flask_jwt_extended import get_jwt_identity
            uid = get_jwt_identity()
            if not uid or int(uid) != analysis.user_id:
                return jsonify({"error": "FORBIDDEN", "message": "Análisis privado", "status": 403}), 403
        except Exception:
            return jsonify({"error": "FORBIDDEN", "message": "Análisis privado", "status": 403}), 403

    # Incrementar vistas
    analysis.views_count = (analysis.views_count or 0) + 1
    db.session.commit()

    data = analysis.to_dict(include_user=True)
    data["comments"] = [c.to_dict() for c in analysis.comments.order_by(AnalysisComment.created_at.desc()).limit(20)]
    return jsonify(data), 200


@community_bp.route("/analyses/<int:analysis_id>", methods=["DELETE"])
@jwt_required()
def delete_analysis(analysis_id: int):
    user_id = int(get_jwt_identity())
    analysis = SharedAnalysis.query.get_or_404(analysis_id)
    if analysis.user_id != user_id:
        return jsonify({"error": "FORBIDDEN", "message": "No autorizado", "status": 403}), 403
    db.session.delete(analysis)
    db.session.commit()
    return jsonify({"message": "Análisis eliminado"}), 200


# ── Likes ──────────────────────────────────────────────────────────────────

@community_bp.route("/analyses/<int:analysis_id>/like", methods=["POST"])
@jwt_required()
def like_analysis(analysis_id: int):
    user_id = int(get_jwt_identity())
    analysis = SharedAnalysis.query.get_or_404(analysis_id)

    existing = AnalysisLike.query.filter_by(analysis_id=analysis_id, user_id=user_id).first()
    if existing:
        # Toggle: quitar like
        db.session.delete(existing)
        analysis.likes_count = max(0, (analysis.likes_count or 0) - 1)
        db.session.commit()
        return jsonify({"analysis_id": analysis_id, "user_id": user_id, "liked": False, "total_likes": analysis.likes_count}), 200

    like = AnalysisLike(analysis_id=analysis_id, user_id=user_id)
    db.session.add(like)
    analysis.likes_count = (analysis.likes_count or 0) + 1
    db.session.commit()

    return jsonify({
        "analysis_id": analysis_id,
        "user_id": user_id,
        "liked": True,
        "total_likes": analysis.likes_count,
    }), 201


# ── Comentarios ────────────────────────────────────────────────────────────

@community_bp.route("/analyses/<int:analysis_id>/comments", methods=["POST"])
@jwt_required()
def add_comment(analysis_id: int):
    user_id = int(get_jwt_identity())
    analysis = SharedAnalysis.query.get_or_404(analysis_id)
    data = request.get_json(silent=True) or {}

    comment_text = (data.get("comment") or "").strip()
    if not comment_text:
        return jsonify({"error": "BAD_REQUEST", "message": "comment requerido", "status": 400}), 400
    if len(comment_text) > 2000:
        return jsonify({"error": "BAD_REQUEST", "message": "Comentario demasiado largo (max 2000 chars)", "status": 400}), 400

    comment = AnalysisComment(
        analysis_id=analysis_id,
        user_id=user_id,
        comment=comment_text,
    )
    db.session.add(comment)
    analysis.comments_count = (analysis.comments_count or 0) + 1
    db.session.commit()

    return jsonify(comment.to_dict()), 201


@community_bp.route("/analyses/<int:analysis_id>/comments", methods=["GET"])
def get_comments(analysis_id: int):
    limit = min(int(request.args.get("limit", 20)), 100)
    offset = int(request.args.get("offset", 0))

    analysis = SharedAnalysis.query.get_or_404(analysis_id)
    total = analysis.comments.count()
    comments = analysis.comments.order_by(AnalysisComment.created_at.desc()).limit(limit).offset(offset).all()

    return jsonify({
        "comments": [c.to_dict() for c in comments],
        "total": total,
    }), 200


@community_bp.route("/top-analysis", methods=["GET"])
def top_analysis():
    """GET /api/community/top-analysis — Top análisis de la semana"""
    _ensure_starter_community()
    from datetime import datetime, timedelta, timezone
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    analyses = (
        SharedAnalysis.query
        .filter(SharedAnalysis.is_public == True, SharedAnalysis.created_at >= week_ago)
        .order_by(SharedAnalysis.likes_count.desc())
        .limit(10)
        .all()
    )
    return jsonify({"analyses": [a.to_dict(include_user=True) for a in analyses]}), 200


def _ensure_starter_community() -> None:
    """Crea un feed inicial si community esta vacio."""
    try:
        if SharedAnalysis.query.filter_by(is_public=True).first():
            return

        from app.models.user import User

        user = User.query.filter_by(username="mypredicts").first()
        if not user:
            user = User(
                username="mypredicts",
                email="community@mypredicts.local",
                full_name="MyPredicts",
                role="user",
                subscription="pro",
                email_verified=True,
            )
            user.set_password("ChangeMe123!")
            db.session.add(user)
            db.session.flush()

        starter_items = [
            {
                "ticker": "NVDA",
                "title": "NVDA mantiene momentum, pero el volumen manda",
                "description": "Lectura combinada de tendencia, soportes y riesgo de sobreextension tras el ultimo impulso.",
                "models_compared": ["sma", "arima"],
                "prediction_summary": {"trend": "bullish", "confidence": 0.72},
                "technical_summary": "MA20 por encima de MA50 y precio cerca de resistencia. Esperaria confirmacion de volumen.",
                "likes_count": 18,
                "views_count": 142,
                "comments_count": 4,
            },
            {
                "ticker": "AAPL",
                "title": "AAPL en zona de acumulacion",
                "description": "El precio lateraliza y el RSI se estabiliza. Buen candidato para vigilar ruptura del rango.",
                "models_compared": ["prophet", "sma"],
                "prediction_summary": {"trend": "neutral", "confidence": 0.61},
                "technical_summary": "Rango claro con soporte defendido. La entrada depende de cierre sobre resistencia.",
                "likes_count": 11,
                "views_count": 96,
                "comments_count": 2,
            },
            {
                "ticker": "TSLA",
                "title": "TSLA: volatilidad alta, setup solo para perfil agresivo",
                "description": "El backtest favorece posiciones pequenas; la direccion mejora cuando baja la volatilidad intradia.",
                "models_compared": ["arima", "sma"],
                "prediction_summary": {"trend": "volatile", "confidence": 0.55},
                "technical_summary": "Senales mixtas: momentum corto positivo, tendencia media aun irregular.",
                "likes_count": 9,
                "views_count": 121,
                "comments_count": 3,
            },
        ]

        for item in starter_items:
            db.session.add(SharedAnalysis(user_id=user.id, is_public=True, **item))
        db.session.commit()
    except Exception:
        db.session.rollback()
