"""
Constantes globales de la aplicación.
"""

# ── Modelos ML soportados ──────────────────────────────────────────────────
VALID_MODELS = ["prophet", "arima", "sma"]

# ── Tipos de alerta soportados ─────────────────────────────────────────────
VALID_ALERT_TYPES = ["price_threshold", "prediction_change", "trend_reversal"]

# ── Horizontes de predicción permitidos (días) ─────────────────────────────
VALID_HORIZONS = [5, 10, 20, 30, 60]

# ── Períodos históricos (días) ─────────────────────────────────────────────
HISTORICAL_PERIODS = {
    "1y": 365,
    "3y": 1095,
    "5y": 1825,
}

# ── Límites de la API ──────────────────────────────────────────────────────
MAX_BATCH_TICKERS = 10
MAX_ALERT_PER_USER = 50
MAX_PORTFOLIO_PER_USER = 10
MAX_POSITIONS_PER_PORTFOLIO = 50

# ── Ticker validation ──────────────────────────────────────────────────────
TICKER_MIN_LEN = 1
TICKER_MAX_LEN = 10

# ── Disclaimer ────────────────────────────────────────────────────────────
DISCLAIMER = (
    "Las predicciones tienen ~55-60% precisión. "
    "No constituyen asesoramiento financiero."
)
