"""
Modelos: VirtualPortfolio y PortfolioPosition
"""
from datetime import datetime, timezone
from app import db


class VirtualPortfolio(db.Model):
    __tablename__ = "virtual_portfolio"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    initial_capital = db.Column(db.Numeric(12, 2), nullable=False)
    current_value = db.Column(db.Numeric(12, 2))
    total_return = db.Column(db.Numeric(7, 4), default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="portfolios")
    positions = db.relationship(
        "PortfolioPosition",
        back_populates="portfolio",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    @property
    def total_invested(self) -> float:
        return sum(float(p.buy_price) * float(p.quantity) for p in self.positions)

    @property
    def is_investment_wallet(self) -> bool:
        """True para carteras que representan inversiones reales financiadas por wallet."""
        return (self.name or "").strip().lower() in {"inversiones desde señales", "mis inversiones"}

    @property
    def cash_available(self) -> float:
        if self.is_investment_wallet:
            return 0.0
        return float(self.initial_capital) - self.total_invested

    def to_dict(self, include_positions: bool = False) -> dict:
        positions_list = list(self.positions)
        total_invested = sum(float(p.buy_price) * float(p.quantity) for p in positions_list)
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "is_investment_wallet": self.is_investment_wallet,
            "initial_capital": float(self.initial_capital) if self.initial_capital is not None else None,
            "current_value": float(self.current_value) if self.current_value is not None else None,
            "total_return": float(self.total_return) if self.total_return is not None else 0.0,
            "total_invested": total_invested,
            "cash_available": 0.0 if self.is_investment_wallet else float(self.initial_capital or 0) - total_invested,
            "positions_count": len(positions_list),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_positions:
            data["positions"] = [p.to_dict() for p in positions_list]
        return data

    def __repr__(self) -> str:
        return f"<VirtualPortfolio {self.name} user={self.user_id}>"


class PortfolioPosition(db.Model):
    __tablename__ = "portfolio_positions"

    id = db.Column(db.Integer, primary_key=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey("virtual_portfolio.id", ondelete="CASCADE"), nullable=False)
    ticker = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Numeric(10, 4), nullable=False)
    buy_price = db.Column(db.Numeric(10, 4), nullable=False)
    buy_date = db.Column(db.Date, nullable=False)
    current_price = db.Column(db.Numeric(10, 4))
    gain_loss = db.Column(db.Numeric(12, 2))
    gain_loss_percent = db.Column(db.Numeric(7, 4))
    source_type = db.Column(db.String(30), default="manual")  # manual | signal | strategy
    source_id = db.Column(db.Integer)
    source_label = db.Column(db.String(120))
    signal_type = db.Column(db.String(20))
    signal_score = db.Column(db.Integer)
    source_note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    portfolio = db.relationship("VirtualPortfolio", back_populates="positions")

    @property
    def invested(self) -> float:
        return float(self.buy_price) * float(self.quantity)

    @property
    def current_value(self) -> float | None:
        if self.current_price is None:
            return None
        return float(self.current_price) * float(self.quantity)

    def recalculate(self) -> None:
        """Recalcula gain_loss y gain_loss_percent con current_price actual."""
        if self.current_price is not None:
            invested = self.invested
            cv = float(self.current_price) * float(self.quantity)
            self.gain_loss = cv - invested
            self.gain_loss_percent = (cv - invested) / invested if invested else 0

    def to_dict(self) -> dict:
        def f(v):
            return float(v) if v is not None else None

        return {
            "id": self.id,
            "portfolio_id": self.portfolio_id,
            "ticker": self.ticker,
            "quantity": f(self.quantity),
            "buy_price": f(self.buy_price),
            "buy_date": self.buy_date.isoformat() if self.buy_date else None,
            "current_price": f(self.current_price),
            "invested": self.invested,
            "current_value": self.current_value,
            "gain_loss": f(self.gain_loss),
            "gain_loss_percent": f(self.gain_loss_percent),
            "source_type": self.source_type or "manual",
            "source_id": self.source_id,
            "source_label": self.source_label,
            "signal_type": self.signal_type,
            "signal_score": self.signal_score,
            "source_note": self.source_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<PortfolioPosition {self.ticker} qty={self.quantity}>"
