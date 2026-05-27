"""
TechnicalService — calcula SMA, RSI, MACD y Bandas de Bollinger.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from app import db
from app.models.indicators import TechnicalIndicator
from app.models.stock_data import StockData

logger = logging.getLogger(__name__)


class TechnicalService:

    @staticmethod
    def calculate_and_store(ticker: str) -> None:
        """Calcula indicadores para todos los registros de un ticker y los guarda en BD."""
        records = (
            StockData.query
            .filter_by(ticker=ticker)
            .order_by(StockData.date.asc())
            .all()
        )
        clean_records = []
        closes_list = []
        for record in records:
            try:
                close_value = float(record.close)
            except (TypeError, ValueError):
                continue
            if np.isfinite(close_value):
                clean_records.append(record)
                closes_list.append(close_value)

        if len(clean_records) < 20:
            logger.warning("Insuficientes datos para indicadores de %s (%d registros)", ticker, len(clean_records))
            return

        dates = [r.date for r in clean_records]
        closes = np.array(closes_list, dtype=float)

        sma_20 = TechnicalService._sma(closes, 20)
        sma_50 = TechnicalService._sma(closes, 50)
        sma_200 = TechnicalService._sma(closes, 200)
        rsi_14 = TechnicalService._rsi(closes, 14)
        macd_line, signal_line, macd_hist = TechnicalService._macd(closes)
        bb_upper, bb_middle, bb_lower = TechnicalService._bollinger(closes, 20)

        indicator_rows = []
        indicator_fields = (
            "sma_20",
            "sma_50",
            "sma_200",
            "rsi_14",
            "macd",
            "macd_signal",
            "macd_hist",
            "bollinger_upper",
            "bollinger_middle",
            "bollinger_lower",
        )

        for i, d in enumerate(dates):
            vals = dict(
                sma_20=sma_20[i],
                sma_50=sma_50[i],
                sma_200=sma_200[i],
                rsi_14=rsi_14[i],
                macd=macd_line[i],
                macd_signal=signal_line[i],
                macd_hist=macd_hist[i],
                bollinger_upper=bb_upper[i],
                bollinger_middle=bb_middle[i],
                bollinger_lower=bb_lower[i],
            )
            # Reemplazar nan por None
            vals = {k: (None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 4))
                    for k, v in vals.items()}
            indicator_rows.append({
                "ticker": ticker,
                "date": d,
                "calculated_at": datetime.now(timezone.utc),
                **vals,
            })

        try:
            dialect_name = db.session.get_bind().dialect.name
            if dialect_name == "postgresql":
                from sqlalchemy.dialects.postgresql import insert as pg_insert

                stmt = pg_insert(TechnicalIndicator.__table__).values(indicator_rows)
                update_cols = {field: stmt.excluded[field] for field in indicator_fields}
                update_cols["calculated_at"] = stmt.excluded.calculated_at
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_technical_indicators_ticker_date",
                    set_=update_cols,
                )
                db.session.execute(stmt)
            else:
                with db.session.no_autoflush:
                    for row in indicator_rows:
                        existing = TechnicalIndicator.query.filter_by(
                            ticker=row["ticker"],
                            date=row["date"],
                        ).first()
                        vals = {field: row[field] for field in indicator_fields}
                        if existing:
                            for field, value in vals.items():
                                setattr(existing, field, value)
                            existing.calculated_at = row["calculated_at"]
                        else:
                            db.session.add(TechnicalIndicator(**row))
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
        logger.info("Indicadores calculados para %s (%d días)", ticker, len(dates))

    # ── Helpers de cálculo ─────────────────────────────────────────────────

    @staticmethod
    def _sma(closes: np.ndarray, period: int) -> list:
        result = []
        for i in range(len(closes)):
            if i < period - 1:
                result.append(None)
            else:
                result.append(float(np.mean(closes[i - period + 1: i + 1])))
        return result

    @staticmethod
    def _rsi(closes: np.ndarray, period: int = 14) -> list:
        result = [None] * len(closes)
        if len(closes) < period + 1:
            return result

        deltas = np.diff(closes)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)

        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        for i in range(period, len(closes)):
            idx = i - 1  # delta index
            gain = gains[idx]
            loss = losses[idx]
            avg_gain = (avg_gain * (period - 1) + gain) / period
            avg_loss = (avg_loss * (period - 1) + loss) / period
            if avg_loss == 0:
                result[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                result[i] = round(100 - (100 / (1 + rs)), 2)

        return result

    @staticmethod
    def _ema(closes: np.ndarray, period: int) -> np.ndarray:
        ema = np.full(len(closes), np.nan)
        if len(closes) < period:
            return ema
        ema[period - 1] = np.mean(closes[:period])
        k = 2 / (period + 1)
        for i in range(period, len(closes)):
            ema[i] = closes[i] * k + ema[i - 1] * (1 - k)
        return ema

    @staticmethod
    def _macd(closes: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9):
        ema_fast = TechnicalService._ema(closes, fast)
        ema_slow = TechnicalService._ema(closes, slow)
        macd_line = ema_fast - ema_slow

        # Signal: EMA del MACD
        valid = ~np.isnan(macd_line)
        signal_arr = np.full(len(closes), np.nan)
        if valid.sum() >= signal:
            idx_start = np.argmax(valid)
            macd_valid = macd_line[valid]
            signal_vals = TechnicalService._ema(macd_valid, signal)
            signal_arr[idx_start:] = signal_vals

        hist = macd_line - signal_arr

        def _to_list(arr):
            return [None if np.isnan(v) else round(float(v), 4) for v in arr]

        return _to_list(macd_line), _to_list(signal_arr), _to_list(hist)

    @staticmethod
    def _bollinger(closes: np.ndarray, period: int = 20, num_std: float = 2.0):
        upper = []
        middle = []
        lower = []
        for i in range(len(closes)):
            if i < period - 1:
                upper.append(None)
                middle.append(None)
                lower.append(None)
            else:
                window = closes[i - period + 1: i + 1]
                mean = float(np.mean(window))
                std = float(np.std(window, ddof=0))
                upper.append(round(mean + num_std * std, 4))
                middle.append(round(mean, 4))
                lower.append(round(mean - num_std * std, 4))
        return upper, middle, lower

    # ── Señales e interpretación ───────────────────────────────────────────

    @staticmethod
    def get_signals(ticker: str) -> dict:
        """Devuelve señales técnicas basadas en los últimos indicadores."""
        from app.models.stock_data import StockData

        latest_ind = (
            TechnicalIndicator.query
            .filter_by(ticker=ticker)
            .order_by(TechnicalIndicator.date.desc())
            .first()
        )
        latest_price = (
            StockData.query
            .filter_by(ticker=ticker)
            .order_by(StockData.date.desc())
            .first()
        )

        if not latest_ind or not latest_price:
            return {}

        try:
            price = float(latest_price.close)
        except (TypeError, ValueError):
            return {}
        ind = latest_ind.to_dict()

        sma_20 = ind.get("sma_20")
        sma_50 = ind.get("sma_50")
        sma_200 = ind.get("sma_200")
        rsi = ind.get("rsi_14")
        macd = ind.get("macd")
        macd_signal = ind.get("macd_signal")
        bb_upper = ind.get("bollinger_upper")
        bb_lower = ind.get("bollinger_lower")
        bb_middle = ind.get("bollinger_middle")

        signals = {
            "golden_cross": bool(sma_50 is not None and sma_200 is not None and sma_50 > sma_200),
            "death_cross": bool(sma_50 is not None and sma_200 is not None and sma_50 < sma_200),
            "rsi_overbought": bool(rsi is not None and rsi > 70),
            "rsi_oversold": bool(rsi is not None and rsi < 30),
            "macd_bullish": bool(macd is not None and macd_signal is not None and macd > macd_signal),
            "macd_divergence": None,
            "price_above_sma20": bool(sma_20 is not None and price > sma_20),
            "price_above_sma50": bool(sma_50 is not None and price > sma_50),
        }

        # Tendencia
        direction = "lateral"
        if sma_20 is not None and sma_50 is not None:
            if price > sma_20 > sma_50:
                direction = "alcista"
            elif price < sma_20 < sma_50:
                direction = "bajista"

        strength = "moderada"
        if rsi is not None:
            if rsi > 65 or rsi < 35:
                strength = "fuerte"
            elif 45 < rsi < 55:
                strength = "débil"

        # Soporte/resistencia aproximados (BB)
        support = round(bb_lower, 2) if bb_lower is not None else None
        resistance = round(bb_upper, 2) if bb_upper is not None else None

        bb_pos = None
        if bb_upper is not None and bb_lower is not None and bb_upper != bb_lower:
            bb_pos = round((price - bb_lower) / (bb_upper - bb_lower), 4)

        return {
            "latest": {
                "date": latest_ind.date.isoformat(),
                "price": price,
                **ind,
                "bollinger_width": round(bb_upper - bb_lower, 4) if bb_upper is not None and bb_lower is not None else None,
                "bb_position": bb_pos,
            },
            "signals": signals,
            "trend": {
                "direction": direction,
                "strength": strength,
                "support": support,
                "resistance": resistance,
            },
        }
