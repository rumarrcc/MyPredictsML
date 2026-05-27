"""
Modelos del Marketplace de Estrategias:
  - Strategy              — estrategia de inversión/trading
  - StrategyBacktestMetrics — métricas de rendimiento vinculadas
  - StrategyPurchase      — registro de compras/licencias
  - StrategyReview        — valoraciones de compradores
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from app import db


# ── Constantes de estado / enums ──────────────────────────────────────────────

STRATEGY_STATUS   = ("draft", "published", "archived")
STRATEGY_VIS      = ("private", "public", "marketplace")
STRATEGY_CATEGORY = (
    "swing", "momentum", "mean_reversion", "long_term",
    "scalping", "breakout", "trend_following", "contrarian", "other"
)
PAYMENT_STATUS    = ("pending", "completed", "refunded", "failed")
PAYMENT_PROVIDER  = ("internal", "stripe_pending", "stripe", "paypal", "manual")

PLATFORM_FEE_PCT  = 0.20   # 20 % de comisión


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    """Convierte texto en slug URL-safe."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:80]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Strategy ──────────────────────────────────────────────────────────────────

class Strategy(db.Model):
    __tablename__ = "strategies"

    id              = db.Column(db.Integer, primary_key=True)
    user_id         = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name            = db.Column(db.String(120), nullable=False)
    slug            = db.Column(db.String(100), nullable=False, index=True)
    description     = db.Column(db.Text)
    short_desc      = db.Column(db.String(280))     # resumen para cards

    category        = db.Column(db.String(30), nullable=False, default="other")

    # JSON estructurado con las reglas de la estrategia
    rules_json      = db.Column(db.Text)            # JSON string

    # Visibilidad y estado
    visibility      = db.Column(db.String(15), nullable=False, default="private")
    status          = db.Column(db.String(15), nullable=False, default="draft", index=True)

    # Precio
    is_paid         = db.Column(db.Boolean, nullable=False, default=False)
    price           = db.Column(db.Numeric(10, 2), default=0.00)
    currency        = db.Column(db.String(5), default="USD")

    # Metadata
    is_featured     = db.Column(db.Boolean, nullable=False, default=False, index=True)
    times_purchased = db.Column(db.Integer, nullable=False, default=0)
    average_rating  = db.Column(db.Numeric(3, 2), default=None)
    reviews_count   = db.Column(db.Integer, nullable=False, default=0)
    views_count     = db.Column(db.Integer, nullable=False, default=0)

    # Tickers objetivo (opcional, lista separada por comas o JSON)
    target_tickers  = db.Column(db.String(500))

    # Versioning simple: incrementar version al publicar
    version         = db.Column(db.Integer, nullable=False, default=1)

    created_at      = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at      = db.Column(db.DateTime, default=_now, onupdate=_now)
    published_at    = db.Column(db.DateTime)

    # ── Relaciones ─────────────────────────────────────────────────────────
    author      = db.relationship("User", backref=db.backref("strategies", lazy="dynamic"))
    metrics     = db.relationship(
        "StrategyBacktestMetrics", backref="strategy",
        uselist=False, cascade="all, delete-orphan",
    )
    purchases   = db.relationship(
        "StrategyPurchase", backref="strategy",
        lazy="dynamic", cascade="all, delete-orphan",
    )
    reviews     = db.relationship(
        "StrategyReview", backref="strategy",
        lazy="dynamic", cascade="all, delete-orphan",
    )

    __table_args__ = (
        db.Index("ix_strategy_status_vis", "status", "visibility"),
        db.Index("ix_strategy_category",   "category"),
        db.Index("ix_strategy_featured",   "is_featured", "status"),
        db.Index("ix_strategy_purchases",  "times_purchased"),
        db.Index("ix_strategy_rating",     "average_rating"),
    )

    # ── Propiedades ────────────────────────────────────────────────────────

    @property
    def price_float(self) -> float:
        return float(self.price or 0)

    @property
    def price_coins(self) -> int:
        """Canonical internal cost used by the product economy."""
        if not self.is_paid:
            return 0
        return max(1, int(round(float(self.price or 0))))

    def is_accessible_by(self, user) -> bool:
        """True si el usuario puede ver el contenido completo de la estrategia."""
        if not user:
            return not self.is_paid
        if user.id == self.user_id or user.role == "admin":
            return True
        # Comprador con compra completada
        purchase = StrategyPurchase.query.filter_by(
            strategy_id=self.id,
            buyer_id=user.id,
            payment_status="completed",
        ).first()
        return purchase is not None

    def to_dict(self, include_rules: bool = False, viewer=None) -> dict:
        import json
        data = {
            "id":             self.id,
            "name":           self.name,
            "slug":           self.slug,
            "description":    self.description,
            "short_desc":     self.short_desc,
            "category":       self.category,
            "visibility":     self.visibility,
            "status":         self.status,
            "is_paid":        self.is_paid,
            "price":          float(self.price or 0),
            "price_coins":     self.price_coins,
            "currency":       self.currency,
            "is_featured":    self.is_featured,
            "times_purchased": self.times_purchased,
            "average_rating": float(self.average_rating) if self.average_rating else None,
            "reviews_count":  self.reviews_count,
            "views_count":    self.views_count,
            "target_tickers": self.target_tickers,
            "version":        self.version,
            "user_id":        self.user_id,
            "author_username": self.author.username if self.author else None,
            "author_subscription": self.author.subscription if self.author else None,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "updated_at":     self.updated_at.isoformat() if self.updated_at else None,
            "published_at":   self.published_at.isoformat() if self.published_at else None,
            "metrics":        self.metrics.to_dict() if self.metrics else None,
        }
        # ── Gate de rules_json ─────────────────────────────────────────────
        # Regla: solo se exponen las reglas si:
        #   a) include_rules=True  Y
        #   b) is_accessible_by(viewer) es True
        #
        # is_accessible_by(None) → True solo para estrategias GRATUITAS
        # is_accessible_by(user) → True si es autor, admin o comprador con payment_status='completed'
        # Un comprador con payment_status='pending' NO obtiene acceso.
        if include_rules and self.is_accessible_by(viewer):
            try:
                data["rules"] = json.loads(self.rules_json) if self.rules_json else None
            except Exception:
                data["rules"] = None
        else:
            data["rules"] = None  # protegido o no solicitado

        # ── Estado de compra del viewer ────────────────────────────────────
        if viewer and viewer.id != self.user_id:
            purchase = StrategyPurchase.query.filter_by(
                strategy_id=self.id,
                buyer_id=viewer.id,
            ).order_by(StrategyPurchase.created_at.desc()).first()

            if purchase is None:
                data["already_purchased"] = False
                data["purchase_status"]   = None
            else:
                data["already_purchased"] = (purchase.payment_status == "completed")
                data["purchase_status"]   = purchase.payment_status  # 'completed'|'pending'|'failed'
        else:
            # Es el autor o no hay viewer
            data["already_purchased"] = (viewer is not None and viewer.id == self.user_id)
            data["purchase_status"]   = None

        return data

    def __repr__(self):
        return f"<Strategy id={self.id} name={self.name!r} status={self.status}>"


