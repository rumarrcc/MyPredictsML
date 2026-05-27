"""
Modelo: TechnicalIndicator — indicadores técnicos calculados por fecha/ticker
"""
from datetime import datetime, timezone
from app import db


class TechnicalIndicator(db.Model):
    __tablename__ = "technical_indicators"

    id = db.Column(db.Integer, primary_key=True)
    ticker = db.Column(db.String(10), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)

    sma_20 = db.Column(db.Numeric(10, 4))
    sma_50 = db.Column(db.Numeric(10, 4))
    sma_200 = db.Column(db.Numeric(10, 4))
    rsi_14 = db.Column(db.Numeric(5, 2))
    macd = db.Column(db.Numeric(10, 4))
    macd_signal = db.Column(db.Numeric(10, 4))
    macd_hist = db.Column(db.Numeric(10, 4))
    bollinger_upper = db.Column(db.Numeric(10, 4))
    bollinger_middle = db.Column(db.Numeric(10, 4))
    bollinger_lower = db.Column(db.Numeric(10, 4))
    calculated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint("ticker", "date", name="uq_technical_indicators_ticker_date"),
        db.Index("ix_technical_indicators_ticker_date", "ticker", "date"),
    )

    def to_dict(self) -> dict:
        def f(v):
            return float(v) if v is not None else None

        return {
            "date": self.date.isoformat() if self.date else None,
            "sma_20": f(self.sma_20),
            "sma_50": f(self.sma_50),
            "sma_200": f(self.sma_200),
            "rsi_14": f(self.rsi_14),
            "macd": f(self.macd),
            "macd_signal": f(self.macd_signal),
            "macd_hist": f(self.macd_hist),
            "bollinger_upper": f(self.bollinger_upper),
            "bollinger_middle": f(self.bollinger_middle),
            "bollinger_lower": f(self.bollinger_lower),
        }

    def __repr__(self) -> str:
        return f"<TechnicalIndicator {self.ticker} {self.date}>"
