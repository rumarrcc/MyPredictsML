"""
Modelos de billing / suscripciones:
  - Subscription   — historial de suscripciones por usuario
  - Payment        — registro de pagos individuales
  - BillingEvent   — log de eventos de pasarela (Stripe webhooks, etc.)

Diseño:
  - User.subscription es el estado rápido cacheado ('free'|'pro'|'premium')
  - Subscription es la fuente histórica/auditable
  - Payment es cada transacción monetaria
  - BillingEvent es el log crudo de webhooks (idempotente via external_event_id)
"""
from __future__ import annotations

from datetime import datetime, timezone

from app import db


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# ── Subscription ──────────────────────────────────────────────────────────────

class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id                      = db.Column(db.Integer, primary_key=True)
    user_id                 = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    plan                    = db.Column(db.String(20), nullable=False, default="free")  # free|pro|premium
    status                  = db.Column(db.String(20), nullable=False, default="active", index=True)
    # active | trialing | past_due | canceled | incomplete | unpaid

    provider                = db.Column(db.String(20), nullable=False, default="manual")
    # stripe | manual | reward | crypto (future)

    external_subscription_id = db.Column(db.String(200), unique=True, nullable=True)
    # Stripe subscription ID (sub_xxx)

    external_customer_id    = db.Column(db.String(200), nullable=True, index=True)
    # Stripe customer ID (cus_xxx)

    current_period_start    = db.Column(db.DateTime, nullable=True)
    current_period_end      = db.Column(db.DateTime, nullable=True)
    cancel_at_period_end    = db.Column(db.Boolean, nullable=False, default=False)
    canceled_at             = db.Column(db.DateTime, nullable=True)
    trial_end               = db.Column(db.DateTime, nullable=True)

    # Metadata
    notes                   = db.Column(db.Text)   # Admin notes

    created_at              = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at              = db.Column(db.DateTime, default=_now, onupdate=_now)

    user = db.relationship("User", backref=db.backref("subscriptions", lazy="dynamic"))

    __table_args__ = (
        db.Index("ix_sub_user_status",  "user_id", "status"),
        db.Index("ix_sub_provider",     "provider"),
        db.Index("ix_sub_period_end",   "current_period_end"),
    )

    @property
    def is_active_plan(self) -> bool:
        """True si la suscripción confiere actualmente el plan."""
        if self.status not in ("active", "trialing"):
            return False
        period_end = _as_utc_naive(self.current_period_end)
        if period_end and period_end < _now():
            return False
        return True

    def to_dict(self) -> dict:
        return {
            "id":                       self.id,
            "user_id":                  self.user_id,
            "plan":                     self.plan,
            "status":                   self.status,
            "provider":                 self.provider,
            "external_subscription_id": self.external_subscription_id,
            "external_customer_id":     self.external_customer_id,
            "current_period_start":     self.current_period_start.isoformat() if self.current_period_start else None,
            "current_period_end":       self.current_period_end.isoformat()   if self.current_period_end   else None,
            "cancel_at_period_end":     self.cancel_at_period_end,
            "canceled_at":              self.canceled_at.isoformat() if self.canceled_at else None,
            "trial_end":                self.trial_end.isoformat()   if self.trial_end   else None,
            "is_active_plan":           self.is_active_plan,
            "created_at":               self.created_at.isoformat()  if self.created_at  else None,
            "updated_at":               self.updated_at.isoformat()  if self.updated_at  else None,
        }

    def __repr__(self):
        return f"<Subscription user={self.user_id} plan={self.plan} status={self.status}>"


# ── Payment ───────────────────────────────────────────────────────────────────

class Payment(db.Model):
    __tablename__ = "payments"

    id                      = db.Column(db.Integer, primary_key=True)
    user_id                 = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    provider                = db.Column(db.String(20), nullable=False, default="stripe")
    # stripe | manual | crypto

    amount                  = db.Column(db.Numeric(10, 2), nullable=False)
    currency                = db.Column(db.String(5), nullable=False, default="USD")

    status                  = db.Column(db.String(20), nullable=False, default="pending", index=True)
    # pending | succeeded | failed | refunded | disputed

    plan                    = db.Column(db.String(20))   # plan comprado: pro | premium

    external_payment_id     = db.Column(db.String(200), unique=True, nullable=True, index=True)
    # Stripe PaymentIntent ID (pi_xxx)

    external_customer_id    = db.Column(db.String(200), nullable=True, index=True)
    # Stripe customer ID (cus_xxx)

    external_invoice_id     = db.Column(db.String(200), nullable=True)
    # Stripe Invoice ID (in_xxx)

    description             = db.Column(db.String(500))
    refund_reason           = db.Column(db.String(200))

    created_at              = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at              = db.Column(db.DateTime, default=_now, onupdate=_now)

    user = db.relationship("User", backref=db.backref("payments", lazy="dynamic"))

    __table_args__ = (
        db.Index("ix_payment_status_user", "user_id", "status"),
        db.Index("ix_payment_created",     "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id":                   self.id,
            "user_id":              self.user_id,
            "provider":             self.provider,
            "amount":               float(self.amount),
            "currency":             self.currency,
            "status":               self.status,
            "plan":                 self.plan,
            "external_payment_id":  self.external_payment_id,
            "external_customer_id": self.external_customer_id,
            "external_invoice_id":  self.external_invoice_id,
            "description":          self.description,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Payment user={self.user_id} amount={self.amount} status={self.status}>"


# ── BillingEvent ──────────────────────────────────────────────────────────────

class BillingEvent(db.Model):
    """
    Log crudo de eventos de pasarela de pago (webhooks).
    Idempotente: external_event_id UNIQUE previene reprocesar el mismo evento.
    """
    __tablename__ = "billing_events"

    id                = db.Column(db.Integer, primary_key=True)
    provider          = db.Column(db.String(20), nullable=False, default="stripe")
    event_type        = db.Column(db.String(80), nullable=False, index=True)
    # Ej: "checkout.session.completed", "customer.subscription.updated"

    external_event_id = db.Column(db.String(200), unique=True, nullable=True, index=True)
    # Stripe event ID (evt_xxx) — UNIQUE para idempotencia

    user_id           = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    payload_json      = db.Column(db.Text)    # JSON crudo del evento
    processed         = db.Column(db.Boolean, nullable=False, default=False, index=True)
    error_msg         = db.Column(db.Text)    # Si el procesamiento falló

    processed_at      = db.Column(db.DateTime)
    created_at        = db.Column(db.DateTime, default=_now, nullable=False, index=True)

    __table_args__ = (
        db.Index("ix_billing_event_type_created", "event_type", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "provider":          self.provider,
            "event_type":        self.event_type,
            "external_event_id": self.external_event_id,
            "user_id":           self.user_id,
            "processed":         self.processed,
            "error_msg":         self.error_msg,
            "processed_at":      self.processed_at.isoformat() if self.processed_at else None,
            "created_at":        self.created_at.isoformat()   if self.created_at   else None,
        }

    def __repr__(self):
        return f"<BillingEvent {self.event_type} processed={self.processed}>"