# ── StrategyBacktestMetrics ───────────────────────────────────────────────────

class StrategyBacktestMetrics(db.Model):
    __tablename__ = "strategy_backtest_metrics"

    id              = db.Column(db.Integer, primary_key=True)
    strategy_id     = db.Column(
        db.Integer, db.ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )

    # Métricas clave
    win_rate        = db.Column(db.Numeric(5, 2))    # % de operaciones ganadoras
    total_return    = db.Column(db.Numeric(8, 2))    # % retorno total
    max_drawdown    = db.Column(db.Numeric(8, 2))    # % máxima caída
    sharpe_ratio    = db.Column(db.Numeric(6, 3))
    sortino_ratio   = db.Column(db.Numeric(6, 3))
    profit_factor   = db.Column(db.Numeric(6, 3))
    trades_count    = db.Column(db.Integer)
    avg_trade_days  = db.Column(db.Numeric(6, 1))   # duración media de operación

    # Periodo evaluado
    backtest_from   = db.Column(db.Date)
    backtest_to     = db.Column(db.Date)
    ticker_tested   = db.Column(db.String(20))       # ticker usado en backtest

    # Referencia opcional al BacktestResult existente
    backtest_result_id = db.Column(
        db.Integer,
        db.ForeignKey("backtest_results.id", ondelete="SET NULL"),
        nullable=True,
    )

    last_backtest_at = db.Column(db.DateTime, default=_now)
    created_at      = db.Column(db.DateTime, default=_now)

    backtest_result = db.relationship("BacktestResult", foreign_keys=[backtest_result_id])

    def to_dict(self) -> dict:
        return {
            "win_rate":           float(self.win_rate)      if self.win_rate      else None,
            "total_return":       float(self.total_return)  if self.total_return  else None,
            "max_drawdown":       float(self.max_drawdown)  if self.max_drawdown  else None,
            "sharpe_ratio":       float(self.sharpe_ratio)  if self.sharpe_ratio  else None,
            "sortino_ratio":      float(self.sortino_ratio) if self.sortino_ratio else None,
            "profit_factor":      float(self.profit_factor) if self.profit_factor else None,
            "trades_count":       self.trades_count,
            "avg_trade_days":     float(self.avg_trade_days) if self.avg_trade_days else None,
            "backtest_from":      self.backtest_from.isoformat() if self.backtest_from else None,
            "backtest_to":        self.backtest_to.isoformat()   if self.backtest_to   else None,
            "ticker_tested":      self.ticker_tested,
            "last_backtest_at":   self.last_backtest_at.isoformat() if self.last_backtest_at else None,
        }

    def __repr__(self):
        return f"<StrategyBacktestMetrics strategy={self.strategy_id} wr={self.win_rate}>"


