"""
Blueprint: /api/news — Noticias financieras usando Finnhub API
Finnhub docs: https://finnhub.io/docs/api/market-news
Cache: Redis (cuando disponible) → dict en memoria como fallback
"""
import json
import os
import time
import logging
from datetime import datetime, timedelta, date

import requests
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

news_bp = Blueprint("news", __name__)

# ── Finnhub ───────────────────────────────────────────────────────────────────
FINNHUB_BASE = "https://finnhub.io/api/v1"
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
_HTTP_TIMEOUT = 10

# ── Caché en memoria (fallback cuando Redis no está disponible) ───────────────
_MEM_CACHE: dict = {}
CACHE_TTL = 10 * 60  # 10 minutos


# ── Helpers de caché ──────────────────────────────────────────────────────────

def _cache_get(key: str):
    from app import redis_client
    if redis_client:
        try:
            raw = redis_client.get(f"news:{key}")
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.debug("Redis GET falló, usando memoria: %s", exc)
    entry = _MEM_CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    from app import redis_client
    if redis_client:
        try:
            redis_client.setex(f"news:{key}", CACHE_TTL, json.dumps(data))
            return
        except Exception as exc:
            logger.debug("Redis SET falló, usando memoria: %s", exc)
    _MEM_CACHE[key] = {"data": data, "ts": time.time()}


def clear_news_cache() -> int:
    """Limpia cache de noticias en Redis y memoria."""
    removed = len(_MEM_CACHE)
    _MEM_CACHE.clear()
    try:
        from app import redis_client
        if redis_client:
            keys = redis_client.keys("news:*")
            if keys:
                removed += redis_client.delete(*keys)
    except Exception:
        pass
    return removed


# ── Finnhub helpers ───────────────────────────────────────────────────────────

def _finnhub_get(endpoint: str, params: dict):
    """Llama a Finnhub y devuelve el JSON, o None si falla."""
    if not FINNHUB_API_KEY:
        logger.warning("FINNHUB_API_KEY no configurada — añádela al docker-compose.yml")
        return None
    params["token"] = FINNHUB_API_KEY
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}{endpoint}",
            params=params,
            timeout=_HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Finnhub error (%s): %s", endpoint, exc)
        return None


def _format_finnhub_article(art: dict) -> dict:
    """
    Normaliza un artículo de Finnhub al formato interno.

    Campos Finnhub:
      id, headline, summary, source, url, image,
      datetime (unix int), category, related (ticker string)
    """
    related = art.get("related", "") or ""
    tickers = [t.strip() for t in related.split(",") if t.strip()] if related else []

    return {
        "id":           str(art.get("id", "")),
        "title":        art.get("headline", "Sin título"),
        "publisher":    art.get("source", ""),
        "url":          art.get("url", "#"),
        "published_at": art.get("datetime", 0),
        "thumbnail":    art.get("image") or None,
        "tickers":      tickers,
        "type":         "STORY",
        "summary":      art.get("summary", ""),
        "category":     art.get("category", "general"),
    }


def _format_yfinance_article(item: dict, ticker: str | None = None) -> dict:
    """Normaliza una noticia de yfinance al formato interno."""
    content = item.get("content") if isinstance(item.get("content"), dict) else item
    title = content.get("title") or content.get("headline") or "Sin titulo"
    summary = content.get("summary") or content.get("description") or ""
    link = content.get("canonicalUrl") or content.get("clickThroughUrl") or content.get("link") or {}
    url = link.get("url") if isinstance(link, dict) else link

    published = content.get("pubDate") or content.get("providerPublishTime") or 0
    if isinstance(published, str):
        try:
            published = int(datetime.fromisoformat(published.replace("Z", "+00:00")).timestamp())
        except Exception:
            published = 0

    provider = content.get("provider") or content.get("publisher") or {}
    publisher = provider.get("displayName") if isinstance(provider, dict) else provider
    thumbnail = None
    thumb = content.get("thumbnail") or {}
    if isinstance(thumb, dict):
        resolutions = thumb.get("resolutions") or []
        if resolutions:
            thumbnail = resolutions[-1].get("url")

    tickers = [ticker.upper()] if ticker else []
    related = content.get("relatedTickers") or []
    if isinstance(related, list):
        tickers = sorted(set(tickers + [str(t).upper() for t in related if t]))

    return {
        "id": str(content.get("id") or content.get("uuid") or url or title),
        "title": title,
        "publisher": publisher or "Yahoo Finance",
        "url": url or "#",
        "published_at": published,
        "thumbnail": thumbnail,
        "tickers": tickers,
        "type": "STORY",
        "summary": summary,
        "category": "general",
    }


