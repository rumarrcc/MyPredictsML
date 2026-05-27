"""
RewardService — ruleta diaria, monedas internas y beneficios activos.

Economia:
- Las monedas internas viven en users.internal_coins y coin_transactions.
- PRO temporal se modela como reward_grants activo, no modifica subscription real.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from random import SystemRandom
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app import db

logger = logging.getLogger(__name__)
_rng = SystemRandom()

FREE_SPINS_PER_DAY = 1
PRO_SPINS_PER_DAY = 2


def _wheel_timezone():
    try:
        return ZoneInfo(os.environ.get("APP_TIMEZONE", "Europe/Madrid"))
    except Exception:
        return timezone.utc

FREE_REWARDS = [
    {"type": "points", "value": 10, "weight": 28, "label": "10 puntos"},
    {"type": "points", "value": 20, "weight": 20, "label": "20 puntos"},
    {"type": "extra_alerts", "value": 1, "weight": 15, "label": "+1 alerta extra"},
    {"type": "extra_alerts", "value": 2, "weight": 9, "label": "+2 alertas extra"},
    {"type": "premium_signals_unlock", "value": 1, "weight": 8, "label": "1 estrategia premium extra"},
    {"type": "score_boost", "value": 2, "weight": 5, "label": "Boost score +2"},
    {"type": "badge", "value": "lucky_day", "weight": 5, "label": "Badge Lucky Day"},
    {"type": "discount_coupon", "value": 5, "weight": 5, "label": "Cupón 5%"},
    {"type": "pro_trial", "value": 12, "weight": 2, "label": "PRO 12h"},
    {"type": "no_prize", "value": 0, "weight": 3, "label": "Inténtalo mañana"},
]

PRO_REWARDS = [
    {"type": "points", "value": 20, "weight": 25, "label": "20 puntos"},
    {"type": "points", "value": 35, "weight": 22, "label": "35 puntos"},
    {"type": "extra_alerts", "value": 2, "weight": 14, "label": "+2 alertas extra"},
    {"type": "premium_signals_unlock", "value": 2, "weight": 12, "label": "2 estrategias extra"},
    {"type": "score_boost", "value": 3, "weight": 8, "label": "Boost score +3"},
    {"type": "badge", "value": "pro_spinner", "weight": 7, "label": "Badge PRO Spinner"},
    {"type": "discount_coupon", "value": 10, "weight": 7, "label": "Cupón 10%"},
    {"type": "points", "value": 50, "weight": 3, "label": "50 puntos"},
    {"type": "no_prize", "value": 0, "weight": 2, "label": "Inténtalo mañana"},
]

REWARD_MESSAGES = {
    "points": "Puntos añadidos a tu saldo.",
    "extra_alerts": "Alertas extra activas durante 24h.",
    "premium_signals_unlock": "Estrategias premium extra desbloqueadas durante 24h.",
    "pro_trial": "Acceso PRO temporal activado sin tocar tu suscripción real.",
    "discount_coupon": "Cupón creado para una futura suscripción.",
    "badge": "Nueva insignia añadida a tu perfil.",
    "score_boost": "Descuento temporal activado.",
    "no_prize": "Hoy no hubo premio. Mañana la ruleta vuelve a estar lista.",
}


class RewardService:
    @staticmethod
    def get_effective_plan(user_id: int) -> str:
        from app.services.gamification_service import GamificationService
        return "pro" if GamificationService.is_effective_pro(user_id) else "free"

    @staticmethod
    def daily_spin_limit(user_id: int) -> int:
        return PRO_SPINS_PER_DAY if RewardService.get_effective_plan(user_id) == "pro" else FREE_SPINS_PER_DAY

    @staticmethod
    def _today() -> datetime.date:
        return datetime.now(_wheel_timezone()).date()

    @staticmethod
    def _next_midnight_iso() -> str:
        tz = _wheel_timezone()
        now = datetime.now(tz)
        nxt = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return nxt.isoformat()

    @staticmethod
    def _table_for(user_id: int) -> list[dict]:
        return PRO_REWARDS if RewardService.get_effective_plan(user_id) == "pro" else FREE_REWARDS

    @staticmethod
    def get_status(user_id: int) -> dict:
        from app.models.reward import WheelSpin
        from app.services.economy_services import CoinService

        today = RewardService._today()
        max_spins = RewardService.daily_spin_limit(user_id)
        used = WheelSpin.query.filter_by(user_id=user_id, spin_date=today).count()
        table = RewardService._table_for(user_id)

        return {
            "can_spin": used < max_spins,
            "spins_used": used,
            "spins_remaining": max(0, max_spins - used),
            "max_spins": max_spins,
            "next_available_at": RewardService._next_midnight_iso(),
            "plan": RewardService.get_effective_plan(user_id),
            "points_balance": CoinService.get_balance(user_id),
            "balance": CoinService.get_balance(user_id),
            "probabilities": [{"reward_type": r["type"], "label": r["label"]} for r in table],
        }

    @staticmethod
    def spin(user_id: int) -> dict:
        from app.models.reward import WheelSpin
        from app.services.gamification_service import GamificationService

        lock_key = f"wheel:spin:{user_id}:{RewardService._today().isoformat()}"
        lock_acquired = RewardService._acquire_lock(lock_key)
        if not lock_acquired:
            return {"status": "locked", "message": "Ya hay un giro en curso. Espera unos segundos.", **RewardService.get_status(user_id)}

        try:
            today = RewardService._today()
            max_spins = RewardService.daily_spin_limit(user_id)
            used = WheelSpin.query.filter_by(user_id=user_id, spin_date=today).count()
            if used >= max_spins:
                return {
                    "status": "limit_reached",
                    "message": "Ya has usado tus giros de hoy.",
                    **RewardService.get_status(user_id),
                }

            reward = RewardService._pick_reward(RewardService._table_for(user_id))
            reward = RewardService._adapt_reward(user_id, reward)
            spin_number = used + 1
            grant = RewardService._apply_reward(user_id, reward, source="wheel")

            spin = WheelSpin(
                user_id=user_id,
                spin_date=today,
                spin_number=spin_number,
                reward_type=reward["type"],
                reward_value=str(reward["value"]),
                reward_grant_id=grant.id if grant else None,
                is_bonus_spin=spin_number > 1,
            )
            spin.set_probability_snapshot({
                "plan": RewardService.get_effective_plan(user_id),
                "table": [{"type": r["type"], "value": r["value"], "weight": r["weight"]} for r in RewardService._table_for(user_id)],
            })
            db.session.add(spin)

            GamificationService.track_activity(user_id, "wheel_spin", "wheel_spin", None)
            RewardService._maybe_award_badges(user_id)
            db.session.commit()
            RewardService.invalidate_cache(user_id)

            status = RewardService.get_status(user_id)
            return {
                "status": "ok",
                "reward": RewardService._reward_payload(reward, grant),
                "message": REWARD_MESSAGES.get(reward["type"], "Recompensa concedida."),
                **status,
            }
        except IntegrityError:
            db.session.rollback()
            return {"status": "limit_reached", "message": "Giro diario ya registrado.", **RewardService.get_status(user_id)}
        except Exception as exc:
            db.session.rollback()
            logger.exception("wheel spin error user=%s: %s", user_id, exc)
            return {"status": "error", "message": "No se pudo resolver la ruleta.", **RewardService.get_status(user_id)}
        finally:
            RewardService._release_lock(lock_key)

    @staticmethod
    def _pick_reward(table: list[dict]) -> dict:
        total = sum(int(r["weight"]) for r in table)
        ticket = _rng.uniform(0, total)
        acc = 0
        for reward in table:
            acc += int(reward["weight"])
            if ticket <= acc:
                return dict(reward)
        return dict(table[-1])

    @staticmethod
    def _adapt_reward(user_id: int, reward: dict) -> dict:
        """Convierte premios que no aplican para usuarios PRO."""
        if reward["type"] == "pro_trial" and RewardService.get_effective_plan(user_id) == "pro":
            return {"type": "points", "value": 35, "weight": reward["weight"], "label": "35 puntos"}
        return reward

    @staticmethod
    def _apply_reward(user_id: int, reward: dict, source: str = "wheel"):
        from app.models.reward import RewardGrant, DiscountCoupon
        from app.services.gamification_service import GamificationService

        rtype = reward["type"]
        value = reward["value"]
        now = datetime.now(timezone.utc)
        expires_at = None
        status = "active"
        metadata = {"label": reward.get("label")}

        if rtype == "no_prize":
            return None
        if rtype == "points":
            GamificationService.award_points(user_id, int(value))
            status = "used"
        elif rtype in ("extra_alerts", "premium_signals_unlock"):
            expires_at = now + timedelta(hours=24)
        elif rtype == "pro_trial":
            expires_at = now + timedelta(hours=int(value))
        elif rtype == "score_boost":
            expires_at = now + timedelta(days=3)
        elif rtype == "discount_coupon":
            expires_at = now + timedelta(days=14)
            code = RewardService._coupon_code(int(value))
            coupon = DiscountCoupon(
                user_id=user_id,
                code=code,
                discount_percent=int(value),
                source=source,
                expires_at=expires_at,
            )
            db.session.add(coupon)
            db.session.flush()
            metadata.update({"coupon_id": coupon.id, "code": code})
            GamificationService.track_activity(user_id, "coupon_earned", "discount_coupon", coupon.id)
        elif rtype == "badge":
            existing = RewardGrant.query.filter_by(user_id=user_id, reward_type="badge", reward_value=str(value)).first()
            if existing:
                return existing
            GamificationService.track_activity(user_id, "badge_earned", "badge", None)

        grant = RewardGrant(
            user_id=user_id,
            reward_type=rtype,
            reward_value=str(value),
            source=source,
            status=status,
            expires_at=expires_at,
        )
        grant.set_metadata(metadata)
        db.session.add(grant)
        db.session.flush()
        GamificationService.track_activity(user_id, "reward_claimed", "reward", grant.id)
        return grant

    @staticmethod
    def _maybe_award_badges(user_id: int) -> None:
        from app.models.reward import RewardGrant, WheelSpin

        spin_count = WheelSpin.query.filter_by(user_id=user_id).count()
        checks = []
        if spin_count >= 1:
            checks.append(("first_spin", "Primer giro"))
        if spin_count >= 5:
            checks.append(("spin_5", "Cinco giros"))
        if spin_count >= 15:
            checks.append(("spin_15", "Quince giros"))

        for badge_id, label in checks:
            exists = RewardGrant.query.filter_by(user_id=user_id, reward_type="badge", reward_value=badge_id).first()
            if exists:
                continue
            grant = RewardGrant(
                user_id=user_id,
                reward_type="badge",
                reward_value=badge_id,
                source="system",
                status="active",
            )
            grant.set_metadata({"label": label})
            db.session.add(grant)

    @staticmethod
    def get_rewards_summary(user_id: int) -> dict:
        from app.models.reward import RewardGrant, DiscountCoupon
        from app.models.economy import CoinTransaction
        from app.services.economy_services import CoinService
        from app.services.gamification_service import GamificationService

        active = GamificationService.get_active_grants(user_id)
        lifetime_points = (
            db.session.query(func.coalesce(func.sum(CoinTransaction.amount), 0))
            .filter(
                CoinTransaction.user_id == user_id,
                CoinTransaction.type == "credit",
            )
            .scalar()
            or 0
        )
        coupons = (
            DiscountCoupon.query
            .filter(DiscountCoupon.user_id == user_id, DiscountCoupon.is_used == False, DiscountCoupon.expires_at > datetime.now(timezone.utc))
            .order_by(DiscountCoupon.created_at.desc())
            .all()
        )
        badges = [g.to_dict() for g in active if g.reward_type == "badge"]
        benefits = {
            "effective_plan": RewardService.get_effective_plan(user_id),
            "extra_alerts": GamificationService.get_extra_alerts(user_id),
            "premium_signals_unlock": GamificationService.get_premium_signal_unlocks(user_id),
            "pro_trial_active": bool(GamificationService.get_active_grants(user_id, "pro_trial")),
            "score_boost": sum(int(g.reward_value or 0) for g in active if g.reward_type == "score_boost"),
        }

        return {
            "points_balance": CoinService.get_balance(user_id),
            "balance": CoinService.get_balance(user_id),
            "lifetime_points": int(lifetime_points or 0),
            "active_rewards": [g.to_dict() for g in active if g.reward_type not in ("badge",)],
            "coupons": [c.to_dict() for c in coupons],
            "badges": badges,
            "benefits": benefits,
        }

    @staticmethod
    def get_reward_history(user_id: int, limit: int = 50) -> dict:
        from app.models.reward import RewardGrant, WheelSpin

        grants = (
            RewardGrant.query
            .filter_by(user_id=user_id)
            .order_by(RewardGrant.granted_at.desc())
            .limit(limit)
            .all()
        )
        spins = (
            WheelSpin.query
            .filter_by(user_id=user_id)
            .order_by(WheelSpin.created_at.desc())
            .limit(limit)
            .all()
        )
        return {"rewards": [g.to_dict() for g in grants], "spins": [s.to_dict() for s in spins]}

    @staticmethod
    def admin_grant(user_id: int, reward_type: str, reward_value, expires_hours: int | None = None) -> dict:
        reward = {"type": reward_type, "value": reward_value, "label": f"{reward_type} {reward_value}"}
        grant = RewardService._apply_reward(user_id, reward, source="admin")
        if grant and expires_hours and reward_type not in ("points", "discount_coupon"):
            grant.expires_at = datetime.now(timezone.utc) + timedelta(hours=int(expires_hours))
        db.session.commit()
        RewardService.invalidate_cache(user_id)
        return grant.to_dict() if grant else {"reward_type": "no_prize"}

    @staticmethod
    def admin_stats() -> dict:
        from app.models.reward import WheelSpin, RewardGrant

        total_spins = WheelSpin.query.count()
        distribution = (
            db.session.query(WheelSpin.reward_type, func.count(WheelSpin.id))
            .group_by(WheelSpin.reward_type)
            .all()
        )
        grants = (
            db.session.query(RewardGrant.reward_type, RewardGrant.status, func.count(RewardGrant.id))
            .group_by(RewardGrant.reward_type, RewardGrant.status)
            .all()
        )
        pro_spins = WheelSpin.query.filter(WheelSpin.is_bonus_spin == True).count()
        return {
            "total_spins": total_spins,
            "bonus_or_second_spins": pro_spins,
            "reward_distribution": [{"reward_type": r, "count": c} for r, c in distribution],
            "grant_distribution": [{"reward_type": r, "status": s, "count": c} for r, s, c in grants],
            "economy_note": "Recompensas de coste real bajo: puntos internos, boosts temporales, cupones pequeños y trials cortos.",
        }

    @staticmethod
    def _reward_payload(reward: dict, grant) -> dict:
        data = {
            "reward_type": reward["type"],
            "reward_value": reward["value"],
            "label": reward.get("label"),
            "message": REWARD_MESSAGES.get(reward["type"]),
        }
        if grant:
            data["grant"] = grant.to_dict()
        return data

    @staticmethod
    def _coupon_code(percent: int) -> str:
        return f"MP{percent}-{secrets.token_hex(4).upper()}"

    @staticmethod
    def _acquire_lock(key: str) -> bool:
        try:
            from app import redis_client
            if redis_client:
                return bool(redis_client.set(key, "1", nx=True, ex=10))
        except Exception:
            pass
        return True

    @staticmethod
    def _release_lock(key: str) -> None:
        try:
            from app import redis_client
            if redis_client:
                redis_client.delete(key)
        except Exception:
            pass

    @staticmethod
    def invalidate_cache(user_id: int | None = None) -> None:
        try:
            from app import redis_client
            if redis_client and user_id:
                redis_client.delete(f"wheel:status:{user_id}")
        except Exception:
            pass

