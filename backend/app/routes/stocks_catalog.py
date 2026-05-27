"""
Blueprint: /api/stocks — Catálogo público de tickers soportados.

Endpoints públicos:
  GET /api/stocks              — lista con filtros y paginación
  GET /api/stocks/<symbol>     — detalle de un ticker

Endpoints admin:
  POST  /api/stocks/admin/seed           — cargar universo inicial
  POST  /api/stocks/admin/sync           — sincronizar precios/metadatos
  PATCH /api/stocks/admin/<symbol>       — activar/desactivar soporte
"""
import logging

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app.utils.decorators import admin_required

logger = logging.getLogger(__name__)

catalog_bp = Blueprint("catalog", __name__)


# ── Endpoints públicos ────────────────────────────────────────────────────────

@catalog_bp.route("", methods=["GET"])
def list_tickers():
    """
    GET /api/stocks

    Query params:
      sector    — filtro por sector (ej: Tecnología, Finanzas, ETF…)
      exchange  — filtro por bolsa (NASDAQ, NYSE, BME…)
      country   — filtro por país ISO-2 (US, ES, DE…)
      search    — búsqueda por símbolo o nombre
      page      — número de página (default 1)
      per_page  — resultados por página (default 50, max 200)
    """
    from app.services.ticker_service import TickerService

    sector   = (request.args.get("sector")   or "").strip() or None
    exchange = (request.args.get("exchange") or "").strip() or None
    country  = (request.args.get("country")  or "").strip() or None
    search   = (request.args.get("search")   or "").strip() or None
    page     = max(1, int(request.args.get("page",     1)))
    per_page = min(200, max(1, int(request.args.get("per_page", 50))))

    result = TickerService.get_list(
        sector=sector,
        exchange=exchange,
        country=country,
        search=search,
        page=page,
        per_page=per_page,
    )
    return jsonify(result), 200


@catalog_bp.route("/meta", methods=["GET"])
def get_meta():
    """
    GET /api/stocks/meta

    Devuelve los valores únicos de sectores, exchanges y países disponibles.
    Útil para poblar los filtros del frontend.
    """
    from app.models.ticker import Ticker
    from sqlalchemy import func

    try:
        sectors   = [r[0] for r in Ticker.query.with_entities(Ticker.sector).distinct().filter(Ticker.sector.isnot(None)).order_by(Ticker.sector).all()]
        exchanges = [r[0] for r in Ticker.query.with_entities(Ticker.exchange).distinct().filter(Ticker.exchange.isnot(None)).order_by(Ticker.exchange).all()]
        countries = [r[0] for r in Ticker.query.with_entities(Ticker.country).distinct().filter(Ticker.country.isnot(None)).order_by(Ticker.country).all()]
        if not sectors and not exchanges and not countries:
            raise RuntimeError("tickers table empty")
    except Exception:
        # Fallback desde universo estático
        from app.services.ticker_service import TICKER_UNIVERSE
        sectors   = sorted(set(t["sector"]   for t in TICKER_UNIVERSE if t.get("sector")))
        exchanges = sorted(set(t["exchange"] for t in TICKER_UNIVERSE if t.get("exchange")))
        countries = sorted(set(t["country"]  for t in TICKER_UNIVERSE if t.get("country")))

    return jsonify({
        "sectors":   sectors,
        "exchanges": exchanges,
        "countries": countries,
    }), 200


@catalog_bp.route("/search", methods=["GET"])
def search_tickers():
    """
    GET /api/stocks/search?q=A

    Autocomplete ligero para buscadores por ticker/nombre. Devuelve símbolos reales
    del catálogo y precios recientes enriquecidos desde yfinance cuando haga falta.
    """
    from app.services.ticker_service import TickerService

    q = (request.args.get("q") or request.args.get("search") or "").strip()
    limit = min(50, max(1, int(request.args.get("limit", 20))))
    result = TickerService.get_list(search=q or None, page=1, per_page=limit)
    return jsonify({
        "items": result.get("tickers", []),
        "total": result.get("total", 0),
        "query": q,
    }), 200