def _get_yfinance_news(ticker: str, count: int = 20) -> list:
    """Fallback de noticias por ticker usando yfinance."""
    try:
        import yfinance as yf
        raw = yf.Ticker(ticker.upper()).news or []
        articles = [_format_yfinance_article(item, ticker=ticker) for item in raw]
        articles.sort(key=lambda a: a.get("published_at") or 0, reverse=True)
        return articles[:count]
    except Exception as exc:
        logger.warning("yfinance news error para %s: %s", ticker, exc)
        return []


def _fallback_news(ticker: str | None = None, count: int = 10) -> list:
    """Ultimo recurso para no romper la UI si no hay APIs configuradas."""
    symbol = ticker.upper() if ticker else "MERCADO"
    now = int(time.time())
    templates = [
        ("Resumen de mercado", "Los inversores siguen atentos a resultados, tipos y volumen."),
        ("Momentum sectorial", "Tecnologia, energia y consumo muestran movimientos mixtos."),
        ("Lectura tecnica", "Conviene vigilar soporte, resistencia y volatilidad."),
    ]
    return [
        {
            "id": f"news-{symbol}-{i}",
            "title": f"{title}: {symbol}",
            "publisher": "MyPredicts",
            "url": "#",
            "published_at": now - i * 3600,
            "thumbnail": None,
            "tickers": [symbol] if ticker else [],
            "type": "STORY",
            "summary": summary,
            "category": "general",
        }
        for i, (title, summary) in enumerate(templates[:count], start=1)
    ]


def _get_general_news(category: str = "general", count: int = 50) -> list:
    """Noticias generales de mercado por categoría."""
    data = _finnhub_get("/news", {"category": category})
    if not data or not isinstance(data, list):
        popular = []
        seen = set()
        for tkr in ("AAPL", "MSFT", "NVDA", "TSLA", "AMZN"):
            for art in _get_yfinance_news(tkr, count=4):
                if art["id"] not in seen:
                    seen.add(art["id"])
                    popular.append(art)
        popular.sort(key=lambda a: a.get("published_at") or 0, reverse=True)
        return popular[:count] or _fallback_news(count=count)
    articles = [_format_finnhub_article(a) for a in data]
    articles.sort(key=lambda a: a.get("published_at") or 0, reverse=True)
    return articles[:count]


def _get_company_news(ticker: str, days_back: int = 7) -> list:
    """Noticias de una empresa específica (últimos N días)."""
    end = date.today()
    start = end - timedelta(days=days_back)
    data = _finnhub_get(
        "/company-news",
        {
            "symbol": ticker.upper(),
            "from":   start.isoformat(),
            "to":     end.isoformat(),
        },
    )
    if not data or not isinstance(data, list):
        return _get_yfinance_news(ticker, count=20)
    articles = [_format_finnhub_article(a) for a in data]
    for a in articles:
        if ticker.upper() not in a["tickers"]:
            a["tickers"] = [ticker.upper()] + a["tickers"]
    articles.sort(key=lambda a: a.get("published_at") or 0, reverse=True)
    return articles


# ── Rutas ─────────────────────────────────────────────────────────────────────

