"""
DataService — descarga datos de Yahoo Finance y los almacena en caché (BD).
Compatible con yfinance 0.2.x y 1.x
"""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

from app import db
from app.models.stock_data import StockData
from app.services.market_data_service import MarketDataService, MarketDataUnavailable

logger = logging.getLogger(__name__)

# mcajamar - 22/02/2026: conecté el servicio de datos con yfinance para poder traer histórico de mercado desde backend.
# Ticker aliases (la API recibe "APPLE" pero yfinance usa "AAPL")
TICKER_MAP: dict[str, str] = {
    "APPLE": "AAPL",
    "GOOGL": "GOOGL",
    "GOOGLE": "GOOGL",
    "TESLA": "TSLA",
    "MICROSOFT": "MSFT",
    "AMAZON": "AMZN",
    "META": "META",
    "NETFLIX": "NFLX",
    "NVIDIA": "NVDA",
}

# Nombres descriptivos
TICKER_NAMES: dict[str, str] = {
    "AAPL": "Apple Inc.",
    "GOOGL": "Alphabet Inc.",
    "TSLA": "Tesla Inc.",
    "MSFT": "Microsoft Corporation",
    "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",
    "NFLX": "Netflix Inc.",
    "NVDA": "NVIDIA Corporation",
}


def resolve_ticker(ticker: str) -> str:
    """Convierte alias amigables al símbolo real de yfinance."""
    return TICKER_MAP.get(ticker.upper(), ticker.upper())


def _get_ticker_name(symbol: str) -> str:
    try:
        from app.services.ticker_service import TickerService
        return TickerService.get_name(symbol)
    except Exception:
        pass
    return TICKER_NAMES.get(symbol, f"{symbol} Corp.")


