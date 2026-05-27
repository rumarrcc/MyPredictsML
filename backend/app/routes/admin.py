"""
Blueprint: /api/admin — Panel de administración (solo admins)
"""
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.user import User
from app.utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__)


# ── Estadísticas globales ──────────────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@jwt_required()
@admin_required
def get_stats():
    # mcajamar - 26/04/2026: protegí endpoints de administración con roles y permisos de usuario.
    from app.models.alert import Alert
    from app.models.prediction import Prediction
    from app.models.analysis import SharedAnalysis
    from app.models.backtest import BacktestResult

    total_users      = User.query.count()
    active_users     = User.query.filter_by(is_active=True, is_blocked=False).count()
    blocked_users    = User.query.filter_by(is_blocked=True).count()
    admin_users      = User.query.filter_by(role="admin").count()
    total_alerts     = Alert.query.count()
    active_alerts    = Alert.query.filter_by(is_active=True).count()
    total_predictions = Prediction.query.count()
    total_analyses   = SharedAnalysis.query.count()
    total_backtests  = BacktestResult.query.count()

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_users_week = User.query.filter(User.created_at >= week_ago).count()

    return jsonify({
        "users": {
            "total":         total_users,
            "active":        active_users,
            "blocked":       blocked_users,
            "admins":        admin_users,
            "new_this_week": new_users_week,
        },
        "alerts":      {"total": total_alerts,      "active": active_alerts},
        "predictions": {"total": total_predictions},
        "analyses":    {"total": total_analyses},
        "backtests":   {"total": total_backtests},
    }), 200


@admin_bp.route("/cache/status", methods=["GET"])
@jwt_required()
@admin_required
def cache_status():
    """GET /api/admin/cache/status — Estado basico de Redis/cache."""
    from app import redis_client

    redis_ok = False
    redis_info = {}
    try:
        if redis_client:
            redis_ok = bool(redis_client.ping())
            redis_info = {
                "dbsize": redis_client.dbsize(),
                "keys": {
                    "news": len(redis_client.keys("news:*")),
                    "ticker": len(redis_client.keys("ticker:*")),
                },
            }
    except Exception as exc:
        redis_info = {"error": str(exc)}

    return jsonify({
        "redis_connected": redis_ok,
        "redis": redis_info,
        "fallback": "memory" if not redis_ok else "redis",
    }), 200


@admin_bp.route("/cache/clear", methods=["POST", "DELETE"])
@jwt_required()
@admin_required
def clear_cache():
    """POST /api/admin/cache/clear — Limpia caches de noticias y stocks."""
    removed = {}

    try:
        from app.routes.news import clear_news_cache
        removed["news"] = clear_news_cache()
    except Exception as exc:
        removed["news_error"] = str(exc)

    try:
        from app.services.ticker_service import TickerService
        TickerService.invalidate_cache()
        removed["ticker"] = "ok"
    except Exception as exc:
        removed["ticker_error"] = str(exc)

    return jsonify({"status": "ok", "removed": removed}), 200


# ── Analytics / Gráficas ───────────────────────────────────────────────────