# ── StrategyPurchase ──────────────────────────────────────────────────────────

class StrategyPurchase(db.Model):
    __tablename__ = "strategy_purchases"

    id                  = db.Column(db.Integer, primary_key=True)
    buyer_id            = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    strategy_id         = db.Column(
        db.Integer, db.ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    seller_id           = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # Precios registrados en el momento de la compra (no confiar en frontend)
    listed_price        = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    platform_fee        = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    seller_amount       = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    fee_pct             = db.Column(db.Numeric(5, 4), nullable=False, default=PLATFORM_FEE_PCT)

    # Snapshot de la versión comprada
    strategy_version    = db.Column(db.Integer, default=1)

    # Pago
    payment_status      = db.Column(db.String(20), nullable=False, default="pending", index=True)
    payment_provider    = db.Column(db.String(20), nullable=False, default="internal")
    external_payment_id = db.Column(db.String(200))   # stripe charge_id, etc.
    paid_at             = db.Column(db.DateTime)

    created_at          = db.Column(db.DateTime, default=_now, nullable=False)

    buyer   = db.relationship("User", foreign_keys=[buyer_id],  backref=db.backref("purchases",  lazy="dynamic"))
    seller  = db.relationship("User", foreign_keys=[seller_id], backref=db.backref("sales",      lazy="dynamic"))

    __table_args__ = (
        # Un comprador no puede comprar la misma estrategia dos veces
        db.UniqueConstraint("buyer_id", "strategy_id", name="uq_purchase_buyer_strategy"),
        db.Index("ix_purchase_status", "payment_status"),
    )

    @classmethod
    def calc_fees(cls, price: float, fee_pct: float = PLATFORM_FEE_PCT) -> dict:
        """Calcula los importes de la transacción desde el backend."""
        platform_fee  = round(price * fee_pct, 2)
        seller_amount = round(price - platform_fee, 2)
        return {
            "listed_price":  round(price, 2),
            "platform_fee":  platform_fee,
            "seller_amount": seller_amount,
            "fee_pct":       fee_pct,
        }

    def to_dict(self) -> dict:
        return {
            "id":                   self.id,
            "buyer_id":             self.buyer_id,
            "strategy_id":          self.strategy_id,
            "seller_id":            self.seller_id,
            "listed_price":         float(self.listed_price),
            "platform_fee":         float(self.platform_fee),
            "seller_amount":        float(self.seller_amount),
            "fee_pct":              float(self.fee_pct),
            "payment_status":       self.payment_status,
            "payment_provider":     self.payment_provider,
            "external_payment_id":  self.external_payment_id,
            "strategy_version":     self.strategy_version,
            "paid_at":              self.paid_at.isoformat() if self.paid_at else None,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<StrategyPurchase buyer={self.buyer_id} strategy={self.strategy_id} status={self.payment_status}>"


# ── StrategyReview ────────────────────────────────────────────────────────────

class StrategyReview(db.Model):
    __tablename__ = "strategy_reviews"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    strategy_id = db.Column(
        db.Integer, db.ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    rating      = db.Column(db.Integer, nullable=False)   # 1-5
    comment     = db.Column(db.Text)

    created_at  = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at  = db.Column(db.DateTime, default=_now, onupdate=_now)

    reviewer    = db.relationship("User", backref=db.backref("strategy_reviews", lazy="dynamic"))

    __table_args__ = (
        # Una sola reseña por usuario por estrategia
        db.UniqueConstraint("user_id", "strategy_id", name="uq_review_user_strategy"),
        db.Index("ix_review_strategy", "strategy_id"),
    )

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "user_id":      self.user_id,
            "strategy_id":  self.strategy_id,
            "username":     self.reviewer.username if self.reviewer else None,
            "rating":       self.rating,
            "comment":      self.comment,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
            "updated_at":   self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<StrategyReview user={self.user_id} strategy={self.strategy_id} rating={self.rating}>"
