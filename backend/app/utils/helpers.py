"""
Funciones auxiliares de uso general.
"""
import re
from datetime import date, datetime
from typing import Any


def validate_ticker(ticker: str) -> bool:
    """Retorna True si el ticker tiene formato válido."""
    if not ticker or not isinstance(ticker, str):
        return False
    ticker = ticker.strip().upper()
    if len(ticker) < 1 or len(ticker) > 10:
        return False
    return bool(re.match(r"^[A-Z0-9.\-^=]+$", ticker))


def safe_float(value: Any, default: float | None = None) -> float | None:
    """Convierte un valor a float de forma segura."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int | None = None) -> int | None:
    """Convierte un valor a int de forma segura."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def paginate_query(query, page: int = 1, per_page: int = 20):
    """Aplica paginación a un query SQLAlchemy."""
    page = max(1, page)
    per_page = min(max(1, per_page), 100)
    offset = (page - 1) * per_page
    items = query.limit(per_page).offset(offset).all()
    total = query.count()
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


def format_currency(amount: float, currency: str = "USD") -> str:
    return f"{currency} {amount:,.2f}"


def date_to_iso(d) -> str | None:
    if d is None:
        return None
    if isinstance(d, (date, datetime)):
        return d.isoformat()
    return str(d)


def round_or_none(value: Any, decimals: int = 4) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None