@catalog_bp.route("/<symbol>", methods=["GET"])
def get_ticker(symbol: str):
    """GET /api/stocks/AAPL — Detalle completo de un ticker."""
    from app.services.ticker_service import TickerService

    result = TickerService.get_detail(symbol.upper())
    if not result:
        return jsonify({"error": "NOT_FOUND", "message": f"Ticker {symbol.upper()} no encontrado", "status": 404}), 404
    return jsonify(result), 200


# ── Endpoints admin ───────────────────────────────────────────────────────────

@catalog_bp.route("/admin/seed", methods=["POST"])
@jwt_required()
@admin_required
def admin_seed():
    """
    POST /api/stocks/admin/seed

    Carga el universo completo de tickers en la tabla `tickers`.
    Body JSON opcional: { "overwrite": true }
    """
    from app.services.ticker_service import TickerService

    data      = request.get_json(silent=True) or {}
    overwrite = bool(data.get("overwrite", False))

    result = TickerService.seed(overwrite=overwrite)
    logger.info("Admin seed completado: %s", result)
    return jsonify({"message": "Seed completado", **result}), 200


@catalog_bp.route("/admin/sync", methods=["POST"])
@jwt_required()
@admin_required
def admin_sync():
    """
    POST /api/stocks/admin/sync

    Sincroniza precios y metadatos de todos los tickers (o los indicados).
    Body JSON opcional: { "symbols": ["AAPL", "TSLA"] }

    AVISO: puede tardar varios minutos para el universo completo.
    Para una sync rápida, pasar lista de símbolos específicos.
    """
    from app.services.ticker_service import TickerService

    data    = request.get_json(silent=True) or {}
    symbols = data.get("symbols")   # None = todos

    result = TickerService.sync_all(symbols=symbols)
    logger.info("Admin sync completado: %s", result)
    return jsonify({"message": "Sync completado", **result}), 200


@catalog_bp.route("/admin/<symbol>", methods=["PATCH"])
@jwt_required()
@admin_required
def admin_patch_ticker(symbol: str):
    """
    PATCH /api/stocks/admin/AAPL

    Permite activar/desactivar soporte o actividad de un ticker.
    Body JSON: { "is_supported": false } | { "is_active": false }
    """
    from app.models.ticker import Ticker
    from app import db

    symbol = symbol.upper()
    ticker = Ticker.query.filter_by(symbol=symbol).first()
    if not ticker:
        return jsonify({"error": "NOT_FOUND", "message": f"Ticker {symbol} no encontrado", "status": 404}), 404

    data = request.get_json(silent=True) or {}
    changed = False

    if "is_supported" in data:
        ticker.is_supported = bool(data["is_supported"])
        changed = True
    if "is_active" in data:
        ticker.is_active = bool(data["is_active"])
        changed = True
    if "name" in data and data["name"]:
        ticker.name = str(data["name"])[:200]
        changed = True
    if "sector" in data and data["sector"]:
        ticker.sector = str(data["sector"])[:100]
        changed = True

    if not changed:
        return jsonify({"error": "BAD_REQUEST", "message": "Sin campos válidos para actualizar", "status": 400}), 400

    db.session.commit()

    from app.services.ticker_service import TickerService
    TickerService.invalidate_cache(symbol)

    logger.info("Admin patch %s: %s", symbol, data)
    return jsonify(ticker.to_dict(full=True)), 200


@catalog_bp.route("/admin/list", methods=["GET"])
@jwt_required()
@admin_required
def admin_list_all():
    """
    GET /api/stocks/admin/list

    Lista TODOS los tickers (incluyendo no soportados/inactivos) para la vista admin.
    """
    from app.services.ticker_service import TickerService

    result = TickerService.get_list(
        sector   = (request.args.get("sector")   or "") or None,
        exchange = (request.args.get("exchange") or "") or None,
        country  = (request.args.get("country")  or "") or None,
        search   = (request.args.get("search")   or "") or None,
        supported = False,   # Devuelve todos, incluidos no soportados
        page     = max(1, int(request.args.get("page",     1))),
        per_page = min(200, max(1, int(request.args.get("per_page", 100)))),
    )
    return jsonify(result), 200
