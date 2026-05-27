"""
Tareas periódicas y asíncronas de Celery.
"""
from __future__ import annotations

import logging
import time
import random
from datetime import datetime, timezone, timedelta
from typing import Any

from .celery_app import celery_app

logger = logging.getLogger(__name__)

# Tickers por defecto (fallback cuando la tabla tickers aún no está poblada)
_FALLBACK_TICKERS = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN", "META", "NFLX", "NVDA",
                     "NVDA", "JPM", "V", "JNJ", "XOM", "SPY", "QQQ"]


def _get_target_tickers(tickers: list | None = None) -> list[str]:
    """
    Devuelve la lista de tickers a procesar para las tareas programadas.
    Prioridad: lista explícita → tabla Ticker en BD → fallback estático.
    """
    if tickers:
        return tickers
    try:
        from app.services.ticker_service import TickerService
        supported = TickerService.get_supported_symbols()
        if supported:
            return supported
    except Exception as exc:
        logger.warning("No se pudieron obtener tickers de BD: %s", exc)
    # Fallback: lista estática + tickers ya cacheados en stock_data
    try:
        from app.models.stock_data import StockData
        from app import db
        db_tickers = [r[0] for r in db.session.query(StockData.ticker).distinct().all()]
        return list(dict.fromkeys(_FALLBACK_TICKERS + db_tickers))
    except Exception:
        return _FALLBACK_TICKERS


# Alias para compatibilidad con código existente
POPULAR_TICKERS = _FALLBACK_TICKERS

# ── Utilidades de retry ────────────────────────────────────────────────────

def _exponential_backoff(attempt: int, base: float = 2.0, cap: float = 120.0) -> float:
    """Tiempo de espera en segundos con jitter aleatorio."""
    delay = min(base ** attempt + random.uniform(0, 1), cap)
    return delay


def _is_rate_limited(exc: Exception) -> bool:
    """Detecta errores 429 / Too Many Requests de yfinance."""
    msg = str(exc).lower()
    return "429" in msg or "too many requests" in msg or "rate limit" in msg


def _fetch_ticker_with_retry(ticker: str, days: int = 365, max_attempts: int = 4) -> dict:
    """
    Descarga datos de un ticker con reintentos y backoff exponencial.
    Respeta 429 haciendo pausa larga antes de reintentar.
    """
    from app.services.data_service import DataService
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return DataService.get_stock_data(ticker, days=days)
        except Exception as exc:
            last_exc = exc
            if _is_rate_limited(exc):
                wait = _exponential_backoff(attempt + 2, base=3.0, cap=180.0)
                logger.warning(
                    "Rate limit (429) en %s — esperando %.0fs (intento %d/%d)",
                    ticker, wait, attempt + 1, max_attempts,
                )
                time.sleep(wait)
            else:
                wait = _exponential_backoff(attempt, base=2.0, cap=60.0)
                logger.warning(
                    "Error descargando %s: %s — reintentando en %.0fs",
                    ticker, exc, wait,
                )
                time.sleep(wait)
    raise last_exc


def _is_data_stale(ticker: str, stale_hours: float = 2.0) -> bool:
    """
    Devuelve True si el ticker no tiene datos recientes (> stale_hours) o no tiene datos.
    Permite actualizaciones incrementales: sólo re-descarga si realmente hace falta.
    """
    from app.models.stock_data import StockData
    latest = (
        StockData.query
        .filter_by(ticker=ticker)
        .order_by(StockData.date.desc())
        .first()
    )
    if not latest:
        return True
    age = datetime.now(timezone.utc) - latest.created_at.replace(tzinfo=timezone.utc)
    return age.total_seconds() / 3600 > stale_hours


# ── Alertas ────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.check_alerts_task", bind=True, max_retries=3)
def check_alerts_task(self) -> dict:
    """Verifica todas las alertas activas y encola emails si corresponde."""
    try:
        from app.services.alert_service import AlertService
        result = AlertService.run_all_checks()
        logger.info("Alertas verificadas: %s", result)
        return result
    except Exception as exc:
        logger.error("Error en check_alerts_task: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.scheduled_tasks.send_alert_email_task", bind=True, max_retries=3)
def send_alert_email_task(self, alert_id: int) -> bool:
    """Envía email de notificación de alerta de forma asíncrona."""
    try:
        from app.models.alert import Alert
        from app.services.email_service import EmailService
        alert = Alert.query.get(alert_id)
        if alert:
            ok = EmailService.send_alert_email(alert)
            if ok:
                logger.info("Email enviado para alerta %s", alert_id)
            else:
                logger.warning("EmailService.send_alert_email devolvió False para alerta %s", alert_id)
            return ok
        logger.warning("Alerta %s no encontrada para envío de email", alert_id)
        return False
    except Exception as exc:
        logger.error("Error enviando email alerta %s: %s", alert_id, exc)
        raise self.retry(exc=exc, countdown=30)


