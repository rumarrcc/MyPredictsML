"""
AlertService — evalúa y dispara alertas de precio, predicción y tendencia.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app import db
from app.models.alert import Alert

logger = logging.getLogger(__name__)


class AlertService:

    @staticmethod
    def check_price_alerts() -> list[Alert]:
        """Verifica todas las alertas de tipo price_threshold activas."""
        from app.services.data_service import DataService

        triggered: list[Alert] = []
        alerts = Alert.query.filter_by(alert_type="price_threshold", is_active=True).all()

        # Agrupar por ticker para mínimas llamadas a yfinance
        tickers: dict[str, list[Alert]] = {}
        for alert in alerts:
            tickers.setdefault(alert.ticker, []).append(alert)

        for ticker, ticker_alerts in tickers.items():
            try:
                stock_data = DataService.get_stock_data(ticker, days=1)
                current_price = stock_data.get("last_price")
                if current_price is None:
                    continue
            except Exception as exc:
                logger.warning("Error obteniendo precio para %s: %s", ticker, exc)
                continue

            for alert in ticker_alerts:
                fired = AlertService._evaluate_price_condition(alert, current_price)
                if fired:
                    AlertService._mark_triggered(alert)
                    triggered.append(alert)

        return triggered

    @staticmethod
    def check_trend_alerts() -> list[Alert]:
        """Verifica alertas de inversión de tendencia (RSI cruza 50)."""
        from app.models.indicators import TechnicalIndicator
        from app.services.data_service import DataService

        triggered: list[Alert] = []
        alerts = Alert.query.filter_by(alert_type="trend_reversal", is_active=True).all()

        tickers: dict[str, list[Alert]] = {}
        for alert in alerts:
            tickers.setdefault(alert.ticker, []).append(alert)

        for ticker, ticker_alerts in tickers.items():
            latest_ind = (
                TechnicalIndicator.query
                .filter_by(ticker=ticker)
                .order_by(TechnicalIndicator.date.desc())
                .first()
            )
            if not latest_ind or latest_ind.rsi_14 is None:
                continue

            rsi = float(latest_ind.rsi_14)

            # Cruce de RSI sobre 50 (alcista) o bajo 50 (bajista)
            prev_ind = (
                TechnicalIndicator.query
                .filter(TechnicalIndicator.ticker == ticker, TechnicalIndicator.date < latest_ind.date)
                .order_by(TechnicalIndicator.date.desc())
                .first()
            )
            if not prev_ind or prev_ind.rsi_14 is None:
                continue

            prev_rsi = float(prev_ind.rsi_14)
            crossed_50 = (prev_rsi < 50 <= rsi) or (prev_rsi >= 50 > rsi)

            if crossed_50:
                for alert in ticker_alerts:
                    AlertService._mark_triggered(alert)
                    triggered.append(alert)

        return triggered

    @staticmethod
    def check_prediction_change_alerts() -> list[Alert]:
        """Compara última predicción vs predicción anterior para detectar cambios >N%."""
        from app.models.prediction import Prediction

        triggered: list[Alert] = []
        alerts = Alert.query.filter_by(alert_type="prediction_change", is_active=True).all()

        for alert in alerts:
            try:
                preds = (
                    Prediction.query
                    .filter_by(ticker=alert.ticker, model_type=alert.model or "prophet")
                    .order_by(Prediction.created_at.desc())
                    .limit(2)
                    .all()
                )
                if len(preds) < 2:
                    continue

                latest_price = float(preds[0].predicted_price)
                prev_price = float(preds[1].predicted_price)
                if prev_price == 0:
                    continue

                change_pct = abs((latest_price - prev_price) / prev_price) * 100
                threshold = float(alert.change_percent or 5.0)

                if change_pct >= threshold:
                    AlertService._mark_triggered(alert)
                    triggered.append(alert)

            except Exception as exc:
                logger.warning("Error evaluando alerta de predicción %s: %s", alert.id, exc)

        return triggered

    @staticmethod
    def _evaluate_price_condition(alert: Alert, current_price: float) -> bool:
        if alert.trigger_value is None:
            return False
        tv = float(alert.trigger_value)
        if alert.condition == "above" and current_price >= tv:
            return True
        if alert.condition == "below" and current_price <= tv:
            return True
        return False

    @staticmethod
    def _mark_triggered(alert: Alert) -> None:
        alert.last_triggered_at = datetime.now(timezone.utc)
        alert.trigger_count = (alert.trigger_count or 0) + 1
        db.session.commit()
        logger.info("Alerta %s disparada (ticker=%s)", alert.id, alert.ticker)

    @staticmethod
    def run_all_checks() -> dict:
        """Ejecuta todos los tipos de verificaciones y encola emails."""
        from app.services.email_service import EmailService  # usado en fallback síncrono

        price_alerts = AlertService.check_price_alerts()
        trend_alerts = AlertService.check_trend_alerts()
        pred_alerts = AlertService.check_prediction_change_alerts()

        all_triggered = price_alerts + trend_alerts + pred_alerts

        emails_queued = 0
        for alert in all_triggered:
            if alert.email_enabled and alert.user and alert.user.email:
                try:
                    # Dispatch asíncrono vía Celery; si Celery no está disponible,
                    # se envía de forma síncrona como fallback.
                    from app.tasks.scheduled_tasks import send_alert_email_task
                    send_alert_email_task.delay(alert.id)
                    emails_queued += 1
                    logger.info("Email encolado (Celery) para alerta %s", alert.id)
                except Exception as exc:
                    logger.warning(
                        "Celery no disponible para alerta %s, enviando síncronamente: %s",
                        alert.id, exc,
                    )
                    try:
                        EmailService.send_alert_email(alert)
                        emails_queued += 1
                    except Exception as mail_exc:
                        logger.error("Error enviando email alerta %s: %s", alert.id, mail_exc)

        return {
            "price_alerts_triggered":      len(price_alerts),
            "trend_alerts_triggered":      len(trend_alerts),
            "prediction_alerts_triggered": len(pred_alerts),
            "total_triggered":             len(all_triggered),
            "emails_queued":               emails_queued,
        }
