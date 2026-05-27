"""
TickerService — gestiona el catálogo maestro de tickers de la plataforma.

Responsabilidades:
  - seed():        poblar la tabla `tickers` con el universo de 100+ instrumentos
  - sync_ticker(): actualizar metadatos de un ticker desde yfinance
  - sync_all():    sincronizar todos los tickers en batches con backoff
  - get_list():    devolver tickers con filtros y caché Redis
  - get_detail():  devolver detalle de un ticker con caché Redis
  - invalidate_cache(): limpiar caché tras seed/sync/patch
"""
from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime, timezone
from typing import Optional

from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

# ── TTLs de caché (segundos) ──────────────────────────────────────────────────
_TTL_LIST   = 120   # 2 minutos para el listado
_TTL_DETAIL = 300   # 5 minutos para detalle individual

# ── Universo completo de tickers ──────────────────────────────────────────────
# Campos base: symbol, name, exchange, sector, industry, country, currency
# Los campos de precio (last_price, market_cap, etc.) se rellenan con sync().
TICKER_UNIVERSE: list[dict] = [
    # ── Tecnología US ────────────────────────────────────────────────────
    {"symbol": "AAPL",   "name": "Apple Inc.",                     "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Consumer Electronics",  "country": "US", "currency": "USD"},
    {"symbol": "MSFT",   "name": "Microsoft Corporation",          "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "NVDA",   "name": "NVIDIA Corporation",             "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "US", "currency": "USD"},
    {"symbol": "GOOGL",  "name": "Alphabet Inc.",                  "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Internet Content",      "country": "US", "currency": "USD"},
    {"symbol": "META",   "name": "Meta Platforms Inc.",            "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Internet Content",      "country": "US", "currency": "USD"},
    {"symbol": "AMZN",   "name": "Amazon.com Inc.",                "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Internet Retail",       "country": "US", "currency": "USD"},
    {"symbol": "TSLA",   "name": "Tesla Inc.",                     "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Auto Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "AMD",    "name": "Advanced Micro Devices Inc.",    "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "US", "currency": "USD"},
    {"symbol": "INTC",   "name": "Intel Corporation",              "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "US", "currency": "USD"},
    {"symbol": "ORCL",   "name": "Oracle Corporation",             "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "CRM",    "name": "Salesforce Inc.",                "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "ADBE",   "name": "Adobe Inc.",                     "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "IBM",    "name": "International Business Machines","exchange": "NYSE",   "sector": "Tecnología",        "industry": "IT Services",           "country": "US", "currency": "USD"},
    {"symbol": "QCOM",   "name": "Qualcomm Inc.",                  "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "US", "currency": "USD"},
    {"symbol": "AVGO",   "name": "Broadcom Inc.",                  "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "US", "currency": "USD"},
    {"symbol": "ASML",   "name": "ASML Holding N.V.",              "exchange": "NASDAQ", "sector": "Tecnología",        "industry": "Semiconductors",        "country": "NL", "currency": "USD"},
    {"symbol": "SHOP",   "name": "Shopify Inc.",                   "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Internet Retail",       "country": "CA", "currency": "USD"},
    {"symbol": "SNOW",   "name": "Snowflake Inc.",                 "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "PLTR",   "name": "Palantir Technologies Inc.",     "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    {"symbol": "NET",    "name": "Cloudflare Inc.",                "exchange": "NYSE",   "sector": "Tecnología",        "industry": "Software",              "country": "US", "currency": "USD"},
    # ── Finanzas US ──────────────────────────────────────────────────────
    {"symbol": "JPM",    "name": "JPMorgan Chase & Co.",           "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Banks",                 "country": "US", "currency": "USD"},
    {"symbol": "BAC",    "name": "Bank of America Corp.",          "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Banks",                 "country": "US", "currency": "USD"},
    {"symbol": "WFC",    "name": "Wells Fargo & Company",          "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Banks",                 "country": "US", "currency": "USD"},
    {"symbol": "GS",     "name": "The Goldman Sachs Group Inc.",   "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Capital Markets",       "country": "US", "currency": "USD"},
    {"symbol": "MS",     "name": "Morgan Stanley",                 "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Capital Markets",       "country": "US", "currency": "USD"},
    {"symbol": "C",      "name": "Citigroup Inc.",                 "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Banks",                 "country": "US", "currency": "USD"},
    {"symbol": "V",      "name": "Visa Inc.",                      "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Credit Services",       "country": "US", "currency": "USD"},
    {"symbol": "MA",     "name": "Mastercard Incorporated",        "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Credit Services",       "country": "US", "currency": "USD"},
    {"symbol": "PYPL",   "name": "PayPal Holdings Inc.",           "exchange": "NASDAQ", "sector": "Finanzas",          "industry": "Credit Services",       "country": "US", "currency": "USD"},
    {"symbol": "COIN",   "name": "Coinbase Global Inc.",           "exchange": "NASDAQ", "sector": "Finanzas",          "industry": "Capital Markets",       "country": "US", "currency": "USD"},
    {"symbol": "BLK",    "name": "BlackRock Inc.",                 "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Asset Management",      "country": "US", "currency": "USD"},
    {"symbol": "SCHW",   "name": "The Charles Schwab Corporation", "exchange": "NYSE",   "sector": "Finanzas",          "industry": "Capital Markets",       "country": "US", "currency": "USD"},
    # ── Consumo US ───────────────────────────────────────────────────────
    {"symbol": "WMT",    "name": "Walmart Inc.",                   "exchange": "NYSE",   "sector": "Consumo",           "industry": "Discount Stores",       "country": "US", "currency": "USD"},
    {"symbol": "COST",   "name": "Costco Wholesale Corporation",   "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Discount Stores",       "country": "US", "currency": "USD"},
    {"symbol": "MCD",    "name": "McDonald's Corporation",         "exchange": "NYSE",   "sector": "Consumo",           "industry": "Restaurants",           "country": "US", "currency": "USD"},
    {"symbol": "SBUX",   "name": "Starbucks Corporation",          "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Restaurants",           "country": "US", "currency": "USD"},
    {"symbol": "NKE",    "name": "Nike Inc.",                      "exchange": "NYSE",   "sector": "Consumo",           "industry": "Footwear & Accessories","country": "US", "currency": "USD"},
    {"symbol": "HD",     "name": "The Home Depot Inc.",            "exchange": "NYSE",   "sector": "Consumo",           "industry": "Home Improvement",      "country": "US", "currency": "USD"},
    {"symbol": "LOW",    "name": "Lowe's Companies Inc.",          "exchange": "NYSE",   "sector": "Consumo",           "industry": "Home Improvement",      "country": "US", "currency": "USD"},
    {"symbol": "TGT",    "name": "Target Corporation",             "exchange": "NYSE",   "sector": "Consumo",           "industry": "Discount Stores",       "country": "US", "currency": "USD"},
    {"symbol": "KO",     "name": "The Coca-Cola Company",          "exchange": "NYSE",   "sector": "Consumo",           "industry": "Beverages",             "country": "US", "currency": "USD"},
    {"symbol": "PEP",    "name": "PepsiCo Inc.",                   "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Beverages",             "country": "US", "currency": "USD"},
    {"symbol": "PG",     "name": "Procter & Gamble Co.",           "exchange": "NYSE",   "sector": "Consumo",           "industry": "Household Products",    "country": "US", "currency": "USD"},
    {"symbol": "NFLX",   "name": "Netflix Inc.",                   "exchange": "NASDAQ", "sector": "Consumo",           "industry": "Streaming",             "country": "US", "currency": "USD"},
    {"symbol": "DIS",    "name": "The Walt Disney Company",        "exchange": "NYSE",   "sector": "Consumo",           "industry": "Entertainment",         "country": "US", "currency": "USD"},
    {"symbol": "SPOT",   "name": "Spotify Technology S.A.",        "exchange": "NYSE",   "sector": "Consumo",           "industry": "Streaming",             "country": "SE", "currency": "USD"},
    # ── Salud US ─────────────────────────────────────────────────────────
    {"symbol": "JNJ",    "name": "Johnson & Johnson",              "exchange": "NYSE",   "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "PFE",    "name": "Pfizer Inc.",                    "exchange": "NYSE",   "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "MRK",    "name": "Merck & Co. Inc.",               "exchange": "NYSE",   "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "ABBV",   "name": "AbbVie Inc.",                    "exchange": "NYSE",   "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "LLY",    "name": "Eli Lilly and Company",          "exchange": "NYSE",   "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "US", "currency": "USD"},
    {"symbol": "UNH",    "name": "UnitedHealth Group Incorporated","exchange": "NYSE",   "sector": "Salud",             "industry": "Healthcare Plans",      "country": "US", "currency": "USD"},
    {"symbol": "CVS",    "name": "CVS Health Corporation",         "exchange": "NYSE",   "sector": "Salud",             "industry": "Healthcare Plans",      "country": "US", "currency": "USD"},
    {"symbol": "MDT",    "name": "Medtronic plc",                  "exchange": "NYSE",   "sector": "Salud",             "industry": "Medical Devices",       "country": "IE", "currency": "USD"},
    {"symbol": "ISRG",   "name": "Intuitive Surgical Inc.",        "exchange": "NASDAQ", "sector": "Salud",             "industry": "Medical Devices",       "country": "US", "currency": "USD"},
    # ── Energía US ───────────────────────────────────────────────────────
    {"symbol": "XOM",    "name": "Exxon Mobil Corporation",        "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "US", "currency": "USD"},
    {"symbol": "CVX",    "name": "Chevron Corporation",            "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "US", "currency": "USD"},
    {"symbol": "COP",    "name": "ConocoPhillips",                 "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas E&P",         "country": "US", "currency": "USD"},
    {"symbol": "SLB",    "name": "SLB (Schlumberger Limited)",     "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Equipment",   "country": "US", "currency": "USD"},
    {"symbol": "BP",     "name": "BP p.l.c.",                      "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "GB", "currency": "USD"},
    {"symbol": "SHEL",   "name": "Shell plc",                      "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "GB", "currency": "USD"},
    {"symbol": "TTE",    "name": "TotalEnergies SE",               "exchange": "NYSE",   "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "FR", "currency": "USD"},
    # ── ETFs ─────────────────────────────────────────────────────────────
    {"symbol": "SPY",    "name": "SPDR S&P 500 ETF Trust",         "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Large Blend",     "country": "US", "currency": "USD"},
    {"symbol": "QQQ",    "name": "Invesco QQQ Trust",              "exchange": "NASDAQ", "sector": "ETF",               "industry": "ETF - Technology",      "country": "US", "currency": "USD"},
    {"symbol": "DIA",    "name": "SPDR Dow Jones Industrial ETF",  "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Large Blend",     "country": "US", "currency": "USD"},
    {"symbol": "IWM",    "name": "iShares Russell 2000 ETF",       "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Small Blend",     "country": "US", "currency": "USD"},
    {"symbol": "VOO",    "name": "Vanguard S&P 500 ETF",           "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Large Blend",     "country": "US", "currency": "USD"},
    {"symbol": "VTI",    "name": "Vanguard Total Stock Market ETF","exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Large Blend",     "country": "US", "currency": "USD"},
    {"symbol": "ARKK",   "name": "ARK Innovation ETF",             "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Technology",      "country": "US", "currency": "USD"},
    {"symbol": "XLK",    "name": "Technology Select Sector SPDR",  "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Technology",      "country": "US", "currency": "USD"},
    {"symbol": "XLF",    "name": "Financial Select Sector SPDR",   "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Financial",       "country": "US", "currency": "USD"},
    {"symbol": "XLE",    "name": "Energy Select Sector SPDR",      "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Energy",          "country": "US", "currency": "USD"},
    {"symbol": "XLV",    "name": "Health Care Select Sector SPDR", "exchange": "NYSE",   "sector": "ETF",               "industry": "ETF - Health",          "country": "US", "currency": "USD"},
    # ── España / BME ─────────────────────────────────────────────────────
    {"symbol": "SAN.MC", "name": "Banco Santander S.A.",           "exchange": "BME",    "sector": "Finanzas",          "industry": "Banks",                 "country": "ES", "currency": "EUR"},
    {"symbol": "BBVA.MC","name": "BBVA",                           "exchange": "BME",    "sector": "Finanzas",          "industry": "Banks",                 "country": "ES", "currency": "EUR"},
    {"symbol": "ITX.MC", "name": "Inditex (Industria de Diseño Textil)", "exchange": "BME", "sector": "Consumo",        "industry": "Apparel Retail",        "country": "ES", "currency": "EUR"},
    {"symbol": "IBE.MC", "name": "Iberdrola S.A.",                 "exchange": "BME",    "sector": "Energía",           "industry": "Utilities - Renewable", "country": "ES", "currency": "EUR"},
    {"symbol": "TEF.MC", "name": "Telefónica S.A.",                "exchange": "BME",    "sector": "Telecomunicaciones","industry": "Telecom Services",      "country": "ES", "currency": "EUR"},
    {"symbol": "REP.MC", "name": "Repsol S.A.",                    "exchange": "BME",    "sector": "Energía",           "industry": "Oil & Gas Integrated",  "country": "ES", "currency": "EUR"},
    {"symbol": "CABK.MC","name": "CaixaBank S.A.",                 "exchange": "BME",    "sector": "Finanzas",          "industry": "Banks",                 "country": "ES", "currency": "EUR"},
    {"symbol": "AENA.MC","name": "Aena S.M.E., S.A.",              "exchange": "BME",    "sector": "Industrial",        "industry": "Airports & Air Services","country": "ES", "currency": "EUR"},
    {"symbol": "AMS.MC", "name": "Amadeus IT Group S.A.",          "exchange": "BME",    "sector": "Tecnología",        "industry": "IT Services",           "country": "ES", "currency": "EUR"},
    {"symbol": "FER.MC", "name": "Ferrovial SE",                   "exchange": "BME",    "sector": "Industrial",        "industry": "Engineering & Construction","country": "ES","currency": "EUR"},
    # ── Francia / Euronext Paris ──────────────────────────────────────────
    {"symbol": "AIR.PA", "name": "Airbus SE",                      "exchange": "EPA",    "sector": "Industrial",        "industry": "Aerospace & Defense",   "country": "FR", "currency": "EUR"},
    {"symbol": "MC.PA",  "name": "LVMH Moët Hennessy Louis Vuitton","exchange": "EPA",   "sector": "Consumo",           "industry": "Luxury Goods",          "country": "FR", "currency": "EUR"},
    {"symbol": "OR.PA",  "name": "L'Oréal S.A.",                   "exchange": "EPA",    "sector": "Consumo",           "industry": "Personal Products",     "country": "FR", "currency": "EUR"},
    # ── Alemania / XETRA ─────────────────────────────────────────────────
    {"symbol": "SAP.DE", "name": "SAP SE",                         "exchange": "XETRA",  "sector": "Tecnología",        "industry": "Software",              "country": "DE", "currency": "EUR"},
    {"symbol": "SIE.DE", "name": "Siemens AG",                     "exchange": "XETRA",  "sector": "Industrial",        "industry": "Diversified Industrials","country": "DE", "currency": "EUR"},
    {"symbol": "BMW.DE", "name": "BMW AG",                         "exchange": "XETRA",  "sector": "Consumo",           "industry": "Auto Manufacturers",    "country": "DE", "currency": "EUR"},
    {"symbol": "VOW3.DE","name": "Volkswagen AG",                  "exchange": "XETRA",  "sector": "Consumo",           "industry": "Auto Manufacturers",    "country": "DE", "currency": "EUR"},
    # ── Suiza / SIX ──────────────────────────────────────────────────────
    {"symbol": "NESN.SW","name": "Nestlé S.A.",                    "exchange": "SIX",    "sector": "Consumo",           "industry": "Food Products",         "country": "CH", "currency": "CHF"},
    {"symbol": "NOVN.SW","name": "Novartis AG",                    "exchange": "SIX",    "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "CH", "currency": "CHF"},
    {"symbol": "ROG.SW", "name": "Roche Holding AG",               "exchange": "SIX",    "sector": "Salud",             "industry": "Drug Manufacturers",    "country": "CH", "currency": "CHF"},
]

# ── Helpers de caché ──────────────────────────────────────────────────────────

def _cache_get(key: str):
    from app import redis_client
    if redis_client:
        try:
            raw = redis_client.get(f"ticker:{key}")
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    return None


def _cache_set(key: str, data, ttl: int = _TTL_LIST):
    from app import redis_client
    if redis_client:
        try:
            redis_client.setex(f"ticker:{key}", ttl, json.dumps(data, default=str))
        except Exception:
            pass


def _cache_del_pattern(pattern: str):
    """Borra todas las claves Redis que coincidan con el patrón."""
    from app import redis_client
    if redis_client:
        try:
            keys = redis_client.keys(f"ticker:{pattern}*")
            if keys:
                redis_client.delete(*keys)
        except Exception:
            pass


def _extract_download_frame(raw, symbol: str, total_symbols: int):
    if raw is None or getattr(raw, "empty", True):
        return None

    frame = raw
    columns = getattr(frame, "columns", None)
    if getattr(columns, "nlevels", 1) > 1:
        symbol_upper = symbol.upper()
        for level in range(columns.nlevels):
            values = [str(value).upper() for value in columns.get_level_values(level)]
            if symbol_upper in values:
                frame = raw.xs(symbol, axis=1, level=level, drop_level=True)
                break
        else:
            return None
    elif total_symbols > 1:
        return None

    rename_map = {}
    for column in frame.columns:
        raw_name = column[0] if isinstance(column, tuple) else column
        normalized = str(raw_name).strip().lower().replace(" ", "")
        if normalized == "open":
            rename_map[column] = "Open"
        elif normalized == "high":
            rename_map[column] = "High"
        elif normalized == "low":
            rename_map[column] = "Low"
        elif normalized in ("close", "adjclose"):
            rename_map[column] = "Close"
        elif normalized == "volume":
            rename_map[column] = "Volume"

    frame = frame.rename(columns=rename_map)
    return frame if "Close" in frame.columns else None


def _quote_from_history(symbol: str) -> dict:
    try:
        from app.models.stock_data import StockData
        from app.services.data_service import DataService, resolve_ticker

        real_symbol = resolve_ticker(symbol)
        DataService.get_latest_price(real_symbol)
        rows = (
            StockData.query
            .filter(StockData.ticker == real_symbol, StockData.close.isnot(None))
            .order_by(StockData.date.desc())
            .limit(2)
            .all()
        )
        if not rows:
            return {}

        latest = rows[0]
        previous_row = rows[1] if len(rows) > 1 else latest
        price = MarketDataService.safe_float(latest.close, field=f"{real_symbol}.history_close")
        previous = MarketDataService.safe_float(previous_row.close, field=f"{real_symbol}.history_previous")
        if price is None or price <= 0:
            return {}
        if previous is None or previous <= 0:
            previous = price

        change = price - previous
        volume_value = MarketDataService.safe_float(latest.volume, field=f"{real_symbol}.history_volume")
        return {
            "last_price": round(price, 4),
            "previous_close": round(previous, 4),
            "day_change": round(change, 4),
            "day_change_pct": round((change / previous) * 100, 4) if previous else None,
            "volume": int(volume_value) if volume_value is not None and volume_value >= 0 else None,
            "is_active": True,
            "last_updated": (
                latest.created_at.isoformat()
                if getattr(latest, "created_at", None)
                else datetime.now(timezone.utc).isoformat()
            ),
        }
    except Exception as exc:
        logger.debug("quote history fallback fallo para %s: %s", symbol, exc)
        return {}


def _enrich_quotes(items: list[dict], max_items: int = 60) -> list[dict]:
    """Anade precios al listado sin depender de una sync manual previa."""
    symbols = list(dict.fromkeys(
        (item.get("symbol") or "").upper()
        for item in items[:max_items]
        if item.get("symbol") and not item.get("last_price")
    ))
    if not symbols:
        return items

    raw = None
    try:
        import yfinance as yf
        raw = yf.download(
            tickers=" ".join(symbols),
            period="5d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as exc:
        logger.warning("quote enrich error: %s", exc)

    quotes: dict[str, dict] = {}
    if raw is not None:
        for symbol in symbols:
            try:
                frame = _extract_download_frame(raw, symbol, len(symbols))
                if frame is None:
                    continue
                frame = frame.dropna(subset=["Close"])
                if frame.empty:
                    continue
                last = frame.iloc[-1]
                prev = frame.iloc[-2] if len(frame) > 1 else last
                price = MarketDataService.safe_float(last.get("Close"), field=f"{symbol}.Close")
                previous = MarketDataService.safe_float(prev.get("Close"), field=f"{symbol}.previousClose")
                if price is None or previous is None or price <= 0:
                    continue
                change = price - previous
                volume_value = MarketDataService.safe_float(last.get("Volume") if "Volume" in frame.columns else None, field=f"{symbol}.Volume")
                quotes[symbol] = {
                    "last_price": round(price, 4),
                    "previous_close": round(previous, 4),
                    "day_change": round(change, 4),
                    "day_change_pct": round((change / previous) * 100, 4) if previous else None,
                    "volume": int(volume_value) if volume_value is not None and volume_value >= 0 else None,
                    "is_active": True,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                }
            except Exception:
                continue

    for symbol in symbols:
        if symbol not in quotes:
            fallback_quote = _quote_from_history(symbol)
            if fallback_quote:
                quotes[symbol] = fallback_quote

    if not quotes:
        return items

    enriched = []
    for item in items:
        copy = dict(item)
        copy.update(quotes.get((copy.get("symbol") or "").upper(), {}))
        enriched.append(copy)
    return enriched


class TickerService:
    """Gestiona el catálogo de tickers y su sincronización con yfinance."""

    # ── Seed ─────────────────────────────────────────────────────────────

    @staticmethod
    def seed(overwrite: bool = False) -> dict:
        """
        Inserta todos los tickers del universo en la tabla `tickers`.

        Si `overwrite=False`, solo inserta los que no existan aún.
        Si `overwrite=True`, actualiza también los metadatos base (nombre, sector, etc.)
        de los existentes, sin tocar precios ni timestamps de sync.
        """
        from app.models.ticker import Ticker
        from app import db

        inserted = updated = skipped = 0

        for entry in TICKER_UNIVERSE:
            symbol = entry["symbol"].upper()
            existing = Ticker.query.filter_by(symbol=symbol).first()

            if existing:
                if overwrite:
                    existing.name     = entry.get("name") or existing.name
                    existing.exchange = entry.get("exchange") or existing.exchange
                    existing.sector   = entry.get("sector") or existing.sector
                    existing.industry = entry.get("industry") or existing.industry
                    existing.country  = entry.get("country") or existing.country
                    existing.currency = entry.get("currency") or existing.currency
                    updated += 1
                else:
                    skipped += 1
            else:
                ticker = Ticker(
                    symbol   = symbol,
                    name     = entry.get("name"),
                    exchange = entry.get("exchange"),
                    sector   = entry.get("sector"),
                    industry = entry.get("industry"),
                    country  = entry.get("country"),
                    currency = entry.get("currency", "USD"),
                )
                db.session.add(ticker)
                inserted += 1

        db.session.commit()
        TickerService.invalidate_cache()

        logger.info("Seed completado: %d insertados, %d actualizados, %d omitidos", inserted, updated, skipped)
        return {"inserted": inserted, "updated": updated, "skipped": skipped, "total": len(TICKER_UNIVERSE)}

    # ── Sync individual ───────────────────────────────────────────────────

    @staticmethod
    def sync_ticker(symbol: str) -> dict:
        """
        Sincroniza los datos de mercado de un ticker desde yfinance.
        Actualiza: last_price, previous_close, volume, market_cap, day_change,
                   day_change_pct, name (si cambió), sector, industry.
        Marca is_active=False si yfinance no devuelve datos válidos.
        """
        import yfinance as yf
        from app.models.ticker import Ticker
        from app import db

        symbol = symbol.upper()
        ticker = Ticker.query.filter_by(symbol=symbol).first()
        if not ticker:
            # Crear entrada mínima si no existe
            ticker = Ticker(symbol=symbol)
            db.session.add(ticker)

        try:
            info = yf.Ticker(symbol).info or {}

            # Detectar ticker deslistado / vacío
            if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
                ticker.is_active = False
                ticker.last_updated = datetime.now(timezone.utc)
                db.session.commit()
                logger.warning("sync_ticker: %s sin datos válidos — marcado inactivo", symbol)
                return {"symbol": symbol, "status": "inactive", "reason": "no_data"}

            # ── Precio ────────────────────────────────────────────────────
            price = MarketDataService.safe_float(
                info.get("currentPrice") or info.get("regularMarketPrice"),
                field=f"{symbol}.currentPrice",
            )
            prev_cl = MarketDataService.safe_float(
                info.get("previousClose") or info.get("regularMarketPreviousClose"),
                field=f"{symbol}.previousClose",
            )
            volume = MarketDataService.safe_float(
                info.get("volume") or info.get("regularMarketVolume"),
                field=f"{symbol}.volume",
            )
            if price is None or price <= 0:
                ticker.is_active = False
                ticker.last_updated = datetime.now(timezone.utc)
                db.session.commit()
                logger.warning("sync_ticker: %s sin precio finito valido", symbol)
                return {"symbol": symbol, "status": "inactive", "reason": "no_valid_price"}

            if price and prev_cl:
                change     = price - prev_cl
                change_pct = (change / prev_cl) * 100
            else:
                change = change_pct = None

            # ── Metadatos ─────────────────────────────────────────────────
            name      = info.get("longName") or info.get("shortName") or ticker.name
            sector    = info.get("sector") or ticker.sector
            industry  = info.get("industry") or ticker.industry
            mkt_cap   = info.get("marketCap")
            currency  = info.get("currency") or ticker.currency or "USD"
            exchange  = info.get("exchange") or ticker.exchange
            logo_url  = info.get("logo_url") or ticker.logo_url

            # ── Actualizar ────────────────────────────────────────────────
            ticker.name           = name
            ticker.sector         = sector
            ticker.industry       = industry
            ticker.currency       = currency
            ticker.exchange       = exchange or ticker.exchange
            market_cap_value      = MarketDataService.safe_float(mkt_cap, field=f"{symbol}.marketCap")
            ticker.market_cap     = int(market_cap_value) if market_cap_value else ticker.market_cap
            ticker.last_price     = price if price else ticker.last_price
            ticker.previous_close = prev_cl if prev_cl else ticker.previous_close
            ticker.volume         = int(volume) if volume else ticker.volume
            ticker.day_change     = round(change, 4) if change is not None else ticker.day_change
            ticker.day_change_pct = round(change_pct, 4) if change_pct is not None else ticker.day_change_pct
            ticker.logo_url       = logo_url
            ticker.is_active      = True
            ticker.last_updated   = datetime.now(timezone.utc)

            db.session.commit()
            TickerService.invalidate_cache(symbol)
            logger.info("sync_ticker OK: %s @ %.4f", symbol, price or 0)
            return {"symbol": symbol, "status": "ok", "price": price}

        except Exception as exc:
            db.session.rollback()
            logger.warning("sync_ticker error %s: %s", symbol, exc)
            return {"symbol": symbol, "status": "error", "reason": str(exc)[:200]}

    # ── Sync masivo ───────────────────────────────────────────────────────

    @staticmethod
    def sync_all(symbols: Optional[list[str]] = None, batch_size: int = 10,
                 delay_between_batches: float = 3.0) -> dict:
        """
        Sincroniza todos los tickers (o los indicados) en batches con backoff.

        - batch_size:              tickers por batch antes de hacer pausa
        - delay_between_batches:   segundos entre batches (base, con jitter)
        """
        from app.models.ticker import Ticker

        if symbols:
            target = [s.upper() for s in symbols]
        else:
            target = [t.symbol for t in Ticker.query.filter_by(is_supported=True).all()]

        if not target:
            # Fallback: usar el universo completo si la tabla está vacía
            target = [t["symbol"] for t in TICKER_UNIVERSE]

        results: dict[str, str] = {}
        ok = errors = inactive = 0

        for i, symbol in enumerate(target):
            # Pausa entre tickers (jitter anti-rate-limit)
            if i > 0:
                jitter = random.uniform(0.3, 1.2)
                time.sleep(jitter)

            # Pausa entre batches
            if i > 0 and i % batch_size == 0:
                pause = delay_between_batches + random.uniform(0, 2)
                logger.info("sync_all: batch completado, pausando %.1fs", pause)
                time.sleep(pause)

            res = TickerService.sync_ticker(symbol)
            results[symbol] = res["status"]

            if res["status"] == "ok":
                ok += 1
            elif res["status"] == "inactive":
                inactive += 1
            else:
                errors += 1
                # Si hay muchos 429 seguidos, pausa larga
                if errors >= 3 and "rate" in res.get("reason", "").lower():
                    logger.warning("sync_all: posible rate-limit, pausa 90s")
                    time.sleep(90)

        TickerService.invalidate_cache()
        return {
            "total":    len(target),
            "ok":       ok,
            "inactive": inactive,
            "errors":   errors,
            "details":  results,
        }

    # ── Listado con filtros ───────────────────────────────────────────────

    @staticmethod
    def get_list(
        sector:    Optional[str] = None,
        exchange:  Optional[str] = None,
        country:   Optional[str] = None,
        search:    Optional[str] = None,
        supported: bool = True,
        page:      int  = 1,
        per_page:  int  = 50,
    ) -> dict:
        """
        Devuelve tickers con filtros opcionales, paginados.
        Si la tabla está vacía devuelve la lista estática del universo como fallback.
        Caché Redis de 2 minutos.
        """
        from app.models.ticker import Ticker

        cache_key = f"list:v3:{sector}:{exchange}:{country}:{search}:{supported}:{page}:{per_page}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        query = Ticker.query

        if supported:
            query = query.filter_by(is_supported=True)
        if sector:
            query = query.filter(Ticker.sector.ilike(f"%{sector}%"))
        if exchange:
            query = query.filter(Ticker.exchange.ilike(f"%{exchange}%"))
        if country:
            query = query.filter(Ticker.country.ilike(f"%{country}%"))
        if search:
            s = f"%{search.upper()}%"
            from sqlalchemy import or_
            query = query.filter(
                or_(Ticker.symbol.ilike(s), Ticker.name.ilike(f"%{search}%"))
            )

        query = query.order_by(Ticker.symbol.asc())

        total  = query.count()
        items  = query.offset((page - 1) * per_page).limit(per_page).all()
        table_total = Ticker.query.count()

        # Fallback: si la tabla esta vacia, usar universo estatico filtrable.
        if table_total == 0:
            logger.warning("get_list: tabla tickers vacía — usando universo estático como fallback")
            universe = list(TICKER_UNIVERSE)
            if sector:
                universe = [t for t in universe if sector.lower() in (t.get("sector") or "").lower()]
            if exchange:
                universe = [t for t in universe if exchange.lower() in (t.get("exchange") or "").lower()]
            if country:
                universe = [t for t in universe if country.lower() in (t.get("country") or "").lower()]
            if search:
                needle = search.lower()
                universe = [
                    t for t in universe
                    if needle in (t.get("symbol") or "").lower()
                    or needle in (t.get("name") or "").lower()
                ]
            universe_slice = [
                {**t, "is_supported": True, "is_active": True}
                for t in universe[(page-1)*per_page : page*per_page]
            ]
            universe_slice = _enrich_quotes(universe_slice)
            result = {
                "tickers":   universe_slice,
                "total":     len(universe),
                "page":      page,
                "per_page":  per_page,
                "pages":     max(1, (len(universe) + per_page - 1) // per_page),
                "from_seed": True,
            }
            return result

        tickers = [t.to_dict() for t in items]
        tickers = _enrich_quotes(tickers)
        result = {
            "tickers":  tickers,
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    max(1, (total + per_page - 1) // per_page),
            "from_seed": False,
        }
        _cache_set(cache_key, result, ttl=_TTL_LIST)
        return result

    # ── Detalle individual ────────────────────────────────────────────────

    @staticmethod
    def get_detail(symbol: str) -> Optional[dict]:
        """Devuelve el detalle completo de un ticker. Caché 5 minutos."""
        from app.models.ticker import Ticker

        symbol = symbol.upper()
        cache_key = f"detail:{symbol}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        ticker = Ticker.query.filter_by(symbol=symbol).first()
        if not ticker:
            for entry in TICKER_UNIVERSE:
                if entry["symbol"].upper() == symbol:
                    enriched = _enrich_quotes([dict(entry)], max_items=1)[0]
                    enriched.update({"is_supported": True, "is_active": True, "from_seed": True})
                    return enriched

            sync_result = TickerService.sync_ticker(symbol)
            if sync_result.get("status") == "ok":
                ticker = Ticker.query.filter_by(symbol=symbol).first()
            if not ticker:
                return None

        result = ticker.to_dict(full=True)
        if not result.get("last_price"):
            result = _enrich_quotes([result], max_items=1)[0]
        _cache_set(cache_key, result, ttl=_TTL_DETAIL)
        return result

    # ── Invalidar caché ───────────────────────────────────────────────────

    @staticmethod
    def invalidate_cache(symbol: Optional[str] = None):
        """
        Borra caché de tickers en Redis.
        Si se pasa symbol, borra solo el detalle de ese ticker.
        Si no se pasa, borra todo el catálogo (listas + detalles).
        """
        if symbol:
            _cache_del_pattern(f"detail:{symbol.upper()}")
        else:
            _cache_del_pattern("list:")
            _cache_del_pattern("detail:")

    # ── Helpers para otros servicios ──────────────────────────────────────

    @staticmethod
    def get_supported_symbols() -> list[str]:
        """Devuelve lista de símbolos soportados (para tareas Celery, etc.)."""
        from app.models.ticker import Ticker
        try:
            rows = Ticker.query.filter_by(is_supported=True, is_active=True).with_entities(Ticker.symbol).all()
            symbols = [r[0] for r in rows]
            if symbols:
                return symbols
        except Exception:
            pass
        # Fallback estático si la BD no está disponible
        return [t["symbol"] for t in TICKER_UNIVERSE]

    @staticmethod
    def get_name(symbol: str) -> str:
        """Devuelve el nombre de un ticker desde BD (o fallback estático)."""
        from app.models.ticker import Ticker
        try:
            t = Ticker.query.filter_by(symbol=symbol.upper()).first()
            if t and t.name:
                return t.name
        except Exception:
            pass
        # Fallback al universo estático
        for entry in TICKER_UNIVERSE:
            if entry["symbol"] == symbol.upper():
                return entry["name"]
        return f"{symbol.upper()} Corp."