# ── Datos bursátiles ───────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.update_stock_data_task", bind=True)
def update_stock_data_task(self, tickers: list[str] | None = None, force: bool = False) -> dict:
    """
    Descarga y cachea datos actualizados para los tickers más usados.

    Mejoras vs. versión anterior:
    - Actualización incremental: omite tickers con datos recientes (< 2h)
    - Backoff exponencial con jitter en cada ticker
    - Manejo específico de errores 429 (rate limit) con pausa larga
    - Pausa aleatoria entre tickers para reducir presión sobre Yahoo Finance
    - Obtiene tickers únicos de la BD (además de la lista estática)
    """
    from app.models.stock_data import StockData
    from app import db

    # ── Construir lista de tickers a actualizar ────────────────────────────
    target_tickers = _get_target_tickers(tickers)

    results: dict[str, str] = {}
    skipped = 0
    updated = 0
    errors  = 0

    for i, ticker in enumerate(target_tickers):
        # ── Actualización incremental ──────────────────────────────────────
        if not force and not _is_data_stale(ticker, stale_hours=2.0):
            results[ticker] = "skipped (data fresh)"
            skipped += 1
            continue

        # ── Pausa cortesía entre llamadas a yfinance ───────────────────────
        if i > 0:
            jitter = random.uniform(0.5, 2.5)
            time.sleep(jitter)

        try:
            _fetch_ticker_with_retry(ticker, days=365)
            results[ticker] = "ok"
            updated += 1
            logger.info("[%d/%d] Datos actualizados para %s", i + 1, len(target_tickers), ticker)
        except Exception as exc:
            err_msg = str(exc)
            results[ticker] = f"error: {err_msg[:120]}"
            errors += 1
            logger.warning("[%d/%d] Error final para %s: %s", i + 1, len(target_tickers), ticker, err_msg)

            # Si es 429 global (demasiados errores seguidos), pausar más tiempo
            if _is_rate_limited(exc) and errors >= 3:
                long_pause = random.uniform(60, 120)
                logger.warning("Demasiados 429 — pausa larga de %.0fs", long_pause)
                time.sleep(long_pause)

    summary = {
        "total":   len(target_tickers),
        "updated": updated,
        "skipped": skipped,
        "errors":  errors,
        "details": results,
    }
    logger.info("update_stock_data_task completado: %s", summary)
    return summary


@celery_app.task(name="app.tasks.scheduled_tasks.calculate_all_indicators_task", bind=True)
def calculate_all_indicators_task(self, tickers: list[str] | None = None) -> dict:
    """Recalcula indicadores técnicos para todos los tickers en caché."""
    try:
        from app.models.stock_data import StockData
        from app.services.technical_service import TechnicalService
        from app import db

        if tickers:
            target = tickers
        else:
            result = db.session.query(StockData.ticker).distinct().all()
            target = [r[0] for r in result]

        results = {}
        for ticker in target:
            try:
                TechnicalService.calculate_and_store(ticker)
                results[ticker] = "ok"
            except Exception as exc:
                results[ticker] = f"error: {exc}"

        logger.info("Indicadores calculados para %d tickers", len(target))
        return results
    except Exception as exc:
        logger.error("Error en calculate_all_indicators_task: %s", exc)
        raise self.retry(exc=exc, countdown=120)


# ── Portafolios ────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.update_portfolio_prices_task", bind=True)
def update_portfolio_prices_task(self) -> dict:
    """Actualiza precios actuales de todas las posiciones de portafolios activos."""
    try:
        from app.models.portfolio import VirtualPortfolio, PortfolioPosition
        from app.services.data_service import DataService
        from app import db

        portfolios = VirtualPortfolio.query.all()
        positions  = PortfolioPosition.query.all()
        tickers    = list({p.ticker for p in positions})

        prices: dict[str, float] = {}
        for ticker in tickers:
            try:
                stock = _fetch_ticker_with_retry(ticker, days=5, max_attempts=3)
                if stock.get("last_price"):
                    prices[ticker] = stock["last_price"]
            except Exception:
                pass

        updated = 0
        for pos in positions:
            if pos.ticker in prices:
                pos.current_price = prices[pos.ticker]
                pos.recalculate()
                updated += 1

        for portfolio in portfolios:
            port_positions = portfolio.positions.all()
            total_current = sum(
                float(p.current_price or p.buy_price) * float(p.quantity)
                for p in port_positions
            )
            cash = float(portfolio.initial_capital) - sum(
                float(p.buy_price) * float(p.quantity) for p in port_positions
            )
            portfolio.current_value = total_current + cash
            ic = float(portfolio.initial_capital)
            portfolio.total_return = ((total_current + cash) - ic) / ic if ic else 0

        db.session.commit()
        logger.info("Precios de portafolio actualizados: %d posiciones", updated)
        return {"positions_updated": updated}

    except Exception as exc:
        logger.error("Error en update_portfolio_prices_task: %s", exc)
        raise self.retry(exc=exc, countdown=60)


