"""
SubscriptionService — fuente única de verdad para planes y límites de funcionalidad.

Jerarquía de resolución del plan efectivo (de mayor a menor prioridad):
  1. Recompensas activas de la ruleta (reward_grants con reward_type='pro_trial' o 'premium_trial')
  2. Suscripción activa en la tabla subscriptions (Stripe u otro proveedor)
  3. Campo cacheado user.subscription ('free'|'pro'|'premium')
  4. Fallback: 'free'

PLAN_LIMITS es la única fuente de verdad para todos los límites de funcionalidades.
Nunca duplicar esta lógica en los endpoints — siempre usar SubscriptionService.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Plan limits ────────────────────────────────────────────────────────────────
# None = sin límite
_PRO_LIMITS = {
    "max_alerts":          None,
    "signals_per_day":     None,
    "backtests_per_day":   None,
    "can_sell_strategies": True,
    "can_buy_strategies":  True,
    "can_export":          True,
    "api_access":          True,
    "wheel_spins":         2,
    "max_portfolios":      None,
    "max_watchlist":       None,
}

PLAN_LIMITS: dict[str, dict[str, Any]] = {
    "free": {
        "max_alerts":          3,
        "signals_per_day":     2,
        "backtests_per_day":   0,       # Sin backtesting en free
        "can_sell_strategies": False,
        "can_buy_strategies":  True,
        "can_export":          False,
        "api_access":          False,
        "wheel_spins":         1,
        "max_portfolios":      1,
        "max_watchlist":       10,
    },
    "pro": _PRO_LIMITS.copy(),
    "premium": _PRO_LIMITS.copy(),
}

# Orden de precedencia de planes (mayor = mejor)
PLAN_RANK = {"free": 0, "pro": 1, "premium": 1}


def normalize_plan(plan: str | None) -> str:
    plan = (plan or "free").lower()
    return "pro" if plan == "premium" else plan


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _plan_gte(plan_a: str, plan_b: str) -> bool:
    """True si plan_a es igual o superior a plan_b."""
    return PLAN_RANK.get(plan_a, 0) >= PLAN_RANK.get(plan_b, 0)


def _best_plan(a: str, b: str) -> str:
    return a if PLAN_RANK.get(a, 0) >= PLAN_RANK.get(b, 0) else b


class SubscriptionService:
    """
    Servicio centralizado de suscripciones y feature-gating.
    Todos los métodos son estáticos — no necesita instanciación.
    """

    # ── Plan effectivo ─────────────────────────────────────────────────────────

    @staticmethod
    def get_effective_subscription(user) -> str:
        """
        Devuelve el plan efectivo del usuario considerando:
          1. Recompensas activas de la ruleta (pro_trial / premium_trial)
          2. Suscripción activa en la tabla subscriptions
          3. Campo cacheado user.subscription
          4. Fallback: 'free'
        """
        if user is None:
            return "free"

        if getattr(user, "role", None) == "admin":
            return "pro"

        effective = "free"
        has_external_subscription = False

        # ── Nivel 1: campo cacheado ───────────────────────────────────────────
        cached = getattr(user, "subscription", "free") or "free"

        # ── Nivel 2: subscriptions table (proveedor externo) ─────────────────
        reward_applied = False
        try:
            from app.models.billing import Subscription
            now = _now()
            has_external_subscription = (
                Subscription.query
                .filter_by(user_id=user.id)
                .filter(Subscription.provider.in_(["stripe", "wallet"]))
                .first()
                is not None
            )
            active_sub = (
                Subscription.query
                .filter_by(user_id=user.id)
                .filter(Subscription.status.in_(["active", "trialing"]))
                .filter(
                    (Subscription.current_period_end == None) |
                    (Subscription.current_period_end > now)
                )
                .order_by(Subscription.created_at.desc())
                .first()
            )
            active_plan = normalize_plan(active_sub.plan if active_sub else None)
            if active_sub and active_plan in PLAN_LIMITS:
                effective = _best_plan(effective, active_plan)
        except Exception as exc:
            logger.debug("SubscriptionService: no se pudo leer tabla subscriptions: %s", exc)

        # ── Nivel 3: recompensas activas de ruleta ────────────────────────────
        try:
            from app.models.reward import RewardGrant
            now = _now()
            active_rewards = (
                RewardGrant.query
                .filter_by(user_id=user.id, status="active")
                .filter(RewardGrant.reward_type.in_(["pro_trial", "premium_trial"]))
                .filter(
                    (RewardGrant.expires_at == None) |
                    (RewardGrant.expires_at > now)
                )
                .all()
            )
            for grant in active_rewards:
                grant_plan = "pro"
                effective = _best_plan(effective, grant_plan)
                reward_applied = True
        except Exception as exc:
            logger.debug("SubscriptionService: no se pudo leer reward_grants: %s", exc)

        cached = normalize_plan(cached)
        if effective == "free" and not has_external_subscription and not reward_applied and cached in PLAN_LIMITS:
            effective = cached

        return effective

    # ── Helpers de plan ────────────────────────────────────────────────────────

    @staticmethod
    def get_user_plan(user) -> str:
        """Alias legible de get_effective_subscription."""
        return SubscriptionService.get_effective_subscription(user)

    @staticmethod
    def has_plan(user, required_plan: str) -> bool:
        """True si el plan efectivo del usuario es >= required_plan."""
        effective = SubscriptionService.get_effective_subscription(user)
        return _plan_gte(effective, required_plan)

    @staticmethod
    def is_pro(user) -> bool:
        """True si el usuario tiene plan pro O superior."""
        return SubscriptionService.has_plan(user, "pro")

    @staticmethod
    def is_premium(user) -> bool:
        """Compatibilidad: el antiguo premium equivale a PRO."""
        return SubscriptionService.has_plan(user, "pro")

    # ── Límites y feature-gating ───────────────────────────────────────────────

    @staticmethod
    def get_limits(user) -> dict[str, Any]:
        """
        Devuelve el dict de límites para el plan efectivo del usuario.
        Siempre devuelve un dict válido (nunca KeyError).
        """
        plan = SubscriptionService.get_effective_subscription(user)
        return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"]).copy()

    @staticmethod
    def get_limit(user, feature: str, default: Any = None) -> Any:
        """
        Devuelve el límite de una feature concreta.
        None = sin límite; 0 = no permitido.
        """
        limits = SubscriptionService.get_limits(user)
        return limits.get(feature, default)

    @staticmethod
    def can_use_feature(user, feature: str) -> bool:
        """
        Comprueba si el usuario puede usar una feature booleana
        (can_sell_strategies, can_export, api_access…).
        Para features numéricas usa get_limit() directamente.
        """
        limits = SubscriptionService.get_limits(user)
        val = limits.get(feature, False)
        if isinstance(val, bool):
            return val
        # Para valores numéricos: 0 o None → tratar según contexto
        if val is None:
            return True   # None = ilimitado = permitido
        return bool(val)

    @staticmethod
    def check_limit(user, feature: str, current_count: int) -> tuple[bool, int | None]:
        """
        Verifica si current_count está dentro del límite de la feature.

        Returns:
            (allowed: bool, limit: int | None)
            limit == None significa ilimitado.
        """
        limit = SubscriptionService.get_limit(user, feature)
        if limit is None:
            return True, None          # Ilimitado
        return current_count < limit, limit

    # ── Información de suscripción activa ─────────────────────────────────────

    @staticmethod
    def get_active_subscription(user):
        """
        Devuelve el objeto Subscription activo (o None).
        Considera solo suscripciones con status active/trialing y period_end no expirado.
        """
        if user is None:
            return None
        try:
            from app.models.billing import Subscription
            now = _now()
            return (
                Subscription.query
                .filter_by(user_id=user.id)
                .filter(Subscription.status.in_(["active", "trialing"]))
                .filter(
                    (Subscription.current_period_end == None) |
                    (Subscription.current_period_end > now)
                )
                .order_by(Subscription.created_at.desc())
                .first()
            )
        except Exception as exc:
            logger.debug("SubscriptionService: error leyendo subscription activa: %s", exc)
            return None

    @staticmethod
    def get_latest_subscription(user):
        """Devuelve la suscripcion mas reciente, aunque no confiera acceso."""
        if user is None:
            return None
        try:
            from app.models.billing import Subscription
            return (
                Subscription.query
                .filter_by(user_id=user.id)
                .order_by(Subscription.created_at.desc())
                .first()
            )
        except Exception as exc:
            logger.debug("SubscriptionService: error leyendo latest subscription: %s", exc)
            return None

    @staticmethod
    def get_subscription_info(user) -> dict:
        """
        Devuelve un dict con el resumen de suscripción para la UI.
        Incluye el plan efectivo, el plan de la suscripción real, los límites y
        si hay trials de ruleta activos.
        """
        if user is None:
            return {
                "effective_plan": "free",
                "subscription_plan": None,
                "limits": PLAN_LIMITS["free"],
                "has_active_subscription": False,
                "active_trials": [],
                "subscription": None,
                "subscription_status": None,
                "payment_attention_required": False,
            }

        effective = SubscriptionService.get_effective_subscription(user)
        active_sub = SubscriptionService.get_active_subscription(user)
        latest_sub = active_sub or SubscriptionService.get_latest_subscription(user)

        # Recopila trials activos de la ruleta
        active_trials = []
        try:
            from app.models.reward import RewardGrant
            now = _now()
            grants = (
                RewardGrant.query
                .filter_by(user_id=user.id, status="active")
                .filter(RewardGrant.reward_type.in_(["pro_trial", "premium_trial"]))
                .filter(
                    (RewardGrant.expires_at == None) |
                    (RewardGrant.expires_at > now)
                )
                .all()
            )
            for g in grants:
                active_trials.append({
                    "type": g.reward_type,
                    "plan": "pro",
                    "expires_at": g.expires_at.isoformat() if g.expires_at else None,
                })
        except Exception:
            pass

        return {
            "effective_plan": effective,
            "subscription_plan": normalize_plan(latest_sub.plan if latest_sub else getattr(user, "subscription", "free")),
            "limits": PLAN_LIMITS.get(effective, PLAN_LIMITS["free"]),
            "has_active_subscription": active_sub is not None,
            "active_trials": active_trials,
            "subscription": latest_sub.to_dict() if latest_sub else None,
            "subscription_status": latest_sub.status if latest_sub else None,
            "payment_attention_required": bool(latest_sub and latest_sub.status in ("past_due", "unpaid", "incomplete")),
            "access_policy": (
                "El acceso de pago se conserva solo con estados active/trialing. "
                "past_due, unpaid, incomplete o canceled no confieren plan salvo recompensas temporales activas."
            ),
        }

    # ── Sincronización del campo cacheado user.subscription ───────────────────

    @staticmethod
    def sync_user_subscription_field(user) -> None:
        """
        Actualiza user.subscription con el plan efectivo actual.
        Útil para sincronizar tras un webhook de Stripe o tras expirar un trial.
        Solo actualiza si el valor ha cambiado para evitar escrituras innecesarias.
        """
        from app import db
        effective = SubscriptionService.get_effective_subscription(user)
        current_cached = getattr(user, "subscription", "free") or "free"
        if current_cached != effective:
            user.subscription = effective
            try:
                db.session.commit()
                logger.info(
                    "SubscriptionService: user %s subscription synced %s → %s",
                    user.id, current_cached, effective,
                )
            except Exception as exc:
                db.session.rollback()
                logger.error("SubscriptionService: error sincronizando user.subscription: %s", exc)

    # ── Utilidades de Stripe ───────────────────────────────────────────────────

    @staticmethod
    def get_or_create_stripe_customer(user) -> Optional[str]:
        """
        Devuelve el external_customer_id de Stripe del usuario (cus_xxx).
        Si no existe, crea un nuevo Customer en Stripe y lo guarda en la BD.
        Devuelve None si Stripe no está configurado.
        """
        import os
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not stripe_key:
            return None

        # Buscar en tabla subscriptions primero
        try:
            from app.models.billing import Subscription
            sub = (
                Subscription.query
                .filter_by(user_id=user.id)
                .filter(Subscription.external_customer_id != None)
                .order_by(Subscription.created_at.desc())
                .first()
            )
            if sub and sub.external_customer_id:
                return sub.external_customer_id
        except Exception:
            pass

        # Crear nuevo Customer en Stripe
        try:
            import stripe
            stripe.api_key = stripe_key
            customer = stripe.Customer.create(
                email=getattr(user, "email", None),
                name=getattr(user, "full_name", None) or getattr(user, "username", None),
                metadata={"user_id": str(user.id)},
            )
            return customer.id
        except Exception as exc:
            logger.error("SubscriptionService: error creando Stripe customer: %s", exc)
            return None
