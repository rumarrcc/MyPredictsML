"""
Modelo: StockData — caché de datos bursátiles históricos
"""
from datetime import datetime, timezone
from app import db


class StockData(db.Model):
    __tablename__ = "stock_data"

    id = db.Column(db.Integer, primary_key=True)
    ticker = db.Column(db.String(10), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    open = db.Column(db.Numeric(10, 2))
    high = db.Column(db.Numeric(10, 2))
    low = db.Column(db.Numeric(10, 2))
    close = db.Column(db.Numeric(10, 2))
    volume = db.Column(db.BigInteger)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint("ticker", "date", name="uq_stock_data_ticker_date"),
        db.Index("ix_stock_data_ticker_date", "ticker", "date"),
    )

    def to_dict(self) -> dict:
        return {
            "date": self.date.isoformat() if self.date else None,
            "open": float(self.open) if self.open is not None else None,
            "high": float(self.high) if self.high is not None else None,
            "low": float(self.low) if self.low is not None else None,
            "close": float(self.close) if self.close is not None else None,
            "volume": self.volume,
        }

    def __repr__(self) -> str:
        return f"<StockData {self.ticker} {self.date}>"