@news_bp.route("", methods=["GET"])
def get_news():
    """
    GET /api/news?ticker=AAPL&limit=30&category=general

    Sin ticker  → noticias generales del mercado.
    Con ticker  → noticias específicas de esa empresa.
    category    → general | forex | crypto | merger  (solo sin ticker)
    """
    ticker_param = (request.args.get("ticker") or "").strip().upper()
    try:
        limit = min(max(int(request.args.get("limit", 30)), 1), 80)
    except (TypeError, ValueError):
        limit = 30
    category     = (request.args.get("category") or "general").strip().lower()
    if category not in ("general", "forex", "crypto", "merger"):
        category = "general"

    cache_key = (
        f"ticker_{ticker_param}_{limit}"
        if ticker_param
        else f"general_{category}_{limit}"
    )

    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

    if ticker_param:
        articles = _get_company_news(ticker_param, days_back=14)
        # Complementar con noticias generales si hay pocas del ticker
        if len(articles) < 5:
            general = _get_general_news("general", 20)
            seen_ids = {a["id"] for a in articles}
            for a in general:
                if a["id"] not in seen_ids:
                    articles.append(a)
    else:
        articles = _get_general_news(category, limit)

    articles = articles[:limit]
    if not articles:
        articles = _fallback_news(ticker_param or None, count=min(limit, 10))

    result = {
        "articles":  articles,
        "total":     len(articles),
        "ticker":    ticker_param or None,
        "category":  category,
        "source":    "finnhub/yfinance",
        "cached_at": int(time.time()),
    }
    _cache_set(cache_key, result)
    return jsonify(result), 200


@news_bp.route("/trending", methods=["GET"])
def get_trending():
    """
    GET /api/news/trending

    Noticias agrupadas por las 4 categorías de Finnhub +
    un bloque con los tickers más populares.
    """
    cache_key = "trending_v2"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

    CATEGORIES = {
        "Mercado General": "general",
        "Divisas (Forex)": "forex",
        "Criptomonedas":   "crypto",
        "Fusiones & M&A":  "merger",
    }

    by_sector: dict = {}
    for label, cat in CATEGORIES.items():
        by_sector[label] = _get_general_news(cat, count=8)

    # Top tickers: últimas noticias de las empresas más seguidas
    POPULAR_TICKERS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN"]
    popular_arts = []
    seen_ids: set = set()
    for tkr in POPULAR_TICKERS:
        for art in _get_company_news(tkr, days_back=3)[:3]:
            if art["id"] not in seen_ids:
                seen_ids.add(art["id"])
                popular_arts.append(art)

    popular_arts.sort(key=lambda a: a.get("published_at") or 0, reverse=True)
    by_sector["Top Tickers"] = popular_arts[:10]
    if not any(by_sector.values()):
        by_sector["Top Tickers"] = _fallback_news(count=6)

    result = {
        "by_sector": by_sector,
        "source":    "finnhub/yfinance",
        "cached_at": int(time.time()),
    }
    _cache_set(cache_key, result)
    return jsonify(result), 200


@news_bp.route("/sentiment/<ticker>", methods=["GET"])
def get_sentiment(ticker: str):
    """
    GET /api/news/sentiment/AAPL

    Calcula sentimiento positivo/negativo/neutral de las noticias
    recientes del ticker basándose en palabras clave del titular y resumen.
    """
    ticker = ticker.strip().upper()
    cache_key = f"sentiment_{ticker}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

    articles = _get_company_news(ticker, days_back=7)

    POSITIVE_WORDS = {
        "surge", "soar", "rally", "gain", "rise", "up", "beat", "record",
        "profit", "growth", "strong", "bullish", "outperform", "upgrade",
        "revenue", "earnings", "positive", "higher", "boost", "wins",
        "sube", "subida", "récord", "ganancias", "alcista", "supera",
    }
    NEGATIVE_WORDS = {
        "fall", "drop", "decline", "loss", "down", "miss", "weak", "cut",
        "bear", "underperform", "downgrade", "concern", "risk", "lower",
        "baja", "bajada", "pérdidas", "bajista", "preocupación", "riesgo",
        "caída", "desplome",
    }

    pos = neg = neu = 0
    for art in articles:
        text = (art.get("title", "") + " " + art.get("summary", "")).lower()
        words = set(text.split())
        p = len(words & POSITIVE_WORDS)
        n = len(words & NEGATIVE_WORDS)
        if p > n:
            pos += 1
        elif n > p:
            neg += 1
        else:
            neu += 1

    total = pos + neg + neu or 1
    result = {
        "ticker":         ticker,
        "total_articles": total,
        "positive":       pos,
        "negative":       neg,
        "neutral":        neu,
        "positive_pct":   round(pos / total * 100, 1),
        "negative_pct":   round(neg / total * 100, 1),
        "neutral_pct":    round(neu / total * 100, 1),
        "overall":        "positive" if pos > neg else ("negative" if neg > pos else "neutral"),
        "cached_at":      int(time.time()),
    }
    _cache_set(cache_key, result)
    return jsonify(result), 200
