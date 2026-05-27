import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box, Typography, Grid, Paper, Button, Chip, ToggleButtonGroup, ToggleButton,
  FormGroup, FormControlLabel, Checkbox, CircularProgress, Alert,
  TextField, InputAdornment, IconButton, Skeleton, Divider, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, MenuItem, Select, Slider, LinearProgress,
} from '@mui/material'
import { Search, Star, StarBorder, TrendingUp, TrendingDown, History, BarChart, Speed, CalendarToday, FilterList, PlayArrow, Publish } from '@mui/icons-material'
import { AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip } from 'recharts'
import { fetchStock, fetchIndicators } from '@/store/slices/stockSlice'
import { createPrediction, clearPrediction, fetchPredictions, loadSavedPrediction } from '@/store/slices/predictionSlice'
import { updateProfileThunk } from '@/store/slices/authSlice'
import { stockService } from '@/services/stockService'
import StockChart from '@/components/charts/StockChart'
import PredictionComparison from '@/components/charts/PredictionComparison'
import IndicatorsPanel from '@/components/charts/IndicatorsPanel'
import PredictionCard from '@/components/analysis/PredictionCard'
import TechnicalSummary from '@/components/analysis/TechnicalSummary'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'
import CreateStrategyModal from '@/components/strategies/CreateStrategyModal'
import { VALID_MODELS, HORIZONS, POPULAR_TICKERS } from '@/utils/constants'
import { toast } from 'react-toastify'

// dechever - 26/02/2026: dejé lista la pantalla de predicciones para elegir activo, modelo y horizonte desde la interfaz.
const MODEL_OPTIONS = VALID_MODELS || ['prophet', 'arima', 'sma']
const HORIZON_OPTIONS = Array.isArray(HORIZONS)
  ? HORIZONS.map(h => typeof h === 'object' ? h : { value: h, label: `${h}d` })
  : [{ value: 5, label: '5d' }, { value: 10, label: '10d' }, { value: 20, label: '20d' }, { value: 30, label: '1 mes' }, { value: 60, label: '2 meses' }]

const PROFILE_OPTIONS = [
  {
    value: 'short',
    label: 'Rápido',
    summary: '7 días · 1 año de datos · SMA + ARIMA',
    description: 'Sirve para una lectura corta y sensible al movimiento reciente del precio.',
  },
  {
    value: 'balanced',
    label: 'Balanceado',
    summary: '30 días · 5 años de datos · 3 modelos',
    description: 'Es la opción recomendada: mezcla estabilidad histórica y reacción al mercado actual.',
  },
  {
    value: 'deep',
    label: 'Profundo',
    summary: '60 días · 10 años de datos · 3 modelos',
    description: 'Usa más histórico para suavizar ruido, aunque tarda más y puede reaccionar más lento.',
  },
]

const PROFILE_INFO = PROFILE_OPTIONS.reduce((acc, item) => ({ ...acc, [item.value]: item }), {})
const MODEL_HELP = {
  prophet: 'Suavizado exponencial: proyecta tendencia reciente con pesos ajustados al histórico.',
  arima: 'ARIMA: busca patrones temporales y autocorrelación en la serie de precios.',
  sma: 'Media móvil: referencia sencilla para comparar contra modelos más estadísticos.',
}

const EXAMPLE_PREDICTIONS = [
  { id: 'example-aapl', is_demo: true, group_id: 'example-aapl', ticker: 'AAPL', model: 'prophet', horizon: 30, first_prediction: 214.35, trend: 'up', created_at: '2026-04-24T10:30:00Z' },
  { id: 'example-nvda', is_demo: true, group_id: 'example-nvda', ticker: 'NVDA', model: 'arima', horizon: 20, first_prediction: 926.80, trend: 'up', created_at: '2026-04-23T16:10:00Z' },
  { id: 'example-msft', is_demo: true, group_id: 'example-msft', ticker: 'MSFT', model: 'sma', horizon: 15, first_prediction: 421.45, trend: 'up', created_at: '2026-04-22T12:15:00Z' },
  { id: 'example-tsla', is_demo: true, group_id: 'example-tsla', ticker: 'TSLA', model: 'prophet', horizon: 10, first_prediction: 168.20, trend: 'down', created_at: '2026-04-21T09:45:00Z' },
]

// ─── Mini gráfico tooltip ────────────────────────────────────────────────────
function MiniTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.5 }}>
      <Typography variant="caption" color="#fff">${Number(payload[0].value).toFixed(2)}</Typography>
    </Box>
  )
}

// ─── Tarjeta de ticker para el estado vacío ───────────────────────────────────
function TickerCard({ ticker: t, onNavigate }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    stockService.getStock(t, 30)
      .then(res => { if (!cancelled && res?.data?.length) setData(res) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t])

  if (loading) {
    return (
      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 130 }}>
        <Skeleton variant="text" width={50} />
        <Skeleton variant="text" width={90} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={50} sx={{ borderRadius: 1 }} />
      </Paper>
    )
  }

  const chartData  = data?.data?.map(d => ({ v: Number(d.close) })) || []
  const first      = chartData[0]?.v || 0
  const last       = chartData[chartData.length - 1]?.v || 0
  const change     = first > 0 ? ((last - first) / first) * 100 : 0
  const isUp       = change >= 0
  const color      = isUp ? '#4caf50' : '#f44336'

  return (
    <Paper onClick={() => onNavigate(t)} sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2,
      cursor: 'pointer', height: 130, display: 'flex', flexDirection: 'column',
      transition: 'border-color .2s, transform .15s',
      '&:hover': { borderColor: '#7c3aed', transform: 'translateY(-2px)' },
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography fontWeight={800} color="#fff" fontSize={14}>{t}</Typography>
          <Typography variant="caption" color="#888" sx={{ fontSize: 10 }}>
            {data?.name?.split(' ').slice(0, 2).join(' ') || t}
          </Typography>
        </Box>
        {data && (
          <Box textAlign="right">
            <Typography fontWeight={700} color="#fff" fontSize={13}>${last.toFixed(2)}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.2 }}>
              {isUp ? <TrendingUp sx={{ fontSize: 11, color }} /> : <TrendingDown sx={{ fontSize: 11, color }} />}
              <Typography sx={{ fontSize: 10, color, fontWeight: 700 }}>
                {isUp ? '+' : ''}{change.toFixed(2)}%
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1 }}>
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${t}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                fill={`url(#grad-${t})`} dot={false} isAnimationActive={false} />
              <RechartTooltip content={<MiniTooltip />} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
