"""Soporte ligero de recompensas sin clasificacion publica."""
from __future__ import annotations

from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class GamificationService:
    """Compatibilidad para flujos que antes notificaban actividad competitiva."""

    @staticmethod
    def track_activity(
        user_id: int,
        activity_type: str,
        reference_type: str | None = None,
        reference_id: int | None = None,
    ) -> int:
        logger.debug(
            "Actividad registrada sin clasificacion user=%s type=%s ref=%s:%s",
            user_id,
            activity_type,
            reference_type,
            reference_id,
        )
        return 0

    @staticmethod
    def award_points(user_id: int, amount: int) -> dict:
        """La ruleta entrega monedas internas."""
        from app import db
        from app.services.economy_services import CoinService

        amount = max(0, int(amount or 0))
        if amount <= 0:
            return {"user_id": user_id, "coins_added": 0, "balance": CoinService.get_balance(user_id)}

        CoinService.credit(user_id, amount, "wheel_reward", "RewardGrant", None)
        db.session.flush()
        return {"user_id": user_id, "coins_added": amount, "balance": CoinService.get_balance(user_id)}

    @staticmethod
    def get_active_grants(user_id: int, reward_type: str | None = None):
        from app.models.reward import RewardGrant

        now = datetime.now(timezone.utc)
        query = RewardGrant.query.filter(
            RewardGrant.user_id == user_id,
            RewardGrant.status == "active",
        ).filter(
            (RewardGrant.expires_at.is_(None)) | (RewardGrant.expires_at > now)
        )
        if reward_type:
            query = query.filter(RewardGrant.reward_type == reward_type)
        return query.order_by(RewardGrant.granted_at.desc()).all()

    @staticmethod
    def is_effective_pro(user_id: int) -> bool:
        from app.models.user import User

        user = User.query.get(user_id)
        if user and str(user.subscription or "free").lower() == "pro":
            return True
        return bool(GamificationService.get_active_grants(user_id, "pro_trial"))

    @staticmethod
    def get_extra_alerts(user_id: int) -> int:
        return sum(int(g.reward_value or 0) for g in GamificationService.get_active_grants(user_id, "extra_alerts"))

    @staticmethod
    def get_premium_signal_unlocks(user_id: int) -> int:
        return sum(int(g.reward_value or 0) for g in GamificationService.get_active_grants(user_id, "premium_signals_unlock"))

    @staticmethod
    def get_badges(user_id: int) -> list[dict]:
        return [g.to_dict() for g in GamificationService.get_active_grants(user_id, "badge")]

    @staticmethod
    def recalculate_user(user_id: int) -> dict:
        return {"status": "disabled", "message": "La clasificacion publica esta desactivada.", "user_id": user_id}

    @staticmethod
    def recalculate_all() -> dict:
        return {"status": "disabled", "message": "La clasificacion publica esta desactivada."}

    @staticmethod
    def get_leaderboard(*_, **__) -> list[dict]:
        return []

    @staticmethod
    def get_user_position(user_id: int) -> dict:
        return {"user_id": user_id, "leaderboard_enabled": False}

    @staticmethod
    def get_activity_history(user_id: int, limit: int = 30) -> list[dict]:
        return []

    @staticmethod
    def invalidate_cache() -> None:
        try:
            from app import redis_client
            if redis_client:
                for key in redis_client.keys("leaderboard:*"):
                    redis_client.delete(key)
        except Exception:
            pass
