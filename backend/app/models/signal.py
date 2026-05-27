"""
Modelo: Signal — señales premium de compra/venta/watchlist generadas por el sistema.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app import db


class Signal(db.Model):
    __tablename__ = "signals"

    id               = db.Column(db.Integer, primary_key=True)
    symbol           = db.Column(db.String(20), nullable=False, index=True)

    # ── Clasificación ──────────────────────────────────────────────────────────
    signal_type      = db.Column(db.String(10),  nullable=False)   # buy | sell | watchlist
    category         = db.Column(db.String(20),  nullable=False)   # momentum | oversold | breakout | trend

    # ── Métricas de calidad ────────────────────────────────────────────────────
    confidence       = db.Column(db.Numeric(4, 3))   # 0.000 – 1.000
    score            = db.Column(db.Integer)          # 0 – 100

    # ── Información ───────────────────────────────────────────────────────────
    reason           = db.Column(db.String(400))
    indicators       = db.Column(db.Text)             # JSON con métricas calculadas
    price_at_signal  = db.Column(db.Numeric(14, 4))

    # ── Control de ciclo de vida ───────────────────────────────────────────────
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    expires_at       = db.Column(db.DateTime, index=True)
    is_active        = db.Column(db.Boolean, default=True, nullable=False, index=True)
    generated_by     = db.Column(db.String(20), default="system")

    __table_args__ = (
        db.Index("ix_signal_symbol_type",     "symbol", "signal_type"),
        db.Index("ix_signal_score_active",    "score",  "is_active"),
        db.Index("ix_signal_category_active", "category", "is_active"),
    )

    # ── Helpers ────────────────────────────────────────────────────────────────

    def get_indicators(self) -> dict:
        """Deserializa el campo JSON de indicadores."""
        if not self.indicators:
            return {}
        try:
            return json.loads(self.indicators)
        except Exception:
            return {}

    def set_indicators(self, data: dict) -> None:
        self.indicators = json.dumps(data)

    def to_dict(self, full: bool = True) -> dict:
        """
        Serialización completa (full=True) o limitada para usuarios FREE (full=False).
        """
        base = {
            "id":              self.id,
            "symbol":          self.symbol,
            "signal_type":     self.signal_type,
            "category":        self.category,
            "score":           self.score,
            "price_at_signal": float(self.price_at_signal) if self.price_at_signal else None,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
            "expires_at":      self.expires_at.isoformat() if self.expires_at else None,
            "is_active":       self.is_active,
        }
        if full:
            base.update({
                "confidence":  float(self.confidence) if self.confidence else None,
                "reason":      self.reason,
                "indicators":  self.get_indicators(),
                "generated_by": self.generated_by,
            })
        else:
            # FREE: mostrar confidence pero ocultar reason completo e indicators
            base["confidence"] = float(self.confidence) if self.confidence else None
            base["reason"] = (self.reason[:60] + "…") if self.reason and len(self.reason) > 60 else self.reason
            base["indicators"] = {}   # oculto para FREE
        return base

    def __repr__(self) -> str:
        return f"<Signal {self.symbol} {self.signal_type} score={self.score}>"