def _make_aware(dt: datetime) -> datetime:
    """Garantiza que un datetime sea timezone-aware (UTC)."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_df(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    """
    Normaliza un DataFrame de yfinance a columnas estándar:
    Date, Open, High, Low, Close, Volume.
    Maneja MultiIndex (yfinance >= 0.2.28) y columnas planas.
    """
    if df is None or df.empty:
        return None

    df = df.copy()

    # ── Aplanar MultiIndex de columnas ────────────────────────────────────────
    if isinstance(df.columns, pd.MultiIndex):
        # yfinance >= 0.2.28: columnas son (campo, ticker) o (ticker, campo)
        # Intentar extraer el primer nivel
        try:
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
        except Exception:
            pass

    # ── Asegurar que Date está como columna (no índice) ───────────────────────
    if "Date" not in df.columns and "Datetime" not in df.columns:
        if hasattr(df.index, "name") and str(df.index.name).lower() in ("date", "datetime"):
            df = df.reset_index()
        elif df.index.dtype in ("datetime64[ns]", "datetime64[ns, UTC]") or hasattr(df.index, "tz"):
            df = df.reset_index()
            df = df.rename(columns={df.columns[0]: "Date"})

    # ── Renombrar columna de fecha ────────────────────────────────────────────
    for col in df.columns:
        if str(col).lower() in ("date", "datetime"):
            df = df.rename(columns={col: "Date"})
            break

    if "Date" not in df.columns:
        logger.error("_normalize_df: no se encontró columna Date. Columnas: %s", list(df.columns))
        return None

    # ── Quitar timezone ───────────────────────────────────────────────────────
    try:
        df["Date"] = pd.to_datetime(df["Date"], utc=True).dt.tz_localize(None)
    except TypeError:
        try:
            df["Date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
        except Exception:
            df["Date"] = pd.to_datetime(df["Date"]).apply(
                lambda x: x.replace(tzinfo=None) if hasattr(x, "tzinfo") else x
            )

    # ── Conservar solo columnas necesarias ───────────────────────────────────
    keep = [c for c in ("Date", "Open", "High", "Low", "Close", "Volume") if c in df.columns]
    if "Close" not in keep:
        # En yfinance 1.x a veces se llama "Adj Close"
        if "Adj Close" in df.columns:
            df = df.rename(columns={"Adj Close": "Close"})
            keep = [c for c in ("Date", "Open", "High", "Low", "Close", "Volume") if c in df.columns]

    if "Close" not in keep:
        return None

    df = df[keep].copy()
    valid_close = df["Close"].apply(lambda value: MarketDataService.safe_float(value, field="Close"))
    if valid_close.dropna().empty:
        return None
    return df


class DataService:
    """Gestiona la obtención y caché de datos bursátiles."""

    @staticmethod
    def get_stock_data(ticker: str, days: int = 365) -> dict:
        """
        Devuelve datos históricos + indicadores para un ticker.
        Usa caché en BD; sólo descarga si los datos tienen más de 1 hora.
        """
        from app.services.technical_service import TechnicalService
        from app.models.indicators import TechnicalIndicator

        real_ticker = resolve_ticker(ticker)
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # ── Verificar caché ────────────────────────────────────────────────
        latest_cached = (
            StockData.query
            .filter_by(ticker=real_ticker)
            .order_by(StockData.date.desc())
            .first()
        )

        from_cache = False
        cache_age_hours = 0

        if latest_cached and latest_cached.created_at:
            aware_created = _make_aware(latest_cached.created_at)
            age = datetime.now(timezone.utc) - aware_created
            cache_age_hours = age.total_seconds() / 3600
            if cache_age_hours < 1:
                from_cache = True

        if not from_cache:
            try:
                DataService._download_and_cache(real_ticker, start_date, end_date)
            except MarketDataUnavailable:
                if not latest_cached:
                    raise
                from_cache = True
            except Exception as exc:
                logger.warning("yfinance error para %s: %s", real_ticker, exc)
                if not latest_cached:
                    raise ValueError(
                        f"No hay datos disponibles para '{ticker}'. "
                        f"Comprueba que el ticker es correcto y que el servidor tiene acceso a internet. "
                        f"Detalle: {exc}"
                    ) from exc
                from_cache = True

        # ── Calcular indicadores si no existen ─────────────────────────────
        latest_indicator = (
            TechnicalIndicator.query
            .filter_by(ticker=real_ticker)
            .order_by(TechnicalIndicator.date.desc())
            .first()
        )
        if not latest_indicator or (not from_cache and latest_indicator.date < end_date):
            try:
                TechnicalService.calculate_and_store(real_ticker)
            except Exception as exc:
                db.session.rollback()
                logger.warning("Error calculando indicadores para %s: %s", real_ticker, exc)

        # ── Construir respuesta ────────────────────────────────────────────
        records = (
            StockData.query
            .filter(StockData.ticker == real_ticker, StockData.date >= start_date)
            .order_by(StockData.date.asc())
            .all()
        )

        indicators_map: dict[date, dict] = {}
        indicator_records = (
            TechnicalIndicator.query
            .filter(TechnicalIndicator.ticker == real_ticker, TechnicalIndicator.date >= start_date)
            .all()
        )
        for ind in indicator_records:
            indicators_map[ind.date] = ind.to_dict()

        data_list = []
        for r in records:
            row = r.to_dict()
            ind = indicators_map.get(r.date, {})
            row.update({k: v for k, v in ind.items() if k != "date"})
            data_list.append(row)

        latest_record = next(
            (
                record for record in reversed(records)
                if MarketDataService.safe_float(record.close, field=f"{real_ticker}.stock_data.close") is not None
            ),
            None,
        )
        last_price = MarketDataService.safe_float(
            latest_record.close if latest_record else None,
            field=f"{real_ticker}.last_price",
        )
        if last_price is None:
            raise MarketDataUnavailable(real_ticker, "no_valid_cached_close")
        last_update = latest_record.created_at.isoformat() if latest_record and latest_record.created_at else None

        return {
            "ticker": ticker.upper(),
            "real_ticker": real_ticker,
            "name": _get_ticker_name(real_ticker),
            "currency": "USD",
            "last_price": last_price,
            "last_update": last_update,
            "data": data_list,
            "metadata": {
                "total_records": len(data_list),
                "date_range": f"{start_date} to {end_date}",
                "from_cache": from_cache,
                "cache_age_hours": round(cache_age_hours, 2),
            },
        }

    @staticmethod
    def _download_and_cache(ticker: str, start_date: date, end_date: date) -> None:
        """
        Descarga de yfinance e inserta/actualiza en la tabla stock_data.
        Compatible con yfinance 0.2.x y 1.x.
        """
        extra_start = start_date - timedelta(days=30)
        start_str = extra_start.isoformat()
        end_str = (end_date + timedelta(days=1)).isoformat()
        df: Optional[pd.DataFrame] = None

        # ── Método 1: Ticker.history() ────────────────────────────────────────
        try:
            tk = yf.Ticker(ticker)
            raw = tk.history(start=start_str, end=end_str, auto_adjust=True)
            if raw is not None and not raw.empty:
                df = _normalize_df(raw)
                if df is not None and not df.empty:
                    logger.info("yf.Ticker.history() OK para %s (%d filas)", ticker, len(df))
                else:
                    df = None
        except Exception as exc:
            logger.warning("yf.Ticker.history() falló para %s: %s — probando yf.download()", ticker, exc)
            df = None

        # ── Método 2: yf.download() ───────────────────────────────────────────
        if df is None or df.empty:
            try:
                raw = yf.download(
                    ticker,
                    start=start_str,
                    end=end_str,
                    auto_adjust=True,
                    progress=False,
                    multi_level_index=False,  # yfinance >= 0.2.48
                )
                if raw is not None and not raw.empty:
                    df = _normalize_df(raw)
                    if df is not None and not df.empty:
                        logger.info("yf.download() OK para %s (%d filas)", ticker, len(df))
                    else:
                        df = None
            except TypeError:
                # Versiones antiguas no tienen multi_level_index
                try:
                    raw = yf.download(
                        ticker,
                        start=start_str,
                        end=end_str,
                        auto_adjust=True,
                        progress=False,
                    )
                    if raw is not None and not raw.empty:
                        df = _normalize_df(raw)
                        if df is not None and not df.empty:
                            logger.info("yf.download() (compat) OK para %s (%d filas)", ticker, len(df))
                        else:
                            df = None
                except Exception as exc2:
                    logger.warning("yf.download() (compat) falló para %s: %s", ticker, exc2)
            except Exception as exc:
                logger.warning("yf.download() falló para %s: %s", ticker, exc)

        if df is None or df.empty:
            raise MarketDataUnavailable(ticker, "empty_dataframe")

        normalized_rows: dict[date, dict] = {}
        for _, row in df.iterrows():
            raw_date = row.get("Date") or row.name
            if isinstance(raw_date, pd.Timestamp):
                row_date = raw_date.date()
            elif hasattr(raw_date, "date"):
                row_date = raw_date.date()
            else:
                try:
                    row_date = pd.Timestamp(raw_date).date()
                except Exception:
                    continue

            def _val(col: str):
                return MarketDataService.safe_float(row.get(col), field=f"{ticker}.{col}")

            vol = row.get("Volume")
            volume_value = MarketDataService.safe_float(vol, field=f"{ticker}.Volume")
            volume = int(volume_value) if volume_value is not None and volume_value >= 0 else None

            normalized_rows[row_date] = {
                "ticker": ticker,
                "date": row_date,
                "open": _val("Open"),
                "high": _val("High"),
                "low": _val("Low"),
                "close": _val("Close"),
                "volume": volume,
                "created_at": datetime.now(timezone.utc),
            }

        rows = list(normalized_rows.values())
        if not rows or not any(row.get("close") is not None for row in rows):
            raise MarketDataUnavailable(ticker, "no_valid_rows")

        existing_dates = {
            r.date for r in StockData.query
            .filter(StockData.ticker == ticker, StockData.date.in_(normalized_rows.keys()))
            .all()
        }
        rows_inserted = sum(1 for row in rows if row["date"] not in existing_dates)
        rows_updated = len(rows) - rows_inserted

        if db.engine.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(StockData.__table__).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["ticker", "date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "created_at": stmt.excluded.created_at,
                },
            )
            db.session.execute(stmt)
        else:
            for row in rows:
                with db.session.no_autoflush:
                    existing = StockData.query.filter_by(ticker=ticker, date=row["date"]).first()
                if existing:
                    existing.open = row["open"]
                    existing.high = row["high"]
                    existing.low = row["low"]
                    existing.close = row["close"]
                    existing.volume = row["volume"]
                    existing.created_at = row["created_at"]
                else:
                    db.session.add(StockData(**row))

        db.session.commit()
        logger.info(
            "BD actualizada para %s: %d insertados, %d actualizados",
            ticker, rows_inserted, rows_updated,
        )

    @staticmethod
    def get_dataframe(ticker: str, days: int = 1825) -> pd.DataFrame:
        """
        Devuelve DataFrame con datos históricos (para servicios ML).
        """
        real_ticker = resolve_ticker(ticker)
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        records = (
            StockData.query
            .filter(StockData.ticker == real_ticker, StockData.date >= start_date)
            .order_by(StockData.date.asc())
            .all()
        )

        earliest_record = (
            StockData.query
            .filter_by(ticker=real_ticker)
            .order_by(StockData.date.asc())
            .first()
        )

        needs_download = (
            not records
            or earliest_record is None
            or (earliest_record.date > (start_date + timedelta(days=7)))
        )

        if needs_download:
            logger.info(
                "get_dataframe: descargando %d días para %s (earliest=%s, start=%s)",
                days, real_ticker,
                earliest_record.date if earliest_record else "None",
                start_date,
            )
            try:
                DataService._download_and_cache(real_ticker, start_date, end_date)
                records = (
                    StockData.query
                    .filter(StockData.ticker == real_ticker, StockData.date >= start_date)
                    .order_by(StockData.date.asc())
                    .all()
                )
            except Exception as exc:
                logger.warning("get_dataframe: descarga falló para %s: %s", real_ticker, exc)

        rows = [
            {"ds": r.date, "y": float(r.close)}
            for r in records
            if r.close is not None and not (isinstance(r.close, float) and np.isnan(r.close))
        ]
        df = pd.DataFrame(rows)
        if not df.empty:
            df["ds"] = pd.to_datetime(df["ds"])
        return df

    @staticmethod
    def get_dataframe_range(
        ticker: str,
        start_date: date,
        end_date: date,
        min_rows: int = 10,
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        """
        Devuelve datos historicos para un rango exacto y descarga lo que falte.

        El backtesting no puede depender de que antes se haya abierto la pagina de
        prediccion; por eso este metodo trabaja con fechas reales, no con "N dias
        hacia atras desde hoy".
        """
        real_ticker = resolve_ticker(ticker)
        requested_end = min(end_date, date.today())
        if requested_end < start_date:
            return pd.DataFrame(columns=["ds", "y"])

        def _load_records():
            return (
                StockData.query
                .filter(
                    StockData.ticker == real_ticker,
                    StockData.date >= start_date,
                    StockData.date <= requested_end,
                    StockData.close.isnot(None),
                )
                .order_by(StockData.date.asc())
                .all()
            )

        records = _load_records()
        first_date = records[0].date if records else None
        last_date = records[-1].date if records else None
        needs_download = (
            force_refresh
            or len(records) < min_rows
            or first_date is None
            or first_date > (start_date + timedelta(days=7))
            or last_date is None
            or last_date < (requested_end - timedelta(days=7))
        )

        if needs_download:
            logger.info(
                "get_dataframe_range: preparando datos %s desde %s hasta %s (filas cache=%d)",
                real_ticker,
                start_date,
                requested_end,
                len(records),
            )
            try:
                DataService._download_and_cache(real_ticker, start_date, requested_end)
                records = _load_records()
            except Exception as exc:
                logger.warning(
                    "get_dataframe_range: no se pudieron descargar datos para %s (%s - %s): %s",
                    real_ticker,
                    start_date,
                    requested_end,
                    exc,
                )
                if not records:
                    raise MarketDataUnavailable(real_ticker, "historical_download_failed") from exc

        rows = [
            {"ds": r.date, "y": float(r.close)}
            for r in records
            if r.close is not None and not (isinstance(r.close, float) and np.isnan(r.close))
        ]
        df = pd.DataFrame(rows)
        if not df.empty:
            df["ds"] = pd.to_datetime(df["ds"])
        return df

    @staticmethod
    def get_latest_price(ticker: str) -> float:
        """Return the latest valid close, downloading recent data if needed."""
        real_ticker = resolve_ticker(ticker)
        latest = (
            StockData.query
            .filter(StockData.ticker == real_ticker, StockData.close.isnot(None))
            .order_by(StockData.date.desc())
            .first()
        )
        price = MarketDataService.safe_float(
            latest.close if latest else None,
            field=f"{real_ticker}.latest_cached_close",
        )
        if price is not None and price > 0:
            return price

        end_date = date.today()
        start_date = end_date - timedelta(days=30)
        DataService._download_and_cache(real_ticker, start_date, end_date)
        latest = (
            StockData.query
            .filter(StockData.ticker == real_ticker, StockData.close.isnot(None))
            .order_by(StockData.date.desc())
            .first()
        )
        price = MarketDataService.safe_float(
            latest.close if latest else None,
            field=f"{real_ticker}.latest_downloaded_close",
        )
        if price is None or price <= 0:
            raise MarketDataUnavailable(real_ticker, "no_valid_latest_price")
        return price

    @staticmethod
    def get_batch(tickers: list[str], days: int = 30) -> dict:
        """Obtiene datos para múltiples tickers."""
        result = {}
        for ticker in tickers:
            try:
                result[ticker] = DataService.get_stock_data(ticker, days)
            except Exception as exc:
                result[ticker] = {"error": str(exc)}
        return result
