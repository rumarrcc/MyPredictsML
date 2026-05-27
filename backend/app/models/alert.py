"""
Modelo: Alert — alertas de precio, predicción y tendencia
"""
from datetime import datetime, timezone
from app import db


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = db.Column(db.String(10), nullable=False)
    alert_type = db.Column(db.String(50), nullable=False)   # price_threshold | prediction_change | trend_reversal
    condition = db.Column(db.String(20))                    # above | below (para price_threshold)
    trigger_value = db.Column(db.Numeric(10, 4))
    model = db.Column(db.String(50))                        # Para prediction_change
    change_percent = db.Column(db.Numeric(5, 2))            # Para prediction_change
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    email_enabled = db.Column(db.Boolean, default=True)
    priority     = db.Column(db.String(10), default='medium')   # low | medium | high
    last_triggered_at = db.Column(db.DateTime)
    trigger_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="alerts")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "ticker": self.ticker,
            "alert_type": self.alert_type,
            "condition": self.condition,
            "trigger_value": float(self.trigger_value) if self.trigger_value is not None else None,
            "model": self.model,
            "change_percent": float(self.change_percent) if self.change_percent is not None else None,
            "description": self.description,
            "is_active": self.is_active,
            "email_enabled": self.email_enabled,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "trigger_count": self.trigger_count,
            "priority": self.priority or "medium",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Alert {self.ticker} {self.alert_type} user={self.user_id}>"
