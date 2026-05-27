"""
Blueprint: /api/indicators - Indicadores técnicos públicos.
"""
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from app import db
from app.utils.helpers import validate_ticker

indicators_bp = Blueprint("indicators", __name__)


def _positive_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = request.args.get(name, default)
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


@indicators_bp.route("/<ticker>", methods=["GET"])
def get_indicators(ticker: str):
    """GET /api/indicators/APPLE?period=200 - Público."""
    ticker = ticker.upper().strip()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    try:
        from app.services.data_service import DataService, resolve_ticker
        from app.services.technical_service import TechnicalService

        period = _positive_int_arg("period", default=260, minimum=60, maximum=800)
        fetch_days = max(period, 260)
        real_ticker = resolve_ticker(ticker)

        DataService.get_stock_data(real_ticker, days=fetch_days)

        signals_data = TechnicalService.get_signals(real_ticker)
        if not signals_data:
            TechnicalService.calculate_and_store(real_ticker)
            signals_data = TechnicalService.get_signals(real_ticker)

        if not signals_data:
            return jsonify({
                "error": "NOT_FOUND",
                "message": f"No hay suficientes datos técnicos para {ticker}",
                "status": 404,
            }), 404

        return jsonify({"ticker": ticker, **signals_data}), 200

    except ValueError as exc:
        return jsonify({"error": "NOT_FOUND", "message": str(exc), "status": 404}), 404
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Error calculando indicadores para %s", ticker)
        return jsonify({"error": "SERVER_ERROR", "message": "Error calculando indicadores", "status": 500}), 500


@indicators_bp.route("/<ticker>/history", methods=["GET"])
def get_indicators_history(ticker: str):
    """GET /api/indicators/APPLE/history?days=90 - Histórico de indicadores."""
    ticker = ticker.upper().strip()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido", "status": 400}), 400

    try:
        from app.models.indicators import TechnicalIndicator
        from app.services.data_service import resolve_ticker

        days = _positive_int_arg("days", default=90, minimum=20, maximum=800)
        real_ticker = resolve_ticker(ticker)
        start_date = date.today() - timedelta(days=days)

        records = (
            TechnicalIndicator.query
            .filter(TechnicalIndicator.ticker == real_ticker, TechnicalIndicator.date >= start_date)
            .order_by(TechnicalIndicator.date.asc())
            .all()
        )

        return jsonify({
            "ticker": ticker,
            "history": [r.to_dict() for r in records],
            "total": len(records),
        }), 200

    except Exception:
        db.session.rollback()
        current_app.logger.exception("Error obteniendo historial de indicadores para %s", ticker)
        return jsonify({"error": "SERVER_ERROR", "message": "Error obteniendo historial", "status": 500}), 500