function PredictionProgressPanel({ prediction, currentPrice, lastUpdate }) {
  const models = prediction?.models || []
  const firstTargets = models
    .map(m => Number(m.predictions?.[0]?.predicted_price))
    .filter(v => Number.isFinite(v) && v > 0)
  const finalTargets = models
    .map(m => Number(m.predictions?.[m.predictions.length - 1]?.predicted_price))
    .filter(v => Number.isFinite(v) && v > 0)
  const average = (values) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  const target = Number(prediction?.consensus?.average_prediction) || average(firstTargets) || average(finalTargets)
  const finalTarget = average(finalTargets) || target
  const confidence = Number(prediction?.consensus?.confidence || prediction?.confidence || 0)
  const directionUp = finalTarget ? finalTarget >= currentPrice : true
  const reached = target ? (directionUp ? currentPrice >= target : currentPrice <= target) : false
  const distance = target ? ((target - currentPrice) / currentPrice) * 100 : 0
  const progress = target
    ? Math.max(0, Math.min(100, reached ? 100 : 100 - Math.min(Math.abs(distance) * 7, 96)))
    : Math.max(8, Math.min(100, confidence || 45))
  const color = reached ? '#22c55e' : directionUp ? '#a855f7' : '#f87171'

  return (
    <Paper sx={{
      bgcolor: 'rgba(10,12,24,.86)',
      border: '1px solid rgba(168,85,247,.18)',
      borderRadius: 3,
      p: 2.5,
      mb: 2,
      background: 'radial-gradient(circle at 8% 0%, rgba(124,58,237,.18), transparent 32%), rgba(10,12,24,.9)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography color="#fff" fontWeight={900}>Seguimiento en directo de la prediccion</Typography>
          <Typography color="#8b8fa3" fontSize={13}>
            Esto no descuenta wallet: solo mide si la prediccion va acercandose al objetivo con el precio actual.
          </Typography>
        </Box>
        <Chip
          icon={directionUp ? <TrendingUp sx={{ fontSize: 16 }} /> : <TrendingDown sx={{ fontSize: 16 }} />}
          label={reached ? 'Objetivo alcanzado' : directionUp ? 'Escenario alcista' : 'Escenario bajista'}
          sx={{ bgcolor: `${color}22`, color, border: `1px solid ${color}55`, fontWeight: 900 }}
        />
      </Box>

      <Grid container spacing={1.5} mb={2}>
        {[
          { label: 'Precio actual', value: `$${Number(currentPrice).toFixed(2)}` },
          { label: 'Objetivo consenso', value: target ? `$${Number(target).toFixed(2)}` : '-' },
          { label: 'Distancia al objetivo', value: target ? `${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%` : '-' },
          { label: 'Confianza ML', value: confidence ? `${Math.round(confidence)}%` : 'Calculando' },
        ].map(item => (
          <Grid item xs={6} md={3} key={item.label}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
              <Typography color="#8b8fa3" fontSize={12}>{item.label}</Typography>
              <Typography color="#fff" fontWeight={950} fontSize={20}>{item.value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 9,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,.08)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 999,
                background: reached ? 'linear-gradient(90deg, #16a34a, #22c55e)' : 'linear-gradient(90deg, #4c1d95, #a855f7)',
              },
            }}
          />
        </Box>
        <Typography color="#c4b5fd" fontWeight={900} minWidth={48} textAlign="right">
          {Math.round(progress)}%
        </Typography>
      </Box>
      {lastUpdate && (
        <Typography color="#6b7280" fontSize={11} mt={1}>
          Ultima actualizacion de mercado: {new Date(lastUpdate).toLocaleString('es-ES')}
        </Typography>
      )}
    </Paper>
  )
}

export default function PredictionPage() {
  const [searchParams]  = useSearchParams()
  const navigate        = useNavigate()
  const dispatch        = useDispatch()
  const { user, token, isAuthenticated } = useSelector(s => s.auth)
  const { currentStock, indicators, isLoading: stockLoading } = useSelector(s => s.stock)
  const { current: currentPrediction, list: predictionList, isLoading: predLoading, error: predError } = useSelector(s => s.prediction)

  const location = useLocation()
  const _stratCfg = location.state?.strategyConfig || null
  const _signalCfg = location.state?.signalConfig || null

  const [ticker,         setTicker]         = useState(_signalCfg?.ticker || _stratCfg?.ticker || searchParams.get('ticker') || '')
  const [inputTicker,    setInputTicker]     = useState(_signalCfg?.ticker || _stratCfg?.ticker || searchParams.get('ticker') || '')
  const [selectedModels, setSelectedModels]  = useState(_signalCfg?.models || _stratCfg?.models || ['prophet', 'arima', 'sma'])
  const [horizon,        setHorizon]         = useState(_signalCfg?.horizon || _stratCfg?.horizon || HORIZON_OPTIONS[3]?.value || 30)
  const [historicalDays, setHistoricalDays]  = useState(_signalCfg?.historicalDays || _stratCfg?.historicalDays || 1825)
  const [preset,         setPreset]          = useState('balanced')
  const [strategyBanner, setStrategyBanner]  = useState(_stratCfg?.strategyName || null)
  const [signalBanner,   setSignalBanner]    = useState(_signalCfg || null)
  const [createStrategyOpen, setCreateStrategyOpen] = useState(false)
  const [activeTab,      setActiveTab]       = useState('chart')

  // Filtros para "Mis Predicciones"
  const [filterTicker,   setFilterTicker]   = useState('')
  const [filterModel,    setFilterModel]    = useState('all')
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState('')

  // Evita que clearPrediction borre una predicción cargada desde historial
  const loadingFromHistory = useRef(false)

  const isFavorite = user?.favorites?.includes(ticker)
  const hasActiveSession = Boolean(isAuthenticated || token || localStorage.getItem('token'))

  const applyPreset = (nextPreset) => {
    setPreset(nextPreset)
    if (nextPreset === 'short') {
      setSelectedModels(['sma', 'arima'])
      setHorizon(7)
      setHistoricalDays(365)
    } else if (nextPreset === 'balanced') {
      setSelectedModels(['prophet', 'arima', 'sma'])
      setHorizon(30)
      setHistoricalDays(1825)
    } else if (nextPreset === 'deep') {
      setSelectedModels(['prophet', 'arima', 'sma'])
      setHorizon(60)
      setHistoricalDays(3650)
    }
  }

  useEffect(() => {
    const incomingSignal = location.state?.signalConfig
    const incomingStrategy = location.state?.strategyConfig
    if (incomingSignal?.ticker) {
      setSignalBanner(incomingSignal)
      setTicker(incomingSignal.ticker)
      setInputTicker(incomingSignal.ticker)
      setSelectedModels(incomingSignal.models || ['prophet', 'arima', 'sma'])
      setHorizon(incomingSignal.horizon || 5)
      setHistoricalDays(incomingSignal.historicalDays || 365)
      setPreset('short')
      setActiveTab('chart')
    } else if (incomingStrategy?.ticker) {
      setTicker(incomingStrategy.ticker)
      setInputTicker(incomingStrategy.ticker)
      setSelectedModels(incomingStrategy.models || ['prophet', 'arima', 'sma'])
      setHorizon(incomingStrategy.horizon || 30)
      setHistoricalDays(incomingStrategy.historicalDays || 1825)
      setStrategyBanner(incomingStrategy.strategyName || null)
      setPreset('balanced')
    }
  }, [location.state])

  // ── Cargar datos de mercado cuando cambia ticker ─────────────────────────
  useEffect(() => {
    if (ticker) {
      if (!loadingFromHistory.current) dispatch(clearPrediction())
      dispatch(fetchStock({ ticker }))
      dispatch(fetchIndicators(ticker))
    }
  }, [ticker]) // eslint-disable-line

  // ── Sincronizar ticker desde URL ─────────────────────────────────────────
  useEffect(() => {
    const t = searchParams.get('ticker')
    if (t && t !== ticker) { setTicker(t); setInputTicker(t) }
  }, [searchParams]) // eslint-disable-line

  // ── Cargar predicción guardada si viene ?group=ID en la URL ──────────────
  useEffect(() => {
    const groupId = parseInt(searchParams.get('group'))
    if (!isNaN(groupId) && groupId > 0) {
      loadingFromHistory.current = true
      dispatch(loadSavedPrediction(groupId))
        .unwrap()
        .then(data => {
          if (data?.ticker) {
            setTicker(data.ticker)
            setInputTicker(data.ticker)
            setActiveTab('prediction')
            setSelectedHistoryGroup(String(groupId))
          }
        })
        .catch(() => toast.error('No se pudo cargar la predicción guardada'))
        .finally(() => { loadingFromHistory.current = false })
    }
  }, []) // eslint-disable-line

  // ── Cargar historial de predicciones si el usuario está autenticado ──────
  useEffect(() => {
    if (user) dispatch(fetchPredictions({ limit: 50 }))
  }, [user]) // eslint-disable-line

  const handleSearch = () => {
    const t = inputTicker.trim().toUpperCase()
    if (t) { setTicker(t); navigate(`/prediction?ticker=${t}`, { replace: true }) }
  }

  const handleModelToggle = (model) => {
    setSelectedModels(prev =>
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
  }

  const handlePredict = useCallback(async () => {
    if (!ticker) return
    if (!selectedModels.length) { toast.warning('Selecciona al menos un modelo'); return }
    if (!hasActiveSession) {
      toast.info('Inicia sesión para guardar y generar predicciones reales.')
      navigate('/login', { state: { from: location } })
      return
    }
    try {
      const generated = await dispatch(createPrediction({ ticker, models: selectedModels, horizon_days: horizon, historical_days: historicalDays })).unwrap()
      setSelectedHistoryGroup(String(generated?.prediction_id || ''))
      toast.success(generated?.portfolio_position ? 'Predicción guardada y enviada a la cartera virtual' : 'Predicción completada y guardada')
      setActiveTab('prediction')
      dispatch(fetchPredictions({ limit: 50 }))
    } catch (err) {
      if (String(err || '').toLowerCase().includes('token')) {
        toast.info('Tu sesión no está activa. Vuelve a iniciar sesión para generar la predicción.')
        navigate('/login', { state: { from: location } })
        return
      }
      toast.error(err || 'Error al generar predicción')
    }
  }, [ticker, selectedModels, horizon, historicalDays, dispatch, hasActiveSession, navigate, location])

  const handleFavorite = async () => {
    if (!user) return
    const favs    = user.favorites || []
    const updated = isFavorite ? favs.filter(f => f !== ticker) : [...favs, ticker]
    try {
      await dispatch(updateProfileThunk({ favorites: updated })).unwrap()
      toast.success(isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos')
    } catch { toast.error('Error al actualizar favoritos') }
  }

  // Predicciones filtradas para la vista de historial
  const predictionSource = predictionList || []
  const filteredPredictions = useMemo(() => {
    if (!predictionSource) return []
    return predictionSource.filter(pred => {
      const tickerMatch = !filterTicker || pred.ticker?.toLowerCase().includes(filterTicker.toLowerCase())
      const modelMatch  = filterModel === 'all' || pred.model === filterModel || pred.model_type === filterModel
      return tickerMatch && modelMatch
    })
  }, [predictionSource, filterTicker, filterModel])

  const getModelLabel = useCallback((pred) => {
    const models = Array.isArray(pred?.models) && pred.models.length ? pred.models : [pred?.model || pred?.model_type]
    const labels = models.filter(Boolean).map(model => (
      model === 'prophet' ? 'Exp. Smoothing'
        : model === 'arima' ? 'ARIMA'
          : model === 'sma' ? 'Media Movil'
            : String(model).toUpperCase()
    ))
    return labels.length > 1 ? `${labels.length} modelos` : labels[0] || '-'
  }, [])

  const loadPredictionFromHistory = useCallback((pred) => {
    if (!pred?.group_id) return
    loadingFromHistory.current = true
    setSelectedHistoryGroup(String(pred.group_id))
    dispatch(loadSavedPrediction(pred.group_id))
      .unwrap()
      .then(data => {
        if (data?.ticker) {
          setTicker(data.ticker)
          setInputTicker(data.ticker)
          setActiveTab('prediction')
          navigate(`/prediction?ticker=${data.ticker}&group=${pred.group_id}`, { replace: true })
        }
      })
      .catch(() => toast.error('No se pudo cargar la prediccion'))
      .finally(() => { loadingFromHistory.current = false })
  }, [dispatch, navigate])

  const stockData        = currentStock?.data || currentStock?.ohlcv || []
  const stockInfo        = currentStock || {}
  const predictions      = currentPrediction?.models || []
  const validPredictions = predictions.filter(m => m.predictions?.length > 0)

  // Compute price change from stock data
  const priceChange = stockData.length >= 2
    ? ((stockData[stockData.length - 1]?.close - stockData[stockData.length - 2]?.close) / stockData[stockData.length - 2]?.close) * 100
    : null

  const QUICK_SECTORS = [
    { label: 'Tecnología', tickers: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'] },
    { label: 'EV / Auto', tickers: ['TSLA', 'RIVN', 'NIO'] },
    { label: 'E-commerce', tickers: ['AMZN', 'SHOP', 'EBAY'] },
    { label: 'Streaming', tickers: ['NFLX', 'DIS', 'SPOT'] },
    { label: 'Finanzas', tickers: ['JPM', 'GS', 'V'] },
  ]
  const activeProfile = PROFILE_INFO[preset] || PROFILE_INFO.balanced

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1400, mx: 'auto' }}>

        {/* ── Banner de estrategia pre-cargada desde marketplace ── */}
        {strategyBanner && (
          <Box sx={{
            mb: 2, p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5,
            background: 'linear-gradient(90deg, rgba(124,58,237,.15), rgba(33,150,243,.1))',
            border: '1px solid rgba(124,58,237,.3)',
          }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#7c3aed', flexShrink: 0 }} />
            <Typography color='#b89eff' fontSize={13} fontWeight={700}>
              Estrategia pre-cargada: «{strategyBanner}»
            </Typography>
            <Typography color='#888' fontSize={12}>
              · Ticker, modelos y horizonte configurados automáticamente. Pulsa «Generar predicción» para ejecutarla.
            </Typography>
            <Box sx={{ ml: 'auto', cursor: 'pointer' }} onClick={() => setStrategyBanner(null)}>
              <Typography color='#555' fontSize={11}>✕</Typography>
            </Box>
          </Box>
        )}

        {/* ── Buscador + filtros rápidos ── */}
        {signalBanner && (
          <Box sx={{
            mb: 2, p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5,
            background: 'linear-gradient(90deg, rgba(34,197,94,.12), rgba(124,58,237,.12))',
            border: '1px solid rgba(34,197,94,.28)',
          }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e', flexShrink: 0 }} />
            <Typography color='#bbf7d0' fontSize={13} fontWeight={800}>
              Señal copiada: {signalBanner.ticker} · score {signalBanner.signalScore || '-'}
            </Typography>
            <Typography color='#888' fontSize={12}>
              Configuración pre-cargada desde Signals. Ajusta modelos, horizonte y entrenamiento antes de generar.
            </Typography>
            <Box sx={{ ml: 'auto', cursor: 'pointer' }} onClick={() => setSignalBanner(null)}>
              <Typography color='#555' fontSize={11}>x</Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, maxWidth: 620 }}>
            <TickerAutocomplete
              value={inputTicker}
              onInputChange={setInputTicker}
              onChange={(symbol) => {
                setInputTicker(symbol)
                setTicker(symbol)
                navigate(`/prediction?ticker=${symbol}`, { replace: true })
              }}
              placeholder="Buscar ticker (ej: AAPL, TSLA, MSFT, NVDA, GOOGL...)"
              size="small"
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  color: '#fff', bgcolor: 'background.paper',
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: '#7c3aed' },
                  '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
                },
                '& input': { py: 1.5 },
              }}
              textFieldProps={{
                onKeyDown: e => e.key === 'Enter' && handleSearch(),
                InputProps: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Button onClick={handleSearch} variant="contained" size="small"
                      sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', minWidth: 80, fontWeight: 700 }}>
                      Analizar
                    </Button>
                  </InputAdornment>
                ),
                },
              }}
            />
          </Box>

          {/* Sectores rápidos */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" color="#555" mr={0.5}>Sectores:</Typography>
            {QUICK_SECTORS.map(sec => (
              <Box key={sec.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip label={sec.label} size="small"
                  sx={{ bgcolor: 'background.paper', color: '#888', border: '1px solid', borderColor: 'divider', fontSize: 11,
                    cursor: 'default', fontWeight: 600 }} />
                {sec.tickers.map(t => (
                  <Chip key={t} label={t} size="small"
                    onClick={() => { setTicker(t); setInputTicker(t); navigate(`/prediction?ticker=${t}`, { replace: true }) }}
                    sx={{
                      bgcolor: ticker === t ? '#7c3aed22' : 'transparent',
                      color: ticker === t ? '#b89eff' : '#555',
                      border: `1px solid ${ticker === t ? '#7c3aed55' : '#2d2d4e'}`,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      '&:hover': { bgcolor: '#7c3aed11', color: '#b89eff' },
                    }} />
                ))}
                <Typography color="#2d2d4e" fontSize={12} mx={0.5}>·</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Estado vacío: mercado en vivo + Mis Predicciones ─────────────── */}
        {!ticker ? (
          <Box>
            {/* Mercado en vivo */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="h5" fontWeight={700} color="text.primary">Mercado en vivo</Typography>
                <Typography variant="body2" color="text.secondary">Últimos 30 días · Haz clic en una empresa para analizarla</Typography>
              </Box>
            </Box>
            <Grid container spacing={2} mb={4}>
              {POPULAR_TICKERS.map(t => (
                <Grid item xs={6} sm={4} md={3} lg={2} key={t}>
                  <TickerCard ticker={t} onNavigate={tk => {
                    setTicker(tk); setInputTicker(tk)
                    navigate(`/prediction?ticker=${tk}`, { replace: true })
                  }} />
                </Grid>
              ))}
            </Grid>

            {/* Tickers rápidos */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
              {POPULAR_TICKERS.map(t => (
                <Chip key={t} label={t}
                  onClick={() => { setTicker(t); setInputTicker(t); navigate(`/prediction?ticker=${t}`, { replace: true }) }}
                  sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700, cursor: 'pointer', '&:hover': { bgcolor: '#2196f344' } }} />
              ))}
            </Box>

            {/* ── Mis Predicciones (sección filtrable) ─────────────────────── */}
            {user && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
                  <History sx={{ color: '#7c3aed', fontSize: 24 }} />
                  <Typography variant="h5" fontWeight={700} color="text.primary">Mis Predicciones</Typography>
                  {predictionSource.length > 0 && (
                    <Chip label={`${filteredPredictions.length} / ${predictionSource.length}`} size="small"
                      sx={{ bgcolor: '#7c3aed22', color: '#b89eff', border: '1px solid #7c3aed44', fontWeight: 700 }} />
                  )}
                </Box>

                {/* Filtros */}
                <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FilterList sx={{ color: 'text.secondary', fontSize: 18 }} />
                    <TextField
                      value={filterTicker}
                      onChange={e => setFilterTicker(e.target.value.toUpperCase())}
                      placeholder="Filtrar por ticker..."
                      size="small"
                      sx={{
                        width: 180,
                        '& .MuiOutlinedInput-root': {
                          color: 'text.primary', bgcolor: 'background.default',
                          '& fieldset': { borderColor: 'divider' },
                          '&:hover fieldset': { borderColor: '#7c3aed' },
                          '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
                        },
                        '& input': { py: 1 },
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.disabled', fontSize: 16 }} /></InputAdornment>,
                      }}
                    />
                    <Select
                      value={filterModel}
                      onChange={e => setFilterModel(e.target.value)}
                      size="small"
                      sx={{
                        color: 'text.primary', bgcolor: 'background.default',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#7c3aed' },
                        '& .MuiSvgIcon-root': { color: 'text.secondary' },
                        minWidth: 160,
                      }}
                      MenuProps={{ PaperProps: { sx: { bgcolor: 'background.paper', color: 'text.primary' } } }}
                    >
                      <MenuItem value="all">Todos los modelos</MenuItem>
                      <MenuItem value="prophet">Exp. Smoothing</MenuItem>
                      <MenuItem value="arima">ARIMA</MenuItem>
                      <MenuItem value="sma">Media Móvil</MenuItem>
                    </Select>
                    {(filterTicker || filterModel !== 'all') && (
                      <Button size="small" onClick={() => { setFilterTicker(''); setFilterModel('all') }}
                        sx={{ color: 'text.secondary', textTransform: 'none', fontSize: 12 }}>
                        Limpiar filtros
                      </Button>
                    )}
                  </Box>
                </Paper>

                {/* Tabla de predicciones */}
                {predLoading ? (
                  <Box textAlign="center" py={4}><CircularProgress size={28} /></Box>
                ) : predictionSource.length === 0 ? (
                  <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 6, textAlign: 'center' }}>
                    <History sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography color="text.secondary" mb={1}>Aún no tienes predicciones guardadas</Typography>
                    <Typography variant="body2" color="text.disabled">Busca un ticker arriba y genera tu primera predicción con IA</Typography>
                  </Paper>
                ) : filteredPredictions.length === 0 ? (
                  <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No hay predicciones que coincidan con los filtros</Typography>
                  </Paper>
                ) : (
                  <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ '& th': { color: 'text.secondary', fontSize: 12, borderColor: 'divider', bgcolor: 'background.default', fontWeight: 700 } }}>
                            <TableCell>Ticker</TableCell>
                            <TableCell>Modelo</TableCell>
                            <TableCell>Horizonte</TableCell>
                            <TableCell>Predicción inicial</TableCell>
                            <TableCell>Tendencia</TableCell>
                            <TableCell>Fecha</TableCell>
                            <TableCell align="right"></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredPredictions.map((pred, i) => {
                            const isUp = pred.trend === 'up'
                            const trendColor = isUp ? '#4caf50' : '#f44336'
                            const modelLabel = pred.model === 'prophet' ? 'Exp. Smoothing'
                              : pred.model === 'arima' ? 'ARIMA'
                              : pred.model === 'sma'   ? 'Media Móvil'
                              : pred.model || pred.model_type || '—'
                            const dateStr = pred.created_at
                              ? new Date(pred.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
                              : '—'
                            return (
                              <TableRow key={pred.id || i} hover sx={{ cursor: 'pointer', '& td': { borderColor: 'divider', color: 'text.primary' }, '&:hover': { bgcolor: 'action.hover' } }}
                                onClick={() => {
                                  loadingFromHistory.current = true
                                  setSelectedHistoryGroup(String(pred.group_id || ''))
                                  if (pred.is_demo) {
                                    setTicker(pred.ticker); setInputTicker(pred.ticker)
                                    setActiveTab('prediction')
                                    navigate(`/prediction?ticker=${pred.ticker}`, { replace: true })
                                    loadingFromHistory.current = false
                                    return
                                  }
                                  dispatch(loadSavedPrediction(pred.group_id))
                                    .unwrap()
                                    .then(data => {
                                      if (data?.ticker) {
                                        setTicker(data.ticker); setInputTicker(data.ticker)
                                        setActiveTab('prediction')
                                        navigate(`/prediction?ticker=${data.ticker}&group=${pred.group_id}`, { replace: true })
                                      }
                                    })
                                    .catch(() => toast.error('No se pudo cargar la predicción'))
                                    .finally(() => { loadingFromHistory.current = false })
                                }}>
                                <TableCell>
                                  <Chip label={pred.ticker} size="small"
                                    sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 800, fontSize: 11 }} />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="text.secondary">{modelLabel}</Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip label={`${pred.horizon || pred.horizon_days || '—'}d`} size="small"
                                    sx={{ bgcolor: '#7c3aed22', color: '#b89eff', fontSize: 10 }} />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600} color="text.primary">
                                    {pred.first_prediction != null ? `$${Number(pred.first_prediction).toFixed(2)}` : '—'}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {isUp
                                      ? <TrendingUp sx={{ fontSize: 14, color: trendColor }} />
                                      : <TrendingDown sx={{ fontSize: 14, color: trendColor }} />}
                                    <Typography variant="caption" sx={{ color: trendColor, fontWeight: 700 }}>
                                      {isUp ? 'Alcista' : 'Bajista'}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="text.disabled">{dateStr}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip title="Cargar predicción">
                                    <IconButton size="small" sx={{ color: '#7c3aed' }}>
                                      <PlayArrow fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </Box>
                  </Paper>
                )}
              </Box>
            )}
          </Box>
        ) : stockLoading ? (
          <LoadingSpinner message="Cargando datos del mercado..." />
        ) : (
          /* ── Vista de análisis ────────────────────────────────────────────── */
          <Grid container spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>

            {/* ── Panel izquierdo ───────────────────────────────────────────── */}
            <Grid item xs={12} lg={9} sx={{ minWidth: 0 }}>

              {/* Cabecera del ticker */}
              <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 1.25, sm: 2 }, mb: 2, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 1.25, sm: 2 }, flexWrap: 'wrap', minWidth: 0 }}>
                  <Chip label={ticker}
                    sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 800, fontSize: { xs: 14, sm: 17 }, height: 34, px: 1 }} />
                  <Box sx={{ minWidth: 0, flex: { xs: '1 1 180px', sm: '0 1 auto' } }}>
                    <Typography variant="h6" fontWeight={700} color="#fff" lineHeight={1.2} sx={{ fontSize: { xs: 17, sm: 20 }, overflowWrap: 'anywhere' }}>{stockInfo.name || ticker}</Typography>
                    <Typography variant="caption" color="#888">{stockInfo.currency || 'USD'} · {stockInfo.exchange || 'NASDAQ'}</Typography>
                  </Box>

                  {/* Price + change */}
                  {stockInfo.last_price && (
                    <Box sx={{ ml: { xs: 0, sm: 2 }, minWidth: { xs: '100%', sm: 'auto' } }}>
                      <Typography variant="h5" fontWeight={800} color="#fff" lineHeight={1}>
                        ${Number(stockInfo.last_price).toFixed(2)}
                      </Typography>
                      {priceChange !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                          {priceChange >= 0
                            ? <TrendingUp sx={{ fontSize: 14, color: '#4caf50' }} />
                            : <TrendingDown sx={{ fontSize: 14, color: '#f44336' }} />}
                          <Typography variant="caption" sx={{ color: priceChange >= 0 ? '#4caf50' : '#f44336', fontWeight: 700 }}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}% hoy
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Extra info chips */}
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: { xs: 0, sm: 'auto' }, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
                    {stockData.length > 0 && (
                      <>
                        <Tooltip title="Datos históricos disponibles">
                          <Chip icon={<BarChart sx={{ fontSize: 13 }} />}
                            label={`${stockData.length} días`} size="small"
                            sx={{ bgcolor: '#2d2d4e', color: '#888', fontSize: 11 }} />
                        </Tooltip>
                        <Tooltip title="Indicadores técnicos">
                          <Chip icon={<Speed sx={{ fontSize: 13 }} />}
                            label="Indicadores" size="small"
                            onClick={() => setActiveTab('indicators')}
                            sx={{ bgcolor: '#2d2d4e', color: '#888', fontSize: 11, cursor: 'pointer',
                              '&:hover': { bgcolor: '#3d3d5e', color: '#fff' } }} />
                        </Tooltip>
                      </>
                    )}
                    {currentPrediction?.from_history && (
                      <Chip label="Historial" size="small"
                        sx={{ bgcolor: '#ff980022', color: '#ff9800', border: '1px solid #ff980044', fontSize: 11 }} />
                    )}
                    {user && (
                      <Tooltip title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
                        <IconButton onClick={handleFavorite} size="small" sx={{ color: isFavorite ? '#ff9800' : '#555' }}>
                          {isFavorite ? <Star /> : <StarBorder />}
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </Paper>

              {/* Tabs */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  mb: 2,
                  flexWrap: { xs: 'nowrap', sm: 'wrap' },
                  overflowX: { xs: 'auto', sm: 'visible' },
                  pb: { xs: 0.5, sm: 0 },
                  scrollbarWidth: 'thin',
                }}
              >
                {['chart', 'prediction', 'indicators'].map(tab => (
                  <Chip key={tab}
                    label={{ chart: 'Gráfico', prediction: 'Predicción', indicators: 'Indicadores' }[tab]}
                    onClick={() => setActiveTab(tab)}
                    sx={{
                      bgcolor: activeTab === tab ? '#7c3aed' : '#1e1e3a',
                      color: activeTab === tab ? '#fff' : '#888',
                      border: '1px solid',
                      borderColor: activeTab === tab ? '#7c3aed' : '#2d2d4e',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }} />
                ))}
              </Box>

              {/* Área de gráfico/predicción/indicadores */}
              <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 1, sm: 2 }, mb: 2, overflow: 'hidden', minWidth: 0 }}>
                {activeTab === 'chart' && (
                  stockData.length
                    ? <StockChart data={stockData} ticker={ticker} />
                    : <Box py={6} textAlign="center"><Typography color="#555">Sin datos OHLCV disponibles</Typography></Box>
                )}
                {activeTab === 'prediction' && (
                  predLoading
                    ? <Box py={6} textAlign="center"><CircularProgress /></Box>
                    : validPredictions.length
                      ? <PredictionComparison historicalData={stockData} predictionData={currentPrediction} />
                      : currentPrediction
                        ? (
                          <Box py={6} textAlign="center">
                            <Typography color="#f44336" mb={1}>No hay datos de predicción disponibles</Typography>
                            <Typography color="#888" variant="body2">Revisa las tarjetas de modelos abajo.</Typography>
                          </Box>
                        )
                        : (
                          <Box py={6} textAlign="center">
                            <Typography color="#555" mb={2}>
                              Configura los parámetros y pulsa <b style={{ color: '#b89eff' }}>Generar predicción</b>
                            </Typography>
                          </Box>
                        )
                )}
                {activeTab === 'indicators' && (
                  indicators
                    ? <IndicatorsPanel indicators={indicators} />
                    : (
                      <Box py={6} textAlign="center">
                        <Typography color="#9ca3af" mb={0.75}>No hay indicadores disponibles todavía.</Typography>
                        <Typography color="#6b7280" variant="body2">
                          Prueba de nuevo en unos segundos o selecciona otro ticker con más histórico.
                        </Typography>
                      </Box>
                    )
                )}
              </Paper>

              {currentPrediction && stockInfo.last_price && (
                <PredictionProgressPanel
                  prediction={currentPrediction}
                  currentPrice={Number(stockInfo.last_price)}
                  lastUpdate={stockInfo.last_update || stockInfo.updated_at}
                />
              )}

              {/* Tarjetas de modelos */}
              {predictions.length > 0 && (
                <>
                  <TechnicalSummary consensus={currentPrediction?.consensus} disclaimer={currentPrediction?.disclaimer} />
                  <Grid container spacing={2} mt={1}>
                    {predictions.map(pred => (
                      <Grid item xs={12} sm={4} key={pred.name || pred.id}>
                        <PredictionCard model={pred} />
                      </Grid>
                    ))}
                  </Grid>
                </>
              )}

              {predError && (
                <Alert severity="error" sx={{ mt: 2, bgcolor: '#2d1515', color: '#f44336' }}>
                  {predError}
                </Alert>
              )}
            </Grid>

            {/* ── Panel derecho ──────────────────────────────────────────────── */}
            <Grid item xs={12} lg={3} sx={{ minWidth: 0 }}>

              {/* Configurar predicción */}
              <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, mb: 2 }}>
                <Typography fontWeight={700} color="#fff" mb={2}>Configurar predicción</Typography>

                <Typography variant="caption" color="#888" mb={1} display="block">Perfil de predicción</Typography>
                <ToggleButtonGroup value={preset} exclusive onChange={(_, v) => v && applyPreset(v)}
                  size="small" sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1.3 }}>
                  {PROFILE_OPTIONS.map(p => (
                    <ToggleButton key={p.value} value={p.value} sx={{
                      color: '#888',
                      border: '1px solid #2d2d4e !important',
                      borderRadius: '8px !important',
                      textTransform: 'none',
                      fontSize: 12,
                      '&.Mui-selected': { bgcolor: '#7c3aed22 !important', color: '#b89eff', borderColor: '#7c3aed !important' },
                    }}>
                      {p.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Box sx={{ mb: 2.5, p: 1.4, borderRadius: 2, bgcolor: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.22)' }}>
                  <Typography color="#d8b4fe" fontWeight={900} fontSize={13}>{activeProfile.summary}</Typography>
                  <Typography color="#8b8fa3" fontSize={12.5} mt={0.4}>{activeProfile.description}</Typography>
                </Box>

                <Typography variant="caption" color="#888" mb={0.6} display="block">Modelos de predicción</Typography>
                <Typography variant="caption" color="#666" display="block" sx={{ mb: 1.2, lineHeight: 1.5 }}>
                  No es IA generativa: son modelos de series temporales entrenados con precios históricos. El resultado final usa consenso entre modelos.
                </Typography>
                <FormGroup sx={{ mb: 1.1 }}>
                  {MODEL_OPTIONS.map(m => (
                    <FormControlLabel key={m} control={
                      <Checkbox checked={selectedModels.includes(m)} onChange={() => handleModelToggle(m)}
                        size="small" sx={{ color: '#555', '&.Mui-checked': { color: '#7c3aed' } }} />
                    } label={
                      <Typography variant="body2" color="#ccc" sx={{ textTransform: 'capitalize' }}>
                        {m === 'prophet' ? 'Exp. Smoothing' : m === 'arima' ? 'ARIMA' : 'Media Móvil'}
                      </Typography>
                    } />
                  ))}
                </FormGroup>
                <Box sx={{ mb: 2.5, display: 'flex', flexDirection: 'column', gap: .65 }}>
                  {selectedModels.map(m => (
                    <Typography key={m} variant="caption" color="#666" sx={{ lineHeight: 1.45 }}>
                      <Box component="span" sx={{ color: '#aaa', fontWeight: 800 }}>
                        {m === 'prophet' ? 'Exp. Smoothing' : m === 'arima' ? 'ARIMA' : 'Media Móvil'}:
                      </Box>{' '}
                      {MODEL_HELP[m]}
                    </Typography>
                  ))}
                </Box>

                <Typography variant="caption" color="#888" mb={1} display="block">Horizonte de predicción</Typography>
                <ToggleButtonGroup value={horizon} exclusive onChange={(_, v) => v != null && setHorizon(v)}
                  size="small" sx={{ flexWrap: 'wrap', gap: 0.5, mb: 3 }}>
                  {HORIZON_OPTIONS.map(h => (
                    <ToggleButton key={h.value} value={h.value} sx={{
                      color: '#888',
                      border: '1px solid #2d2d4e !important',
                      borderRadius: '6px !important',
                      '&.Mui-selected': { bgcolor: '#7c3aed22 !important', color: '#b89eff', borderColor: '#7c3aed !important' },
                    }}>
                      {h.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .8 }}>
                    <Typography variant="caption" color="#888" fontWeight={700}>Horizonte exacto</Typography>
                    <Typography variant="caption" color="#fff" fontWeight={900}>{horizon} días</Typography>
                  </Box>
                  <Slider
                    value={horizon}
                    min={1}
                    max={60}
                    step={1}
                    onChange={(_, value) => setHorizon(value)}
                    valueLabelDisplay="auto"
                    sx={{ color: '#8b5cf6' }}
                  />
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .8 }}>
                    <Typography variant="caption" color="#888" fontWeight={700}>Ventana de entrenamiento</Typography>
                    <Typography variant="caption" color="#fff" fontWeight={900}>{historicalDays} días</Typography>
                  </Box>
                  <Slider
                    value={historicalDays}
                    min={90}
                    max={3650}
                    step={30}
                    onChange={(_, value) => setHistoricalDays(value)}
                    valueLabelDisplay="auto"
                    sx={{ color: '#38bdf8' }}
                  />
                  <Typography variant="caption" color="#666">
                    Más días = modelo más estable; menos días = más sensible a mercado reciente.
                  </Typography>
                </Box>

                {!hasActiveSession && (
                  <Alert severity="info" sx={{ mb: 2, bgcolor: '#172033', color: '#bfdbfe', border: '1px solid #2563eb55' }}>
                    Inicia sesión para generar predicciones y guardarlas en tu historial.
                  </Alert>
                )}

                <Button variant="contained" fullWidth onClick={handlePredict}
                  disabled={predLoading || !ticker || !selectedModels.length}
                  sx={{ py: 1.5, background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, fontSize: 15 }}>
                  {predLoading ? <CircularProgress size={22} color="inherit" /> : hasActiveSession ? 'Generar predicción' : 'Iniciar sesión para generar'}
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Publish />}
                  onClick={() => setCreateStrategyOpen(true)}
                  disabled={!user || !ticker || !selectedModels.length}
                  sx={{ mt: 1, borderColor: '#7c3aed66', color: '#c4b5fd', fontWeight: 800 }}
                >
                  Guardar como estrategia
                </Button>

                {stockInfo.last_price && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #2d2d4e' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="caption" color="#888" display="block">Precio actual</Typography>
                        <Typography variant="h5" fontWeight={700} color="#fff">
                          ${Number(stockInfo.last_price).toFixed(2)}
                        </Typography>
                        <Typography variant="caption" color="#555">{stockInfo.name || '—'}</Typography>
                      </Box>
                      {priceChange !== null && (
                        <Chip
                          label={`${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`}
                          size="small"
                          icon={priceChange >= 0 ? <TrendingUp sx={{ fontSize: 12 }} /> : <TrendingDown sx={{ fontSize: 12 }} />}
                          sx={{
                            bgcolor: priceChange >= 0 ? '#4caf5022' : '#f4433622',
                            color: priceChange >= 0 ? '#4caf50' : '#f44336',
                            border: `1px solid ${priceChange >= 0 ? '#4caf5044' : '#f4433644'}`,
                            fontWeight: 700, fontSize: 11,
                          }}
                        />
                      )}
                    </Box>
                    {stockData.length > 0 && (
                      <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip icon={<CalendarToday sx={{ fontSize: 11 }} />}
                          label={`${stockData.length} días datos`} size="small"
                          sx={{ bgcolor: 'background.default', color: '#555', fontSize: 10, height: 22 }} />
                        {stockInfo.sector && (
                          <Chip label={stockInfo.sector} size="small"
                            sx={{ bgcolor: 'background.default', color: '#555', fontSize: 10, height: 22 }} />
                        )}
                      </Box>
                    )}
                  </Box>
                )}
              </Paper>

              {/* Historial de predicciones guardadas */}
              {user && predictionSource.length > 0 && (
                <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <History sx={{ color: '#7c3aed', fontSize: 18 }} />
                    <Typography fontWeight={700} color="#fff" fontSize={14}>Mis predicciones</Typography>
                    <Typography variant="caption" color="#555" ml="auto">{predictionSource.length} guardadas</Typography>
                  </Box>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Cargar prediccion guardada"
                    value={selectedHistoryGroup}
                    onChange={(event) => {
                      const pred = predictionSource.find(item => String(item.group_id) === String(event.target.value))
                      if (pred) loadPredictionFromHistory(pred)
                    }}
                    sx={{
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        color: '#fff',
                        bgcolor: 'rgba(255,255,255,.035)',
                        '& fieldset': { borderColor: '#2d2d4e' },
                        '&:hover fieldset': { borderColor: '#7c3aed' },
                      },
                    }}
                    SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper', color: 'text.primary' } } } }}
                  >
                    <MenuItem value="">Selecciona una prediccion</MenuItem>
                    {predictionSource.map(pred => (
                      <MenuItem key={pred.group_id} value={String(pred.group_id)}>
                        {pred.ticker} - {getModelLabel(pred)} - {pred.horizon || pred.horizon_days || '-'}d
                      </MenuItem>
                    ))}
                  </TextField>
                  {currentPrediction && (
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2, bgcolor: 'rgba(124,58,237,.06)', borderColor: 'rgba(124,58,237,.22)' }}>
                      <Typography fontWeight={900} color="#fff" fontSize={13}>
                        Resumen cargado: {currentPrediction.ticker}
                      </Typography>
                      <Typography variant="caption" color="#9ca3af" display="block">
                        Horizonte {currentPrediction.horizon_days || horizon} dias - {currentPrediction.models?.length || 0} modelos ML
                      </Typography>
                      {currentPrediction.consensus?.average_prediction && (
                        <Typography variant="caption" color="#c4b5fd" display="block">
                          Objetivo consenso: ${Number(currentPrediction.consensus.average_prediction).toFixed(2)}
                        </Typography>
                      )}
                    </Paper>
                  )}
                  {predictionSource.map((pred, i) => {
                    const isUp = pred.trend === 'up'
                    const color = isUp ? '#4caf50' : '#f44336'
                    const isActive = String(currentPrediction?.prediction_id || currentPrediction?.group_id || '') === String(pred.group_id || '')
                    return (
                      <Box key={pred.id || i}>
                        {i > 0 && <Divider sx={{ borderColor: 'divider', my: 0.8 }} />}
                        <Box
                          onClick={() => {
                            // Load prediction inline — dispatch directly instead of navigating
                            loadingFromHistory.current = true
                            setSelectedHistoryGroup(String(pred.group_id || ''))
                            if (pred.is_demo) {
                              setTicker(pred.ticker)
                              setInputTicker(pred.ticker)
                              setActiveTab('prediction')
                              navigate(`/prediction?ticker=${pred.ticker}`, { replace: true })
                              loadingFromHistory.current = false
                              return
                            }
                            dispatch(loadSavedPrediction(pred.group_id))
                              .unwrap()
                              .then(data => {
                                if (data?.ticker) {
                                  setTicker(data.ticker)
                                  setInputTicker(data.ticker)
                                  setActiveTab('prediction')
                                  navigate(`/prediction?ticker=${data.ticker}&group=${pred.group_id}`, { replace: true })
                                }
                              })
                              .catch(() => toast.error('No se pudo cargar la prediccion'))
                              .finally(() => { loadingFromHistory.current = false })
                          }}
                          sx={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            py: 1.2, px: 1, borderRadius: 1.5, cursor: 'pointer',
                            bgcolor: isActive ? '#7c3aed18' : 'transparent',
                            border: isActive ? '1px solid #7c3aed44' : '1px solid transparent',
                            transition: 'all .15s',
                            '&:hover': { bgcolor: '#7c3aed12' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Chip
                              label={pred.ticker}
                              size="small"
                              sx={{
                                bgcolor: isActive ? '#7c3aed33' : '#7c3aed22',
                                color: '#b89eff', fontWeight: 700, fontSize: 10, height: 20,
                                flexShrink: 0,
                              }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="#888" display="block" noWrap>
                                {getModelLabel(pred)} &middot; {pred.horizon || pred.horizon_days || '-'}d
                              </Typography>
                              {pred.first_prediction && (
                                <Typography variant="caption" fontWeight={700}
                                  sx={{ color: pred.trend === 'up' ? '#4caf50' : '#f44336', display: 'block' }}>
                                  {pred.trend === 'up' ? '▲' : '▼'} ${Number(pred.first_prediction).toFixed(2)}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          {pred.is_demo && (
                            <Chip label="ejemplo" size="small"
                              sx={{ bgcolor: '#ff980018', color: '#ff9800', fontSize: 9, height: 16, flexShrink: 0 }} />
                          )}
                        </Box>
                      </Box>
                    )
                  })}
                </Paper>
              )}
            </Grid>
          </Grid>
        )}
      </Box>

      <CreateStrategyModal
        open={createStrategyOpen}
        onClose={() => setCreateStrategyOpen(false)}
        onCreated={() => dispatch(fetchPredictions({ limit: 10 }))}
        initialData={{
          ticker,
          name: ticker ? `Prediccion ML ${ticker}` : '',
          models: selectedModels,
          horizon,
          historicalDays,
          mode: 'private',
          marketplace: false,
          minScore: signalBanner?.signalScore || 60,
          category: signalBanner?.signalType === 'sell' ? 'contrarian' : 'momentum',
          description: signalBanner?.signalReason
            ? `Prediccion creada desde una senal real: ${signalBanner.signalReason}`
            : `Prediccion creada desde MyPredicts con modelos ${selectedModels.join(', ')} y horizonte de ${horizon} dias.`,
        }}
      />
    </Box>
  )
}
