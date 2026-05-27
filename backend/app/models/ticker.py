"""
Modelo: Ticker — catálogo maestro de instrumentos financieros soportados.

Este modelo es la fuente de verdad de qué tickers conoce la plataforma.
No contiene datos históricos (eso es StockData), sino metadatos del instrumento:
sector, exchange, país, precio actual, capitalización, estado de soporte, etc.
"""
from datetime import datetime, timezone
from app import db


class Ticker(db.Model):
    __tablename__ = "tickers"

    id             = db.Column(db.Integer, primary_key=True)
    symbol         = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name           = db.Column(db.String(200))
    exchange       = db.Column(db.String(20))       # NASDAQ, NYSE, BME, XETRA, EPA, SIX…
    sector         = db.Column(db.String(100))       # Tecnología, Finanzas, Salud, ETF…
    industry       = db.Column(db.String(150))       # Subcategoría dentro del sector
    country        = db.Column(db.String(10))        # Código ISO-2: US, ES, DE, FR, CH…
    currency       = db.Column(db.String(10), default="USD")

    # ── Precios y volumen (actualizados por sync) ──────────────────────────
    market_cap     = db.Column(db.BigInteger)        # Capitalización en USD
    last_price     = db.Column(db.Numeric(14, 4))
    previous_close = db.Column(db.Numeric(14, 4))
    volume         = db.Column(db.BigInteger)
    day_change     = db.Column(db.Numeric(8, 4))     # Cambio absoluto del día
    day_change_pct = db.Column(db.Numeric(8, 4))     # % cambio del día

    # ── Estado del ticker ──────────────────────────────────────────────────
    # is_active:    False si el ticker ha sido deslistado / ya no opera
    # is_supported: False si la plataforma no lo ofrece al usuario (admin puede desactivarlo)
    is_active      = db.Column(db.Boolean, default=True,  nullable=False)
    is_supported   = db.Column(db.Boolean, default=True,  nullable=False)

    # ── Extras opcionales ─────────────────────────────────────────────────
    logo_url       = db.Column(db.Text)
    description    = db.Column(db.Text)

    # ── Timestamps ────────────────────────────────────────────────────────
    last_updated   = db.Column(db.DateTime)          # Última sync con yfinance
    created_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self, full: bool = False) -> dict:
        data = {
            "symbol":         self.symbol,
            "name":           self.name,
            "exchange":       self.exchange,
            "sector":         self.sector,
            "country":        self.country,
            "currency":       self.currency or "USD",
            "last_price":     float(self.last_price)     if self.last_price     is not None else None,
            "previous_close": float(self.previous_close) if self.previous_close is not None else None,
            "day_change":     float(self.day_change)     if self.day_change     is not None else None,
            "day_change_pct": float(self.day_change_pct) if self.day_change_pct is not None else None,
            "is_active":      self.is_active,
            "is_supported":   self.is_supported,
            "last_updated":   self.last_updated.isoformat() if self.last_updated else None,
        }
        if full:
            data.update({
                "id":          self.id,
                "industry":    self.industry,
                "market_cap":  self.market_cap,
                "volume":      self.volume,
                "logo_url":    self.logo_url,
                "description": self.description,
                "created_at":  self.created_at.isoformat() if self.created_at else None,
            })
        return data

    def __repr__(self) -> str:
        return f"<Ticker {self.symbol} {'✓' if self.is_supported else '✗'}>"