@admin_bp.route("/analytics", methods=["GET"])
@jwt_required()
@admin_required
def get_analytics():
    """
    Devuelve datos para gráficas del panel admin:
    - Registros de usuarios por día (últimos 30 días)
    - Predicciones por día (últimos 30 días)
    - Top 10 tickers más predichos
    - Top 10 usuarios más activos (predicciones)
    - Actividad del usuario individual si se pasa ?user_id=X
    """
    from app.models.prediction import Prediction
    from app.models.alert import Alert
    from sqlalchemy import func

    days = int(request.args.get("days", 30))
    user_id = request.args.get("user_id", type=int)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # ── Registros por día ─────────────────────────────────────────────────
    reg_rows = (
        db.session.query(
            func.date(User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= since)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )
    registrations = [{"date": str(r.day), "count": r.count} for r in reg_rows]

    # ── Predicciones por día ──────────────────────────────────────────────
    pred_q = db.session.query(
        func.date(Prediction.created_at).label("day"),
        func.count(Prediction.id).label("count"),
    ).filter(Prediction.created_at >= since)
    if user_id:
        pred_q = pred_q.filter(Prediction.user_id == user_id)
    pred_rows = (
        pred_q
        .group_by(func.date(Prediction.created_at))
        .order_by(func.date(Prediction.created_at))
        .all()
    )
    predictions_by_day = [{"date": str(r.day), "count": r.count} for r in pred_rows]

    # ── Top tickers ───────────────────────────────────────────────────────
    ticker_q = db.session.query(
        Prediction.ticker,
        func.count(Prediction.id).label("count"),
    )
    if user_id:
        ticker_q = ticker_q.filter(Prediction.user_id == user_id)
    top_tickers_rows = (
        ticker_q
        .group_by(Prediction.ticker)
        .order_by(func.count(Prediction.id).desc())
        .limit(10)
        .all()
    )
    top_tickers = [{"ticker": r.ticker, "count": r.count} for r in top_tickers_rows]

    # ── Top usuarios más activos (solo en vista global) ───────────────────
    top_users = []
    if not user_id:
        top_u_rows = (
            db.session.query(
                User.id, User.username,
                func.count(Prediction.id).label("pred_count"),
            )
            .join(Prediction, Prediction.user_id == User.id, isouter=True)
            .group_by(User.id, User.username)
            .order_by(func.count(Prediction.id).desc())
            .limit(10)
            .all()
        )
        top_users = [
            {"user_id": r.id, "username": r.username, "predictions": r.pred_count}
            for r in top_u_rows
        ]

    # ── Resumen individual (solo si user_id) ──────────────────────────────
    user_summary = None
    if user_id:
        u = User.query.get(user_id)
        if u:
            alert_count   = Alert.query.filter_by(user_id=user_id).count()
            pred_count    = Prediction.query.filter_by(user_id=user_id).count()
            user_summary  = {
                "id":         u.id,
                "username":   u.username,
                "email":      u.email,
                "role":       u.role,
                "is_blocked": u.is_blocked,
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "joined_at":  u.created_at.isoformat() if u.created_at else None,
                "total_predictions": pred_count,
                "total_alerts":      alert_count,
            }

    return jsonify({
        "registrations":     registrations,
        "predictions_by_day": predictions_by_day,
        "top_tickers":       top_tickers,
        "top_users":         top_users,
        "user_summary":      user_summary,
        "days":              days,
    }), 200


# ── Gestión de alertas ─────────────────────────────────────────────────────

@admin_bp.route("/alerts", methods=["GET"])
@jwt_required()
@admin_required
def list_alerts():
    from app.models.alert import Alert
    page     = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 100)
    search   = (request.args.get("search") or "").strip()
    user_id  = request.args.get("user_id", type=int)
    active   = request.args.get("active")

    query = Alert.query
    if search:
        query = query.filter(Alert.ticker.ilike(f"%{search}%"))
    if user_id:
        query = query.filter_by(user_id=user_id)
    if active is not None:
        query = query.filter_by(is_active=(active.lower() == "true"))

    pagination = query.order_by(Alert.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    alerts = []
    for a in pagination.items:
        d = a.to_dict()
        d["username"] = a.user.username if a.user else "—"
        alerts.append(d)

    return jsonify({
        "alerts":   alerts,
        "total":    pagination.total,
        "page":     page,
        "per_page": per_page,
        "pages":    pagination.pages,
    }), 200


@admin_bp.route("/alerts/<int:alert_id>", methods=["DELETE"])
@jwt_required()
@admin_required
def delete_alert(alert_id: int):
    from app.models.alert import Alert
    alert = Alert.query.get_or_404(alert_id)
    ticker = alert.ticker
    db.session.delete(alert)
    db.session.commit()
    return jsonify({"message": f"Alerta de {ticker} eliminada"}), 200


# ── Monitor de datos (estado de tickers en BD) ────────────────────────────

@admin_bp.route("/data-status", methods=["GET"])
@jwt_required()
@admin_required
def data_status():
    """
    Devuelve el estado de frescura de cada ticker en la BD.
    Frontend hace polling cada ~5s para mostrar monitor en tiempo real.
    """
    from app.models.stock_data import StockData
    from sqlalchemy import func

    # Obtener el último registro por ticker y cuándo fue actualizado
    rows = (
        db.session.query(
            StockData.ticker,
            func.max(StockData.date).label("last_date"),
            func.max(StockData.created_at).label("last_updated"),
            func.count(StockData.id).label("total_rows"),
        )
        .group_by(StockData.ticker)
        .order_by(StockData.ticker)
        .all()
    )

    now = datetime.now(timezone.utc)
    tickers = []
    for r in rows:
        last_upd = r.last_updated
        if last_upd and last_upd.tzinfo is None:
            last_upd = last_upd.replace(tzinfo=timezone.utc)
        age_hours = (now - last_upd).total_seconds() / 3600 if last_upd else 999
        tickers.append({
            "ticker":       r.ticker,
            "last_date":    str(r.last_date),
            "last_updated": last_upd.isoformat() if last_upd else None,
            "age_hours":    round(age_hours, 2),
            "total_rows":   r.total_rows,
            # fresco < 2h, reciente < 24h, antiguo >= 24h
            "status":       "fresh" if age_hours < 2 else ("recent" if age_hours < 24 else "stale"),
        })

    fresh  = sum(1 for t in tickers if t["status"] == "fresh")
    recent = sum(1 for t in tickers if t["status"] == "recent")
    stale  = sum(1 for t in tickers if t["status"] == "stale")

    return jsonify({
        "tickers":    tickers,
        "summary":    {"fresh": fresh, "recent": recent, "stale": stale, "total": len(tickers)},
        "checked_at": now.isoformat(),
    }), 200


# ── Gestión de usuarios ────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@jwt_required()
@admin_required
def list_users():
    page     = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 100)
    search   = (request.args.get("search") or "").strip()
    role     = request.args.get("role")

    query = User.query
    if search:
        query = query.filter(
            User.username.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%") |
            User.full_name.ilike(f"%{search}%")
        )
    if role:
        query = query.filter_by(role=role)

    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        "users":    [u.to_dict(include_stats=True) for u in pagination.items],
        "total":    pagination.total,
        "page":     page,
        "per_page": per_page,
        "pages":    pagination.pages,
    }), 200


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@jwt_required()
@admin_required
def get_user(user_id: int):
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict(include_stats=True)), 200


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@jwt_required()
@admin_required
def update_user(user_id: int):
    current_admin_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    if user_id == current_admin_id and data.get("role") == "user":
        return jsonify({"error": "BAD_REQUEST", "message": "No puedes degradar tu propio rol", "status": 400}), 400

    for field in ["role", "is_blocked", "is_active"]:
        if field in data:
            setattr(user, field, data[field])

    db.session.commit()
    return jsonify({**user.to_dict(), "message": "Usuario actualizado"}), 200