# ── Predicciones asíncronas ────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.generate_prediction_task", bind=True, max_retries=2)
def generate_prediction_task(self, user_id: int, ticker: str, horizon_days: int = 20, models: list | None = None) -> dict:
    """Genera predicción de forma asíncrona (para horizons largos)."""
    try:
        from app.services.ml_service import MLService
        result = MLService.predict_all(ticker, horizon_days=horizon_days)
        logger.info("Predicción async completada para %s", ticker)
        return result
    except Exception as exc:
        logger.error("Error en generate_prediction_task: %s", exc)
        raise self.retry(exc=exc, countdown=30)


# ── Señales premium ───────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.generate_signals_task", bind=True, max_retries=2)
def generate_signals_task(self, symbols: list[str] | None = None) -> dict:
    """
    Genera señales premium para todos los tickers activos.
    Se ejecuta 1-2 veces al día al cierre del mercado.
    """
    try:
        from app.services.signal_service import SignalService
        result = SignalService.generate_and_persist(symbols=symbols)
        logger.info("generate_signals_task completado: %s", result)
        return result
    except Exception as exc:
        logger.error("Error en generate_signals_task: %s", exc)
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.scheduled_tasks.cleanup_signals_task", bind=True, max_retries=2)
def cleanup_signals_task(self, older_than_days: int = 7) -> dict:
    """Limpia señales expiradas y registros muy antiguos."""
    try:
        from app.services.signal_service import SignalService
        removed = SignalService.cleanup_expired(older_than_days=older_than_days)
        logger.info("cleanup_signals_task: %d registros procesados", removed)
        return {"removed": removed}
    except Exception as exc:
        logger.error("Error en cleanup_signals_task: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.scheduled_tasks.run_backtest_task", bind=True, max_retries=2)
def run_backtest_task(
    self,
    user_id: int,
    ticker: str,
    start_date: str,
    end_date: str,
    models: list | None = None,
    initial_capital: float = 10000.0,
    trade_type: str = "long",
    position_size_percent: float = 100.0,
) -> dict:
    """Ejecuta backtesting de forma asíncrona."""
    from datetime import date as _date
    try:
        from app.services.backtest_service import BacktestService
        result = BacktestService.run(
            ticker=ticker,
            start_date=_date.fromisoformat(start_date),
            end_date=_date.fromisoformat(end_date),
            models=models or ["prophet", "arima", "sma"],
            initial_capital=initial_capital,
            trade_type=trade_type,
            position_size_percent=position_size_percent,
        )
        return result
    except Exception as exc:
        logger.error("Error en run_backtest_task: %s", exc)
        raise self.retry(exc=exc, countdown=30)


# ── Recompensas / actividad ───────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scheduled_tasks.recalculate_activity_task", bind=True, max_retries=2)
def recalculate_activity_task(self, user_id: int | None = None) -> dict:
    """
    Recalcula scores de gamificación.
    Si user_id es None → recalcula todos los usuarios activos.
    """
    try:
        from app.services.gamification_service import GamificationService
        if user_id:
            result = GamificationService.recalculate_user(user_id)
        else:
            result = GamificationService.recalculate_all()
        logger.info("recalculate_activity_task completado: %s", result)
        return result
    except Exception as exc:
        logger.error("Error en recalculate_activity_task: %s", exc)
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.scheduled_tasks.weekly_activity_task", bind=True, max_retries=2)
def weekly_activity_task(self) -> dict:
    """
    Recalcula actividad semanal de predicciones e invalida cache.
    Se ejecuta una vez al día.
    """
    try:
        from app.services.gamification_service import GamificationService
        result = GamificationService.recalculate_all()
        GamificationService.invalidate_cache()
        logger.info("weekly_activity_task completado: %s", result)
        return result
    except Exception as exc:
        logger.error("Error en weekly_activity_task: %s", exc)
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.scheduled_tasks.cleanup_legacy_activity_task", bind=True, max_retries=2)
def cleanup_legacy_activity_task(self, older_than_days: int = 90) -> dict:
    """Tarea heredada desactivada."""
    return {"deleted": 0, "status": "disabled"}


@celery_app.task(name="app.tasks.scheduled_tasks.cleanup_rewards_task", bind=True, max_retries=2)
def cleanup_rewards_task(self) -> dict:
    """Expira recompensas temporales vencidas sin borrar historial."""
    try:
        from app.models.reward import RewardGrant
        from app import db

        now = datetime.now(timezone.utc)
        expired = (
            RewardGrant.query
            .filter(
                RewardGrant.status == "active",
                RewardGrant.expires_at.isnot(None),
                RewardGrant.expires_at <= now,
            )
            .update({"status": "expired"}, synchronize_session=False)
        )
        db.session.commit()
        logger.info("cleanup_rewards_task: %d recompensas expiradas", expired)
        return {"expired": expired}
    except Exception as exc:
        logger.error("Error en cleanup_rewards_task: %s", exc)
        raise self.retry(exc=exc, countdown=60)
