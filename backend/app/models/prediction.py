"""
Modelo: Prediction — resultados de predicciones ML por usuario/ticker
"""
from datetime import datetime, timezone
from app import db


class Prediction(db.Model):
    __tablename__ = "predictions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = db.Column(db.String(10), nullable=False, index=True)
    model_type = db.Column(db.String(50), nullable=False)   # prophet | arima | sma
    prediction_date = db.Column(db.Date, nullable=False)
    predicted_price = db.Column(db.Numeric(10, 4), nullable=False)
    confidence_interval_low = db.Column(db.Numeric(10, 4))
    confidence_interval_high = db.Column(db.Numeric(10, 4))
    confidence_level = db.Column(db.Numeric(4, 2), default=0.95)
    horizon_days = db.Column(db.Integer)
    accuracy_score = db.Column(db.Numeric(5, 4))
    model_params = db.Column(db.JSON)
    # Métricas del modelo
    mae = db.Column(db.Numeric(10, 4))
    rmse = db.Column(db.Numeric(10, 4))
    mape = db.Column(db.Numeric(5, 2))
    training_samples = db.Column(db.Integer)
    # Grupo de predicción (todas las predicciones de una misma solicitud)
    prediction_group_id = db.Column(db.Integer, index=True)
    historical_days = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="predictions")

    def to_dict(self) -> dict:
        def f(v):
            return float(v) if v is not None else None

        return {
            "id": self.id,
            "user_id": self.user_id,
            "ticker": self.ticker,
            # Campos canónicos
            "model_type": self.model_type,
            "prediction_date": self.prediction_date.isoformat() if self.prediction_date else None,
            "predicted_price": f(self.predicted_price),
            "confidence_interval_low": f(self.confidence_interval_low),
            "confidence_interval_high": f(self.confidence_interval_high),
            "confidence_level": f(self.confidence_level),
            "horizon_days": self.horizon_days,
            "mae": f(self.mae),
            "rmse": f(self.rmse),
            "mape": f(self.mape),
            "training_samples": self.training_samples,
            "prediction_group_id": self.prediction_group_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            # Alias usados por el Dashboard / frontend
            "model": self.model_type,
            "horizon": self.horizon_days,
            "group_id": self.prediction_group_id,
            "first_prediction": f(self.predicted_price),
        }

    def __repr__(self) -> str:
        return f"<Prediction {self.ticker} {self.model_type} {self.prediction_date}>"
