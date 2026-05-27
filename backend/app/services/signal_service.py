"""
SignalService — genera, puntúa, persiste y cachea señales premium de mercado.

Señales implementadas (lógica técnica real):
  1. oversold   — RSI < 30, precio cerca de Bollinger inferior
  2. momentum   — MA20 > MA50, precio > MA20, volumen sobre media
  3. breakout   — precio rompe máximo reciente con confirmación de volumen
  4. trend_sell — RSI > 70 o MA20 < MA50 con volumen decreciente

Scoring 0–100; solo se persisten señales con score ≥ 55.
Caché Redis con TTL configurable; fallback en memoria si Redis no está disponible.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import numpy as np

from app import db

logger = logging.getLogger(__name__)

# ── Configuración ──────────────────────────────────────────────────────────────
MIN_SCORE         = 55       # umbral mínimo para publicar señal
SIGNAL_TTL_HOURS  = 24       # cuánto tiempo es válida una señal
CACHE_TTL_SIGNALS = 300      # segundos (5 min) para lista paginada
CACHE_TTL_TOP     = 600      # segundos (10 min) para top oportunidades / momentum
CACHE_KEY_LIST    = "signals:active:list"
CACHE_KEY_TOP     = "signals:top"
CACHE_KEY_MOMENTUM = "signals:momentum"

# ── Caché en memoria (fallback cuando Redis no está disponible) ────────────────
_mem_cache: dict[str, tuple[float, str]] = {}   # key → (ts_expire, json_str)


def _cache_get(key: str) -> Optional[str]:
    """Lee de Redis o memoria."""
    try:
        from app import redis_client
        if redis_client:
            return redis_client.get(key)
    except Exception:
        pass
    entry = _mem_cache.get(key)
    if entry and entry[0] > time.time():
        return entry[1]
    _mem_cache.pop(key, None)
    return None


def _cache_set(key: str, value: str, ttl: int = 300) -> None:
    """Escribe en Redis o memoria."""
    try:
        from app import redis_client
        if redis_client:
            redis_client.setex(key, ttl, value)
            return
    except Exception:
        pass
    _mem_cache[key] = (time.time() + ttl, value)


def _cache_del_pattern(pattern: str) -> None:
    """Invalida claves Redis que coinciden con el patrón."""
    try:
        from app import redis_client
        if redis_client:
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
            return
    except Exception:
        pass
    # Memoria: borrar claves que contengan el prefijo
    prefix = pattern.replace("*", "")
    for k in list(_mem_cache.keys()):
        if k.startswith(prefix):
            _mem_cache.pop(k, None)


# ── Helpers de indicadores ─────────────────────────────────────────────────────

def _volume_ratio(volumes: list[float], lookback: int = 20) -> float:
    """Ratio volumen actual / media de últimos `lookback` días."""
    if len(volumes) < 2:
        return 1.0
    recent = volumes[-1]
    mean   = float(np.mean(volumes[-lookback - 1:-1])) if len(volumes) > lookback else float(np.mean(volumes[:-1]))
    return round(recent / mean, 3) if mean > 0 else 1.0


def _recent_high(highs: list[float], lookback: int = 20) -> float:
    """Máximo de los últimos `lookback` días (excluyendo el día actual)."""
    window = highs[-lookback - 1:-1] if len(highs) > lookback else highs[:-1]
    return float(np.max(window)) if window else highs[-1]


def _pct_change(closes: list[float], n: int) -> float:
    """Cambio porcentual en los últimos `n` días."""
    if len(closes) <= n:
        return 0.0
    old = closes[-n - 1]
    new = closes[-1]
    return round((new - old) / old * 100, 2) if old > 0 else 0.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _ml_confirmation(symbol: str, price: float) -> dict | None:
    """
    Ejecuta una confirmacion ML de corto plazo sobre datos historicos reales.
    La senal sigue naciendo de indicadores tecnicos; el ML calibra el score.
    """
    if not price or price <= 0:
        return None
    try:
        from app.services.ml_service import MLService

        result = MLService.predict_all(symbol, horizon_days=5, historical_days=365)
        predictions: list[float] = []
        model_names: list[str] = []
        for index, payload in enumerate(result.get("models") or []):
            if not payload or payload.get("error"):
                continue
            model_name = payload.get("name") or f"model_{index + 1}"
            points = payload.get("predictions") or []
            if not points:
                continue
            predicted = points[-1].get("predicted_price") or points[0].get("predicted_price")
            if predicted:
                predictions.append(float(predicted))
                model_names.append(model_name)

        if not predictions:
            return None

        average_prediction = float(np.mean(predictions))
        expected_return_pct = (average_prediction - price) / price * 100
        positive_models = sum(1 for p in predictions if p > price)
        agreement = positive_models / len(predictions)
        if expected_return_pct < 0:
            agreement = (len(predictions) - positive_models) / len(predictions)

        return {
            "expected_return_pct": round(expected_return_pct, 3),
            "average_prediction": round(average_prediction, 4),
            "models_used": model_names,
            "models_count": len(predictions),
            "agreement": round(agreement, 3),
            "bias": "bullish" if expected_return_pct > 0 else "bearish" if expected_return_pct < 0 else "neutral",
        }
    except Exception as exc:
        logger.debug("Confirmacion ML omitida para %s: %s", symbol, exc)
        return None


# ── Funciones de scoring ────────────────────────────────────────────────────────

def _score_oversold(rsi: float, bb_pos: float, vol_ratio: float,
                    price: float, bb_lower: float) -> int:
    """
    Score para señal oversold (posible compra):
    - RSI cuanto más bajo, mejor (ideal < 25)
    - Precio cercano / por debajo de BB inferior (bb_pos < 0.15)
    - Volumen no anormalmente bajo (vol_ratio >= 0.7)
    """
    s = 0.0
    # RSI (40 puntos max)
    if rsi < 20:
        s += 40
    elif rsi < 25:
        s += 32
    elif rsi < 30:
        s += 24
    else:
        s += max(0, (35 - rsi) * 1.5)

    # Posición en Bollinger (30 puntos max)
    if bb_pos <= 0:
        s += 30
    elif bb_pos < 0.10:
        s += 25
    elif bb_pos < 0.20:
        s += 15
    elif bb_pos < 0.30:
        s += 8

    # Volumen razonable (20 puntos max)
    if 0.8 <= vol_ratio <= 2.5:
        s += 20
    elif 0.6 <= vol_ratio <= 3.0:
        s += 12
    elif vol_ratio >= 0.4:
        s += 6

    # Precio debajo de BB lower: bonus (10 puntos)
    if bb_lower and price < bb_lower:
        s += 10

    return min(100, int(round(s)))


def _score_momentum(ma20: float, ma50: float, price: float, vol_ratio: float,
                    rsi: float, macd_hist: Optional[float]) -> int:
    """
    Score para señal momentum (compra alcista):
    - MA20 > MA50 (separación cuanto mayor, mejor)
    - Precio > MA20
    - Volumen sobre media (vol_ratio > 1.0)
    - RSI en zona 50-65 (sano, no sobrecomprado)
    - MACD histograma positivo y creciendo
    """
    s = 0.0
    # Separación MA20/MA50 (30 puntos max)
    sep_pct = (ma20 - ma50) / ma50 * 100 if ma50 > 0 else 0
    if sep_pct > 5:
        s += 30
    elif sep_pct > 3:
        s += 22
    elif sep_pct > 1.5:
        s += 15
    elif sep_pct > 0.5:
        s += 8
    elif sep_pct > 0:
        s += 3

    # Precio sobre MA20 (20 puntos max)
    if price > ma20:
        above_pct = (price - ma20) / ma20 * 100 if ma20 > 0 else 0
        if above_pct > 3:
            s += 20
        elif above_pct > 1.5:
            s += 14
        else:
            s += 8

    # Volumen (25 puntos max)
    if vol_ratio > 2.0:
        s += 25
    elif vol_ratio > 1.5:
        s += 20
    elif vol_ratio > 1.2:
        s += 15
    elif vol_ratio > 1.0:
        s += 10
    elif vol_ratio > 0.8:
        s += 5

    # RSI (15 puntos max — óptimo 50-65)
    if 52 <= rsi <= 65:
        s += 15
    elif 48 <= rsi <= 70:
        s += 10
    elif 40 <= rsi <= 72:
        s += 5

    # MACD histograma positivo (10 puntos max)
    if macd_hist is not None and macd_hist > 0:
        s += 10

    return min(100, int(round(s)))


def _score_breakout(price: float, recent_high: float, vol_ratio: float,
                    ma20: float, rsi: float) -> int:
    """
    Score para señal breakout:
    - Precio supera máximo reciente con margen
    - Volumen alto (confirmación)
    - Precio > MA20
    """
    s = 0.0
    # Rotura de máximo (35 puntos max)
    if recent_high > 0:
        break_pct = (price - recent_high) / recent_high * 100
        if break_pct > 3:
            s += 35
        elif break_pct > 1.5:
            s += 25
        elif break_pct > 0.5:
            s += 15
        elif break_pct > 0:
            s += 8

    # Volumen de confirmación (35 puntos max — clave en breakout)
    if vol_ratio > 2.5:
        s += 35
    elif vol_ratio > 2.0:
        s += 28
    elif vol_ratio > 1.5:
        s += 20
    elif vol_ratio > 1.2:
        s += 12
    elif vol_ratio > 1.0:
        s += 6

    # Precio sobre MA20 (20 puntos)
    if price > ma20:
        s += 20

    # RSI no sobrecomprado todavía (10 puntos max)
    if rsi < 60:
        s += 10
    elif rsi < 70:
        s += 5

    return min(100, int(round(s)))


def _score_sell(rsi: float, ma20: float, ma50: float, vol_ratio: float,
                bb_pos: float, macd_hist: Optional[float]) -> int:
    """
    Score para señal de venta/debilidad:
    - RSI > 70 (sobrecomprado)
    - MA20 < MA50 (death cross o cruce a la baja)
    - Volumen decreciente
    - Precio en zona alta de Bollinger
    """
    s = 0.0
    # RSI sobrecomprado (40 puntos max)
    if rsi > 80:
        s += 40
    elif rsi > 75:
        s += 32
    elif rsi > 70:
        s += 24
    else:
        s += max(0, (rsi - 65) * 2)

    # MA20 < MA50 (debilidad tendencia, 30 puntos max)
    if ma50 > 0:
        sep_pct = (ma50 - ma20) / ma50 * 100
        if sep_pct > 3:
            s += 30
        elif sep_pct > 1.5:
            s += 20
        elif sep_pct > 0:
            s += 10

    # Posición alta en Bollinger (20 puntos max)
    if bb_pos >= 0.90:
        s += 20
    elif bb_pos >= 0.80:
        s += 14
    elif bb_pos >= 0.70:
        s += 8

    # Volumen decreciente o MACD negativo (10 puntos max)
    if vol_ratio < 0.8:
        s += 5
    if macd_hist is not None and macd_hist < 0:
        s += 5

    return min(100, int(round(s)))


# ── Servicio principal ─────────────────────────────────────────────────────────

class SignalService:
    """Genera, persiste, cachea y sirve señales premium."""

    # ── Generación ─────────────────────────────────────────────────────────────

    @staticmethod
    def _apply_ml_confirmation(signal: dict, symbol: str, price: float) -> dict:
        ml = _ml_confirmation(symbol, price)
        if not ml:
            signal["generated_by"] = "technical"
            return signal

        expected = float(ml["expected_return_pct"])
        if signal["signal_type"] == "buy":
            adjustment = _clamp(expected * 2.0, -12, 12)
        elif signal["signal_type"] == "sell":
            adjustment = _clamp(-expected * 2.0, -12, 12)
        else:
            adjustment = _clamp(abs(expected), 0, 6)

        if ml.get("agreement", 0) >= 0.66:
            adjustment += 2 if adjustment >= 0 else -2

        score = int(round(_clamp((signal.get("score") or MIN_SCORE) + adjustment, MIN_SCORE, 100)))
        signal["score"] = score
        signal["confidence"] = round(score / 100, 3)
        signal.setdefault("indicators", {})["ml"] = ml
        signal["generated_by"] = "ml_technical"
        suffix = (
            f" ML 5d espera {expected:+.2f}% con {ml['models_count']} modelos "
            f"({int((ml.get('agreement') or 0) * 100)}% consenso)."
        )
        signal["reason"] = ((signal.get("reason") or "").rstrip() + suffix)[:400]
        return signal

    @staticmethod
    def generate_for_ticker(symbol: str) -> list[dict]:
        """
        Analiza un ticker y devuelve una lista de señales calculadas (sin persistir).
        Requiere que existan TechnicalIndicator y StockData en BD.
        """
        from app.models.indicators import TechnicalIndicator
        from app.models.stock_data  import StockData

        # Obtener indicadores recientes (últimos 60 días para tener histórico de volumen)
        indicators = (
            TechnicalIndicator.query
            .filter_by(ticker=symbol)
            .order_by(TechnicalIndicator.date.desc())
            .limit(60)
            .all()
        )
        indicators = list(reversed(indicators))
        if len(indicators) < 5:
            try:
                from app.services.data_service import DataService
                DataService.get_stock_data(symbol, days=180)
                indicators = (
                    TechnicalIndicator.query
                    .filter_by(ticker=symbol)
                    .order_by(TechnicalIndicator.date.desc())
                    .limit(60)
                    .all()
                )
                indicators = list(reversed(indicators))
            except Exception as exc:
                logger.debug("No se pudieron preparar indicadores para %s: %s", symbol, exc)
            if len(indicators) < 5:
                logger.debug("No hay suficientes indicadores para %s (%d)", symbol, len(indicators))
                return []

        # Precios e historico de stock_data para volumen
        stock_records = (
            StockData.query
            .filter_by(ticker=symbol)
            .order_by(StockData.date.desc())
            .limit(60)
            .all()
        )
        stock_records = list(reversed(stock_records))
        if not stock_records:
            try:
                from app.services.data_service import DataService
                DataService.get_stock_data(symbol, days=180)
                stock_records = (
                    StockData.query
                    .filter_by(ticker=symbol)
                    .order_by(StockData.date.desc())
                    .limit(60)
                    .all()
                )
                stock_records = list(reversed(stock_records))
            except Exception as exc:
                logger.debug("No se pudieron preparar precios para %s: %s", symbol, exc)
        if not stock_records:
            return []

        # Últimos valores
        latest_ind  = indicators[-1]
        latest_stock = stock_records[-1]

        price    = float(latest_stock.close) if latest_stock.close else None
        if not price:
            return []

        rsi      = float(latest_ind.rsi_14)     if latest_ind.rsi_14      else None
        ma20     = float(latest_ind.sma_20)     if latest_ind.sma_20      else None
        ma50     = float(latest_ind.sma_50)     if latest_ind.sma_50      else None
        bb_upper = float(latest_ind.bollinger_upper)  if latest_ind.bollinger_upper  else None
        bb_lower = float(latest_ind.bollinger_lower)  if latest_ind.bollinger_lower  else None
        bb_mid   = float(latest_ind.bollinger_middle) if latest_ind.bollinger_middle else None
        macd     = float(latest_ind.macd)       if latest_ind.macd        else None
        macd_sig = float(latest_ind.macd_signal) if latest_ind.macd_signal else None
        macd_hist_v = None
        if macd is not None and macd_sig is not None:
            macd_hist_v = macd - macd_sig

        # Listas para cálculos históricos
        closes  = [float(r.close)  for r in stock_records if r.close  is not None]
        highs   = [float(r.high)   for r in stock_records if r.high   is not None]
        volumes = [float(r.volume) for r in stock_records if r.volume is not None]

        vol_ratio   = _volume_ratio(volumes, 20)
        recent_high = _recent_high(highs, 20)
        pct_1d      = _pct_change(closes, 1)
        pct_5d      = _pct_change(closes, 5)
        pct_20d     = _pct_change(closes, 20)

        # Posición en Bollinger (0 = en lower, 1 = en upper)
        bb_pos = 0.5
        if bb_upper and bb_lower and bb_upper != bb_lower:
            bb_pos = (price - bb_lower) / (bb_upper - bb_lower)

        # Indicadores para serializar en la señal
        ind_snapshot = {
            "rsi_14":          round(rsi,   2) if rsi   else None,
            "sma_20":          round(ma20,  4) if ma20  else None,
            "sma_50":          round(ma50,  4) if ma50  else None,
            "bb_upper":        round(bb_upper, 4) if bb_upper else None,
            "bb_lower":        round(bb_lower, 4) if bb_lower else None,
            "bb_position":     round(bb_pos, 4),
            "volume_ratio":    vol_ratio,
            "macd_hist":       round(macd_hist_v, 4) if macd_hist_v is not None else None,
            "pct_change_1d":   pct_1d,
            "pct_change_5d":   pct_5d,
            "pct_change_20d":  pct_20d,
            "recent_high_20d": round(recent_high, 4) if recent_high else None,
        }

        signals_found: list[dict] = []

        # ── Señal 1: OVERSOLD / posible compra ────────────────────────────────
        if rsi is not None and rsi < 30:
            score = _score_oversold(rsi, bb_pos, vol_ratio, price, bb_lower)
            if score >= MIN_SCORE:
                confidence = round(score / 100, 3)
                parts = [f"RSI={rsi:.1f} (sobreventa extrema)"]
                if bb_pos < 0.15:
                    parts.append("precio en zona de soporte Bollinger inferior")
                if vol_ratio >= 0.8:
                    parts.append(f"volumen estable ({vol_ratio:.1f}x)")
                if pct_5d < -5:
                    parts.append(f"caída de {abs(pct_5d):.1f}% en 5 días: posible rebote")
                reason = ". ".join(parts) + "."
                signals_found.append(dict(
                    symbol=symbol, signal_type="buy", category="oversold",
                    confidence=confidence, score=score, reason=reason,
                    indicators=ind_snapshot, price_at_signal=price,
                ))

        # ── Señal 2: MOMENTUM alcista ─────────────────────────────────────────
        if ma20 and ma50 and ma20 > ma50 and price > ma20:
            if rsi is None or rsi < 72:   # no sobrecomprado
                score = _score_momentum(ma20, ma50, price, vol_ratio, rsi or 50, macd_hist_v)
                if score >= MIN_SCORE:
                    confidence = round(score / 100, 3)
                    sep_pct = (ma20 - ma50) / ma50 * 100
                    parts = [
                        f"MA20 ({ma20:.2f}) > MA50 ({ma50:.2f}), spread {sep_pct:.1f}%",
                        f"precio {price:.2f} sobre MA20",
                    ]
                    if vol_ratio > 1.2:
                        parts.append(f"volumen {vol_ratio:.1f}x sobre media")
                    if macd_hist_v and macd_hist_v > 0:
                        parts.append("MACD histograma positivo (momentum confirmado)")
                    reason = ". ".join(parts) + "."
                    signals_found.append(dict(
                        symbol=symbol, signal_type="buy", category="momentum",
                        confidence=confidence, score=score, reason=reason,
                        indicators=ind_snapshot, price_at_signal=price,
                    ))

        # ── Señal 3: BREAKOUT / rotura de resistencia ─────────────────────────
        if recent_high and price > recent_high and vol_ratio > 1.2:
            if ma20 and price > ma20:
                score = _score_breakout(price, recent_high, vol_ratio, ma20, rsi or 50)
                if score >= MIN_SCORE:
                    confidence = round(score / 100, 3)
                    break_pct = (price - recent_high) / recent_high * 100
                    parts = [
                        f"rotura de máximo 20 días ({recent_high:.2f}), +{break_pct:.1f}%",
                        f"volumen de confirmación {vol_ratio:.1f}x",
                    ]
                    if rsi and rsi < 65:
                        parts.append("RSI no sobrecomprado: recorrido alcista disponible")
                    reason = ". ".join(parts) + "."
                    signals_found.append(dict(
                        symbol=symbol, signal_type="buy", category="breakout",
                        confidence=confidence, score=score, reason=reason,
                        indicators=ind_snapshot, price_at_signal=price,
                    ))

        # ── Señal 4: VENTA / debilidad ────────────────────────────────────────
        sell_condition = False
        sell_notes = []

        if rsi is not None and rsi > 70:
            sell_condition = True
            sell_notes.append(f"RSI={rsi:.1f} (sobrecompra)")

        if ma20 and ma50 and ma20 < ma50:
            sell_condition = True
            sep_pct = (ma50 - ma20) / ma50 * 100
            sell_notes.append(f"MA20 < MA50 (cruce bajista, spread {sep_pct:.1f}%)")

        if sell_condition:
            score = _score_sell(
                rsi or 50, ma20 or price, ma50 or price,
                vol_ratio, bb_pos,
                macd_hist_v
            )
            if score >= MIN_SCORE:
                confidence = round(score / 100, 3)
                if bb_pos > 0.85:
                    sell_notes.append(f"precio en zona alta Bollinger ({bb_pos:.0%})")
                if pct_5d > 10:
                    sell_notes.append(f"subida de {pct_5d:.1f}% en 5 días: posible toma de beneficios")
                reason = ". ".join(sell_notes) + "."
                signals_found.append(dict(
                    symbol=symbol, signal_type="sell", category="trend",
                    confidence=confidence, score=score, reason=reason,
                    indicators=ind_snapshot, price_at_signal=price,
                ))

        return [
            SignalService._apply_ml_confirmation(sig, symbol, price)
            for sig in signals_found
        ]

    @staticmethod
    def _fallback_signal_for_ticker(symbol: str) -> dict | None:
        """
        Señal base cuando el motor estricto no encuentra setup claro.
        Mantiene el panel poblado con scores moderados, sin venderlo como señal fuerte.
        """
        try:
            from app.models.stock_data import StockData
            from app.models.ticker import Ticker

            rows = (
                StockData.query
                .filter_by(ticker=symbol)
                .order_by(StockData.date.desc())
                .limit(30)
                .all()
            )
            rows = list(reversed(rows))
            closes = [float(r.close) for r in rows if r.close is not None]
            volumes = [float(r.volume or 0) for r in rows if r.volume is not None]

            ticker = Ticker.query.filter_by(symbol=symbol).first()
            price = closes[-1] if closes else float(getattr(ticker, "last_price", 0) or 0)
            if not price:
                return None

            pct_5d = round((closes[-1] - closes[-6]) / closes[-6] * 100, 2) if len(closes) >= 6 and closes[-6] > 0 else float(getattr(ticker, "day_change_pct", 0) or 0)
            pct_20d = round((closes[-1] - closes[-21]) / closes[-21] * 100, 2) if len(closes) >= 21 and closes[-21] > 0 else pct_5d
            avg_volume = float(np.mean(volumes[-20:])) if volumes else 0
            last_volume = volumes[-1] if volumes else 0
            volume_ratio = round(last_volume / avg_volume, 2) if avg_volume > 0 else 1.0

            bullish = pct_5d >= 0 and pct_20d >= -3
            signal_type = "buy" if bullish else "watchlist"
            category = "momentum" if pct_5d >= 2 else "trend"
            score = min(74, max(56, 58 + int(max(-4, min(8, pct_5d))) + (4 if volume_ratio >= 1.15 else 0)))
            confidence = round(score / 100, 3)
            direction = "mantiene sesgo alcista" if bullish else "requiere vigilancia"
            reason = (
                f"Setup moderado generado por cobertura: {symbol} {direction}. "
                f"Cambio 5d {pct_5d:+.2f}%, cambio 20d {pct_20d:+.2f}%, "
                f"volumen relativo {volume_ratio:.2f}x. Confirmar con precio y riesgo antes de operar."
            )

            return {
                "symbol": symbol,
                "signal_type": signal_type,
                "category": category,
                "confidence": confidence,
                "score": score,
                "reason": reason,
                "indicators": {
                    "pct_change_5d": pct_5d,
                    "pct_change_20d": pct_20d,
                    "volume_ratio": volume_ratio,
                    "fallback": True,
                },
                "price_at_signal": price,
                "generated_by": "technical_fallback",
            }
        except Exception as exc:
            logger.debug("fallback signal omitida para %s: %s", symbol, exc)
            return None

    @staticmethod
    def generate_and_persist(
        symbols: list[str] | None = None,
        batch_size: int = 10,
    ) -> dict:
        """
        Genera señales para todos los tickers activos y soportados, las persiste en BD
        y limpia las antiguas del mismo ticker. Invalida caché al finalizar.
        """
        from app.services.ticker_service import TickerService

        if symbols:
            target = symbols
        else:
            target = TickerService.get_supported_symbols() or []

        if not target:
            logger.warning("generate_and_persist: no hay tickers disponibles")
            return {"total": 0, "generated": 0, "errors": 0}

        generated = 0
        errors     = 0
        now        = datetime.now(timezone.utc)
        expires    = now + timedelta(hours=SIGNAL_TTL_HOURS)

        for i in range(0, len(target), batch_size):
            batch = target[i:i + batch_size]
            for symbol in batch:
                try:
                    candidates = SignalService.generate_for_ticker(symbol)
                    if not candidates:
                        fallback = SignalService._fallback_signal_for_ticker(symbol)
                        candidates = [fallback] if fallback else []
                    if not candidates:
                        continue

                    # Desactivar señales previas del ticker antes de insertar las nuevas
                    (
                        db.session.query(__import__(
                            "app.models.signal", fromlist=["Signal"]
                        ).Signal)
                        .filter_by(symbol=symbol, is_active=True)
                        .update({"is_active": False}, synchronize_session=False)
                    )

                    from app.models.signal import Signal
                    for sig_data in candidates:
                        sig = Signal(
                            symbol=sig_data["symbol"],
                            signal_type=sig_data["signal_type"],
                            category=sig_data["category"],
                            confidence=sig_data["confidence"],
                            score=sig_data["score"],
                            reason=sig_data["reason"],
                            price_at_signal=sig_data["price_at_signal"],
                            expires_at=expires,
                            is_active=True,
                            generated_by=sig_data.get("generated_by", "technical"),
                        )
                        sig.set_indicators(sig_data["indicators"])
                        db.session.add(sig)
                        generated += 1

                    db.session.commit()
                    logger.debug("Señales generadas para %s: %d", symbol, len(candidates))

                except Exception as exc:
                    errors += 1
                    db.session.rollback()
                    logger.warning("Error generando señales para %s: %s", symbol, exc)

        # Invalidar caché al finalizar
        SignalService.invalidate_cache()

        summary = {
            "total":     len(target),
            "generated": generated,
            "errors":    errors,
            "generated_at": now.isoformat(),
        }
        logger.info("generate_and_persist completado: %s", summary)
        return summary

    # ── Consulta de señales ─────────────────────────────────────────────────────

    @staticmethod
    def get_active_signals(
        signal_type: str | None = None,
        category:    str | None = None,
        symbol:      str | None = None,
        min_score:   int = MIN_SCORE,
        page:        int = 1,
        per_page:    int = 20,
        is_pro:      bool = False,
        free_full_unlocks: int = 0,
    ) -> dict:
        """
        Devuelve señales activas con filtros y paginación.
        FREE: máximo 2 señales, fields limitados.
        PRO: acceso completo.
        """
        from app.models.signal import Signal

        # Cache key incluye todos los filtros
        cache_key = (
            f"signals:list:{signal_type}:{category}:{symbol}:{min_score}:{page}:{per_page}"
        )
        cached = _cache_get(cache_key)
        if cached:
            data = json.loads(cached)
            # Aplicar limitación FREE en el resultado cacheado
            if not is_pro:
                unlocks = max(0, int(free_full_unlocks or 0))
                data["items"] = [
                    s if idx < unlocks else Signal._apply_free_limit(s)
                    for idx, s in enumerate(data["items"])
                ]
                data["pro_limit"] = True
            return data

        now = datetime.now(timezone.utc)
        q = Signal.query.filter(
            Signal.is_active == True,
            Signal.score >= min_score,
            Signal.expires_at > now,
        )
        if signal_type:
            q = q.filter(Signal.signal_type == signal_type)
        if category:
            q = q.filter(Signal.category == category)
        if symbol:
            q = q.filter(Signal.symbol.ilike(f"%{symbol.upper()}%"))

        q = q.order_by(Signal.score.desc(), Signal.created_at.desc())
        total = q.count()

        items_raw = q.offset((page - 1) * per_page).limit(per_page).all()
        items_full = [s.to_dict(full=True) for s in items_raw]

        data = {
            "items":    items_full,
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    max(1, (total + per_page - 1) // per_page),
            "pro_limit": False,
        }

        # Cachear la versión completa (PRO); la limitación FREE se aplica al devolver
        _cache_set(cache_key, json.dumps(data), CACHE_TTL_SIGNALS)

        if not is_pro:
            unlocks = max(0, int(free_full_unlocks or 0))
            data["items"] = [
                s.to_dict(full=True) if idx < unlocks else s.to_dict(full=False)
                for idx, s in enumerate(items_raw)
            ]
            data["pro_limit"] = True
        return data

    @staticmethod
    def get_top_opportunities(limit: int = 10, is_pro: bool = False, free_full_unlocks: int = 0) -> list[dict]:
        """Top señales por score (mezcla de tipos BUY)."""
        from app.models.signal import Signal
        cached = _cache_get(CACHE_KEY_TOP)
        if cached:
            items = json.loads(cached)
            if not is_pro:
                unlocks = max(0, int(free_full_unlocks or 0))
                return [s if idx < unlocks else Signal._free_mask(s) for idx, s in enumerate(items[:limit])]
            return items[:limit]

        now = datetime.now(timezone.utc)
        items_raw = (
            Signal.query
            .filter(
                Signal.is_active  == True,
                Signal.signal_type == "buy",
                Signal.score       >= MIN_SCORE,
                Signal.expires_at  > now,
            )
            .order_by(Signal.score.desc(), Signal.created_at.desc())
            .limit(20)
            .all()
        )
        items_full = [s.to_dict(full=True) for s in items_raw]
        _cache_set(CACHE_KEY_TOP, json.dumps(items_full), CACHE_TTL_TOP)

        if not is_pro:
            unlocks = max(0, int(free_full_unlocks or 0))
            return [s if idx < unlocks else Signal._free_mask(s) for idx, s in enumerate(items_full[:limit])]
        return items_full[:limit]

    @staticmethod
    def get_top_momentum(limit: int = 5, is_pro: bool = False, free_full_unlocks: int = 0) -> list[dict]:
        """Top 5 señales de momentum alcista."""
        from app.models.signal import Signal
        cached = _cache_get(CACHE_KEY_MOMENTUM)
        if cached:
            items = json.loads(cached)
            if not is_pro:
                unlocks = max(0, int(free_full_unlocks or 0))
                return [s if idx < unlocks else Signal._free_mask(s) for idx, s in enumerate(items[:limit])]
            return items[:limit]

        now = datetime.now(timezone.utc)
        items_raw = (
            Signal.query
            .filter(
                Signal.is_active == True,
                Signal.category  == "momentum",
                Signal.score     >= MIN_SCORE,
                Signal.expires_at > now,
            )
            .order_by(Signal.score.desc())
            .limit(20)
            .all()
        )
        items_full = [s.to_dict(full=True) for s in items_raw]
        _cache_set(CACHE_KEY_MOMENTUM, json.dumps(items_full), CACHE_TTL_TOP)

        if not is_pro:
            unlocks = max(0, int(free_full_unlocks or 0))
            return [s if idx < unlocks else Signal._free_mask(s) for idx, s in enumerate(items_full[:limit])]
        return items_full[:limit]

    # ── Mantenimiento ───────────────────────────────────────────────────────────

    @staticmethod
    def cleanup_expired(older_than_days: int = 7) -> int:
        """
        Desactiva señales expiradas y elimina registros más antiguos que `older_than_days`.
        """
        from app.models.signal import Signal
        now      = datetime.now(timezone.utc)
        cutoff   = now - timedelta(days=older_than_days)

        # Desactivar señales cuyo expires_at ya pasó
        expired_count = (
            Signal.query
            .filter(Signal.is_active == True, Signal.expires_at <= now)
            .update({"is_active": False}, synchronize_session=False)
        )

        # Borrar señales muy antiguas (> older_than_days)
        old_count = (
            Signal.query
            .filter(Signal.created_at < cutoff)
            .delete(synchronize_session=False)
        )

        db.session.commit()
        SignalService.invalidate_cache()
        logger.info(
            "cleanup_signals: %d expiradas desactivadas, %d eliminadas",
            expired_count, old_count
        )
        return expired_count + old_count

    @staticmethod
    def invalidate_cache() -> None:
        """Invalida toda la caché de señales."""
        _cache_del_pattern("signals:*")

    # ── Helpers internos de enmascaramiento FREE ───────────────────────────────

    @staticmethod
    def _is_pro_user(user_id: int) -> bool:
        """Determina si el usuario tiene acceso PRO (role=admin o subscription=pro)."""
        try:
            from app.models.user import User
            u = User.query.get(user_id)
            if not u:
                return False
            return u.role == "admin" or getattr(u, "subscription", "free") == "pro"
        except Exception:
            return False


# ── Parche de métodos estáticos en Signal ─────────────────────────────────────
# (se añaden aquí para no crear dependencia circular model ↔ service)

def _signal_free_mask(s: dict) -> dict:
    """Devuelve versión limitada de un dict de señal para FREE."""
    masked = dict(s)
    masked["reason"]     = (s.get("reason", "") or "")[:60] + "…"
    masked["indicators"] = {}
    return masked

# Monkeypatching como método estático en Signal
from app.models.signal import Signal as _Signal
_Signal._free_mask     = staticmethod(_signal_free_mask)
_Signal._apply_free_limit = staticmethod(lambda s: _signal_free_mask(s))