@admin_bp.route("/users/<int:user_id>/block", methods=["POST"])
@jwt_required()
@admin_required
def block_user(user_id: int):
    current_admin_id = int(get_jwt_identity())
    if user_id == current_admin_id:
        return jsonify({"error": "BAD_REQUEST", "message": "No puedes bloquearte a ti mismo", "status": 400}), 400
    user = User.query.get_or_404(user_id)
    user.is_blocked = True
    db.session.commit()
    return jsonify({"message": f"@{user.username} bloqueado", "user": user.to_dict()}), 200


@admin_bp.route("/users/<int:user_id>/unblock", methods=["POST"])
@jwt_required()
@admin_required
def unblock_user(user_id: int):
    user = User.query.get_or_404(user_id)
    user.is_blocked = False
    db.session.commit()
    return jsonify({"message": f"@{user.username} desbloqueado", "user": user.to_dict()}), 200


@admin_bp.route("/users/<int:user_id>/promote", methods=["POST"])
@jwt_required()
@admin_required
def promote_user(user_id: int):
    user = User.query.get_or_404(user_id)
    user.role = "admin"
    db.session.commit()
    return jsonify({"message": f"@{user.username} promovido a admin", "user": user.to_dict()}), 200


@admin_bp.route("/users/<int:user_id>/demote", methods=["POST"])
@jwt_required()
@admin_required
def demote_user(user_id: int):
    current_admin_id = int(get_jwt_identity())
    if user_id == current_admin_id:
        return jsonify({"error": "BAD_REQUEST", "message": "No puedes degradar tu propio rol", "status": 400}), 400
    user = User.query.get_or_404(user_id)
    user.role = "user"
    db.session.commit()
    return jsonify({"message": f"@{user.username} degradado a usuario", "user": user.to_dict()}), 200

