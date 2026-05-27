"""Central market-data facade.

yfinance stays backend-only. Existing DataService/TickerService keep doing the
heavy lifting; this facade gives admin and analysis routes a stable entry point and
normalises fragile provider values before they reach business logic.
"""
from __future__ import annotations

import logging
import math
from decimal import Decimal, InvalidOperation

from app import db
from app.models.ticker import Ticker

logger = logging.getLogger(__name__)


class MarketDataUnavailable(ValueError):
    """Controlled market-data failure that should be returned as HTTP 422."""

    def __init__(self, symbol: str, reason: str = "no_valid_price"):
        self.symbol = (symbol or "").upper()
        self.reason = reason
        super().__init__(f"No hay precio valido disponible para el ticker {self.symbol}")


class MarketDataService:
    @staticmethod
    def safe_float(value, default=None, field: str = "market_value"):
        """Convert provider/database values to finite floats without exploding."""
        if value is None:
            logger.warning("safe_float: %s viene como None", field)
            return default
        try:
            if isinstance(value, str):
                value = value.strip()
                if not value:
                    logger.warning("safe_float: %s viene como string vacio", field)
                    return default
            if isinstance(value, Decimal):
                try:
                    value = float(value)
                except (InvalidOperation, ValueError, TypeError):
                    logger.warning("safe_float: Decimal invalido en %s: %r", field, value)
                    return default
            result = float(value)
        except (TypeError, ValueError, InvalidOperation) as exc:
            logger.warning("safe_float: valor invalido en %s=%r (%s)", field, value, exc)
            return default
        if math.isnan(result) or math.isinf(result):
            logger.warning("safe_float: valor no finito en %s=%r", field, value)
            return default
        return result

    @staticmethod
    def validate_ticker_symbol(symbol: str) -> bool:
        symbol = (symbol or "").strip().upper()
        return bool(symbol) and 1 <= len(symbol) <= 12 and symbol.replace(".", "").replace("-", "").isalnum()

    @staticmethod
    def validate_market_dataframe(dataframe, symbol: str | None = None):
        if dataframe is None or getattr(dataframe, "empty", True):
            raise MarketDataUnavailable(symbol or "", "empty_dataframe")
        df = dataframe.copy()
        if "Close" not in df.columns and "Adj Close" in df.columns:
            df = df.rename(columns={"Adj Close": "Close"})
        if "Close" not in df.columns:
            raise MarketDataUnavailable(symbol or "", "missing_close")
        valid_close = df["Close"].apply(lambda value: MarketDataService.safe_float(value, field=f"{symbol}.Close"))
        if valid_close.dropna().empty:
            raise MarketDataUnavailable(symbol or "", "no_valid_close")
        return df

    @staticmethod
    def latest_close_from_dataframe(dataframe, symbol: str):
        df = MarketDataService.validate_market_dataframe(dataframe, symbol)
        closes = [
            MarketDataService.safe_float(value, field=f"{symbol}.Close")
            for value in df["Close"].tolist()
        ]
        valid = [value for value in closes if value is not None]
        if not valid:
            raise MarketDataUnavailable(symbol, "no_valid_close")
        return valid[-1]

    @staticmethod
    def get_latest_price(symbol: str):
        try:
            return MarketDataService.get_valid_latest_price(symbol)
        except MarketDataUnavailable:
            return None

    @staticmethod
    def get_valid_latest_price(symbol: str):
        symbol = (symbol or "").strip().upper()
        ticker = Ticker.query.filter_by(symbol=symbol).first()
        db_price = MarketDataService.safe_float(getattr(ticker, "last_price", None), field=f"{symbol}.ticker.last_price")
        if db_price is not None and db_price > 0:
            return db_price

        try:
            from app.services.data_service import DataService

            latest = DataService.get_latest_price(symbol)
            latest = MarketDataService.safe_float(latest, field=f"{symbol}.DataService.get_latest_price")
            if latest is not None and latest > 0:
                return latest
        except MarketDataUnavailable:
            raise
        except Exception as exc:
            logger.warning("get_valid_latest_price: historico no disponible para %s: %s", symbol, exc)

        try:
            import yfinance as yf

            yft = yf.Ticker(symbol)
            fast_info = getattr(yft, "fast_info", {}) or {}
            try:
                info = yft.info or {}
            except Exception:
                info = {}
            candidates = [
                fast_info.get("last_price") if hasattr(fast_info, "get") else None,
                fast_info.get("lastPrice") if hasattr(fast_info, "get") else None,
                info.get("currentPrice"),
                info.get("regularMarketPrice"),
                info.get("previousClose"),
                info.get("regularMarketPreviousClose"),
            ]
            for idx, candidate in enumerate(candidates):
                price = MarketDataService.safe_float(candidate, field=f"{symbol}.provider_candidate_{idx}")
                if price is not None and price > 0:
                    return price
        except Exception as exc:
            logger.warning("get_valid_latest_price: provider fallback fallo para %s: %s", symbol, exc)
        raise MarketDataUnavailable(symbol)

    @staticmethod
    def get_historical_data(symbol: str, period: str = "1y", interval: str = "1d"):
        from app.services.data_service import DataService
        return DataService.fetch_stock_data(symbol, period=period, interval=interval)

    @staticmethod
    def update_ticker_data(ticker_id: int):
        from app.services.ticker_service import TickerService
        ticker = Ticker.query.get(ticker_id)
        if not ticker:
            raise ValueError("Ticker no encontrado")
        return TickerService.sync_ticker(ticker.symbol)

    @staticmethod
    def store_historical_prices(ticker: Ticker, dataframe):
        # Existing StockData/DataService already owns historical persistence.
        db.session.flush()
        return {"ticker_id": ticker.id, "rows": 0, "note": "Persistencia historica delegada a DataService"}
