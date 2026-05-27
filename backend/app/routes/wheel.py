"""
Blueprints de ruleta diaria y recompensas.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.utils.decorators import admin_required

wheel_bp = Blueprint("wheel", __name__)
rewards_bp = Blueprint("rewards", __name__)
admin_wheel_bp = Blueprint("admin_wheel", __name__)


def _uid() -> int:
    return int(get_jwt_identity())


@wheel_bp.route("/status", methods=["GET"])
@jwt_required()
def wheel_status():
    from app.services.reward_service import RewardService
    return jsonify(RewardService.get_status(_uid())), 200


@wheel_bp.route("/spin", methods=["POST"])
@jwt_required()
def wheel_spin():
    from app.services.reward_service import RewardService
    result = RewardService.spin(_uid())
    status = 200 if result.get("status") == "ok" else 409 if result.get("status") in ("limit_reached", "locked") else 500
    return jsonify(result), status


@rewards_bp.route("/me", methods=["GET"])
@jwt_required()
def my_rewards():
    from app.services.reward_service import RewardService
    return jsonify(RewardService.get_rewards_summary(_uid())), 200


@rewards_bp.route("/history", methods=["GET"])
@jwt_required()
def reward_history():
    from app.services.reward_service import RewardService
    limit = min(max(int(request.args.get("limit", 50)), 1), 100)
    return jsonify(RewardService.get_reward_history(_uid(), limit=limit)), 200


@admin_wheel_bp.route("/grant", methods=["POST"])
@jwt_required()
@admin_required
def admin_grant_reward():
    from app.services.reward_service import RewardService

    data = request.get_json(silent=True) or {}
    raw_user_id = data.get("user_id")
    reward_type = (data.get("reward_type") or "").strip()
    reward_value = data.get("reward_value")
    expires_hours = data.get("expires_hours")
    if not raw_user_id or not reward_type:
        return jsonify({"error": "BAD_REQUEST", "message": "user_id y reward_type requeridos", "status": 400}), 400

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "BAD_REQUEST", "message": "user_id inválido", "status": 400}), 400

    grant = RewardService.admin_grant(user_id, reward_type, reward_value, expires_hours=expires_hours)
    return jsonify({"status": "ok", "grant": grant}), 200


@admin_wheel_bp.route("/stats", methods=["GET"])
@jwt_required()
@admin_required
def admin_wheel_stats():
    from app.services.reward_service import RewardService
    return jsonify(RewardService.admin_stats()), 200
