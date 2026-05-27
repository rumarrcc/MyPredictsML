"""
Modelo: BacktestResult — resultados de backtesting por usuario/ticker/modelo
"""
from datetime import datetime, timezone
from app import db


class BacktestResult(db.Model):
    __tablename__ = "backtest_results"

    # mcajamar - 29/03/2026: guardé predicciones y backtests en PostgreSQL para poder consultar el historial después.
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = db.Column(db.String(10), nullable=False, index=True)
    model_type = db.Column(db.String(50), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    initial_capital = db.Column(db.Numeric(12, 2), default=10000)
    trade_type = db.Column(db.String(20), default="long")   # long | short | both
    position_size_percent = db.Column(db.Numeric(5, 2), default=100)

    # Métricas
    total_return = db.Column(db.Numeric(7, 4))
    win_rate = db.Column(db.Numeric(5, 4))
    num_trades = db.Column(db.Integer)
    winning_trades = db.Column(db.Integer)
    losing_trades = db.Column(db.Integer)
    max_consecutive_wins = db.Column(db.Integer)
    max_consecutive_losses = db.Column(db.Integer)
    max_drawdown = db.Column(db.Numeric(7, 4))
    sharpe_ratio = db.Column(db.Numeric(10, 4))
    sortino_ratio = db.Column(db.Numeric(10, 4))
    profit_factor = db.Column(db.Numeric(10, 4))
    average_win = db.Column(db.Numeric(12, 4))
    average_loss = db.Column(db.Numeric(12, 4))
    final_capital = db.Column(db.Numeric(12, 2))

    # JSON completo (equity curve, trades detalle)
    results_json = db.Column(db.JSON)
    # ID de grupo cuando se ejecutan múltiples modelos juntos
    group_id = db.Column(db.Integer, index=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="backtest_results")
    shared_analyses = db.relationship("SharedAnalysis", back_populates="backtest_result")

    def to_dict(self) -> dict:
        def f(v):
            return float(v) if v is not None else None

        return {
            "id": self.id,
            "user_id": self.user_id,
            "ticker": self.ticker,
            "model_type": self.model_type,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "initial_capital": f(self.initial_capital),
            "trade_type": self.trade_type,
            "total_return": f(self.total_return),
            "win_rate": f(self.win_rate),
            "num_trades": self.num_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "max_consecutive_wins": self.max_consecutive_wins,
            "max_consecutive_losses": self.max_consecutive_losses,
            "max_drawdown": f(self.max_drawdown),
            "sharpe_ratio": f(self.sharpe_ratio),
            "sortino_ratio": f(self.sortino_ratio),
            "profit_factor": f(self.profit_factor),
            "average_win": f(self.average_win),
            "average_loss": f(self.average_loss),
            "final_capital": f(self.final_capital),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<BacktestResult {self.ticker} {self.model_type} {self.start_date}-{self.end_date}>"
