export const API_URL = import.meta.env.VITE_API_URL || ''

export const VALID_MODELS = ['prophet', 'arima', 'sma']
export const MODEL_LABELS = { prophet: 'Prophet', arima: 'ARIMA', sma: 'Media Móvil' }
export const MODEL_COLORS = { prophet: '#2196f3', arima: '#4caf50', sma: '#ff9800' }

export const HORIZONS = [
  { value: 5,  label: '5 días' },
  { value: 10, label: '10 días' },
  { value: 20, label: '20 días' },
  { value: 30, label: '1 mes' },
  { value: 60, label: '2 meses' },
]

export const HISTORICAL_PERIODS = [
  { value: 365,  label: '1 año' },
  { value: 1095, label: '3 años' },
  { value: 1825, label: '5 años' },
]

export const ALERT_TYPES = [
  { value: 'price_threshold',  label: 'Umbral de precio' },
  { value: 'prediction_change',label: 'Cambio de predicción' },
  { value: 'trend_reversal',   label: 'Inversión de tendencia' },
]

export const SORT_OPTIONS = [
  { value: 'recent',   label: 'Más recientes' },
  { value: 'trending', label: 'Trending' },
  { value: 'likes',    label: 'Más valorados' },
]

export const POPULAR_TICKERS = ['AAPL','GOOGL','MSFT','TSLA','AMZN','META','NFLX','NVDA']

export const DISCLAIMER =
  '⚠️ Las predicciones tienen ~55-60% de precisión. No constituyen asesoramiento financiero.'
