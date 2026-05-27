"""
Blueprint: /api/stock — Datos bursátiles históricos + indicadores
"""
import logging
from flask import Blueprint, request, jsonify
from app.utils.helpers import validate_ticker

logger = logging.getLogger(__name__)

stocks_bp = Blueprint("stocks", __name__)


@stocks_bp.route("/<ticker>", methods=["GET"])
def get_stock(ticker: str):
    """GET /api/stock/APPLE?days=365 — Público"""
    ticker = ticker.upper().strip()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido (1-10 caracteres)", "status": 400}), 400

    days = int(request.args.get("days", 365))
    if days < 1 or days > 3650:
        return jsonify({"error": "BAD_REQUEST", "message": "days debe estar entre 1 y 3650", "status": 400}), 400

    try:
        from app.services.data_service import DataService
        from app.services.market_data_service import MarketDataUnavailable
        data = DataService.get_stock_data(ticker, days=days)

        # Registrar búsqueda (anónima o autenticada)
        _log_search(ticker, "stock")

        return jsonify(data), 200
    except MarketDataUnavailable as exc:
        return jsonify({
            "error": "MARKET_DATA_UNAVAILABLE",
            "message": str(exc),
            "symbol": exc.symbol,
            "reason": exc.reason,
            "status": 422,
        }), 422
    except ValueError as exc:
        return jsonify({"error": "NOT_FOUND", "message": str(exc), "status": 404}), 404
    except Exception as exc:
        logger.error("Error en get_stock(%s): %s", ticker, exc, exc_info=True)
        return jsonify({
            "error": "SERVER_ERROR",
            "message": f"Error obteniendo datos bursátiles: {str(exc)}",
            "status": 500,
        }), 500


@stocks_bp.route("/batch", methods=["GET"])
def get_batch():
    """GET /api/stock/batch?tickers=APPLE,GOOGL&days=30 — Público"""
    tickers_raw = request.args.get("tickers", "")
    days = int(request.args.get("days", 30))

    tickers = [t.strip().upper() for t in tickers_raw.split(",") if t.strip()]
    if not tickers:
        return jsonify({"error": "BAD_REQUEST", "message": "Se requiere al menos un ticker", "status": 400}), 400
    if len(tickers) > 10:
        return jsonify({"error": "BAD_REQUEST", "message": "Máximo 10 tickers por solicitud", "status": 400}), 400

    from app.services.data_service import DataService
    result = DataService.get_batch(tickers, days=days)
    return jsonify({"tickers": result}), 200


def _log_search(ticker: str, search_type: str) -> None:
    """Registra búsqueda en historial (sin bloquear si falla)."""
    try:
        from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
        from app.models.analysis import SearchHistory
        from app import db

        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            uid = get_jwt_identity()
            if uid:
                user_id = int(uid)
        except Exception:
            pass

        sh = SearchHistory(user_id=user_id, ticker=ticker, search_type=search_type)
        db.session.add(sh)
        db.session.commit()
    except Exception:
        pass
