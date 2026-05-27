"""
Modelos SQLAlchemy — MyPredicts
Exporta todas las clases para uso conveniente.
"""
# mcajamar - 08/02/2026: definí las tablas principales de la base de datos y las relaciones necesarias para el flujo de la app.
from .user import User, FavoriteTicker
from .stock_data import StockData
from .indicators import TechnicalIndicator
from .prediction import Prediction
from .alert import Alert
from .backtest import BacktestResult
from .portfolio import VirtualPortfolio, PortfolioPosition
from .analysis import SharedAnalysis, AnalysisComment, AnalysisLike, SearchHistory
from .ticker import Ticker
from .signal import Signal
from .reward import RewardGrant, WheelSpin, DiscountCoupon
from .strategy import Strategy, StrategyBacktestMetrics, StrategyPurchase, StrategyReview
from .billing import Subscription, Payment, BillingEvent
from .review import AppReview
from .economy import (
    CoinTransaction,
    CoinPackage,
    CoinPurchase,
    MarketplacePrediction,
    MarketplacePurchase,
    RouletteSpin,
    MLModelRun,
    AdminJob,
)

__all__ = [
    "User",
    "FavoriteTicker",
    "StockData",
    "TechnicalIndicator",
    "Prediction",
    "Alert",
    "BacktestResult",
    "VirtualPortfolio",
    "PortfolioPosition",
    "SharedAnalysis",
    "AnalysisComment",
    "AnalysisLike",
    "SearchHistory",
    "Ticker",
    "Signal",
    "RewardGrant",
    "WheelSpin",
    "DiscountCoupon",
    "Strategy",
    "StrategyBacktestMetrics",
    "StrategyPurchase",
    "StrategyReview",
    "Subscription",
    "Payment",
    "BillingEvent",
    "AppReview",
    "CoinTransaction",
    "CoinPackage",
    "CoinPurchase",
    "MarketplacePrediction",
    "MarketplacePurchase",
    "RouletteSpin",
    "MLModelRun",
    "AdminJob",
]
