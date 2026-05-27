import { useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Box, Typography, Grid, Paper, Button, TextField, Chip,
  FormGroup, FormControlLabel, Checkbox, CircularProgress,
  Table, TableRow, TableCell, TableBody, Alert, Divider,
  Tab, Tabs, Slider,
} from '@mui/material'
import {
  PlayArrow, BarChart, TrendingUp, QueryStats, EmojiEvents,
  Verified,
} from '@mui/icons-material'
import { backtestService } from '@/services/backtestService'
import EquityCurve from '@/components/charts/EquityCurve'
import PredVsActualChart from '@/components/backtest/PredVsActualChart'
import AccuracyMetricsPanel from '@/components/backtest/AccuracyMetricsPanel'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'
import { formatCurrency, formatPercent } from '@/utils/formatters'
import { VALID_MODELS } from '@/utils/constants'
import { toast } from 'react-toastify'

const MODEL_OPTIONS  = VALID_MODELS || ['prophet', 'arima', 'sma']
const MODEL_LABELS   = { prophet: 'Exp. Smoothing', arima: 'ARIMA', sma: 'Media Móvil' }
const MODEL_COLORS   = { prophet: '#7c3aed', arima: '#2196f3', sma: '#4caf50' }
const MODEL_BG       = { prophet: '#7c3aed22', arima: '#2196f322', sma: '#4caf5022' }

// dechever - 19/03/2026: preparé la vista del backtesting con fechas, capital y selección de modelo.

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff', bgcolor: 'background.default',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: '#7c3aed' },
    '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
  },
  '& label': { color: '#888' },
  '& input[type="date"]::-webkit-calendar-picker-indicator': { filter: 'invert(0.5)' },
}

function MetricRow({ label, value, isPercent, isNumber, isPositiveGood = true }) {
  let display = value
  let color   = '#ccc'
  if (isPercent && value != null) {
    display = formatPercent(value)
    color   = isPositiveGood ? (value >= 0 ? '#4caf50' : '#f44336') : (value <= 0 ? '#4caf50' : '#f44336')
  } else if (isNumber && value != null) {
    display = value.toFixed(2)
    color   = value >= 0 ? '#4caf50' : '#f44336'
  }
  return (
    <TableRow sx={{ '& td': { borderColor: '#2d2d4e22', py: 0.8, px: 1 } }}>
      <TableCell sx={{ color: '#777', fontSize: 12 }}>{label}</TableCell>
      <TableCell sx={{ color, fontWeight: 700, fontSize: 12, textAlign: 'right' }}>{display ?? '—'}</TableCell>
    </TableRow>
  )
}

// ── Tarjeta de resultados por modelo ─────────────────────────────────────────
// dechever - 26/03/2026: maqueté los resultados del backtest para que se entendieran rápido al revisar una simulación.
function ModelCard({ r }) {
  const color = MODEL_COLORS[r.model] || '#7c3aed'
  const ret   = r.total_return || 0
  return (
    <Paper sx={{
      bgcolor: 'background.paper', border: `1px solid ${color}33`, borderRadius: 2.5, p: 2.5,
      borderTop: `3px solid ${color}`, height: '100%',
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Chip label={MODEL_LABELS[r.model] || r.model} size="small"
          sx={{ bgcolor: MODEL_BG[r.model] || '#7c3aed22', color, fontWeight: 700, fontSize: 11 }} />
        <Typography variant="h5" fontWeight={900}
          sx={{ color: ret >= 0 ? '#4caf50' : '#f44336' }}>
          {formatPercent(ret)}
        </Typography>
      </Box>
      <Table size="small">
        <TableBody>
          <MetricRow label="Sharpe Ratio"     value={r.sharpe_ratio}    isNumber />
          <MetricRow label="Sortino Ratio"    value={r.sortino_ratio}   isNumber />
          <MetricRow label="Máx. Drawdown"    value={r.max_drawdown}    isPercent isPositiveGood={false} />
          <MetricRow label="Win Rate"         value={r.win_rate}        isPercent />
          <MetricRow label="Factor beneficio" value={r.profit_factor}   isNumber />
          <MetricRow label="Operaciones"      value={r.num_trades} />
          <MetricRow label="Capital final"    value={r.final_capital != null ? formatCurrency(r.final_capital) : null} />
        </TableBody>
      </Table>
    </Paper>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function BacktestPage() {
  useSelector(s => s.auth) // keep subscription

  const [form, setForm] = useState({
    ticker:          '',
    start_date:      '2022-01-01',
    end_date:        new Date().toISOString().slice(0, 10),
    initial_capital: 10000,
    position_size_percent: 100,
    models:          ['prophet', 'arima', 'sma'],
  })
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState(0)   // 0=Rendimiento, 1=Credibilidad

  const handleModelToggle = (m) =>
    setForm(f => ({
      ...f,
      models: f.models.includes(m) ? f.models.filter(x => x !== m) : [...f.models, m],
    }))

  const handleRun = async () => {
    if (!form.ticker.trim()) { toast.warning('Introduce un ticker'); return }
    if (!form.models.length) { toast.warning('Selecciona al menos un modelo'); return }
    setLoading(true); setError(''); setResults(null); setTab(0)
    try {
      const data = await backtestService.run({ ...form, ticker: form.ticker.toUpperCase() })
      const model_results = Object.entries(data.results || {})
        .filter(([, v]) => !v.error)
        .map(([model, metrics]) => ({ model, ...metrics }))
      setResults({
        ...data,
        model_results,
        best_model:   data.comparison?.best_model || null,
        // data.results keeps accuracy_metrics per model intact
      })
      toast.success('Backtesting completado')
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al ejecutar backtesting'
      setError(msg); toast.error(msg)
    } finally { setLoading(false) }
  }

  const activeModels = results?.model_results?.map(r => r.model) || []

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1340, mx: 'auto' }}>

        {/* Cabecera */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={900} color="#fff" mb={0.5}>Backtesting</Typography>
          <Typography color="#888">Simula estrategias con datos históricos reales y analiza la credibilidad de cada modelo</Typography>
        </Box>

        <Grid container spacing={3}>

          {/* ── Panel de configuración ── */}
          <Grid item xs={12} md={4} lg={3}>
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 3, position: 'sticky', top: 80 }}>
              <Typography fontWeight={700} color="#fff" mb={2.5} fontSize={15}>Parámetros</Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TickerAutocomplete
                  label="Ticker" value={form.ticker} size="small" fullWidth sx={fieldSx}
                  onInputChange={ticker => setForm(f => ({ ...f, ticker }))}
                  onChange={ticker => setForm(f => ({ ...f, ticker }))}
                  placeholder="AAPL, TSLA, MSFT..."
                />
                <TextField
                  label="Fecha inicio" type="date" value={form.start_date} size="small" fullWidth sx={fieldSx}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Fecha fin" type="date" value={form.end_date} size="small" fullWidth sx={fieldSx}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .8 }}>
                    <Typography variant="caption" color="#888" fontWeight={700}>CAPITAL INICIAL</Typography>
                    <Typography variant="caption" color="#fff" fontWeight={900}>{formatCurrency(form.initial_capital)}</Typography>
                  </Box>
                  <Slider
                    value={form.initial_capital}
                    min={100}
                    max={100000}
                    step={100}
                    onChange={(_, value) => setForm(f => ({ ...f, initial_capital: value }))}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => formatCurrency(value)}
                    sx={{ color: '#8b5cf6' }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="#555">$100</Typography>
                    <Typography variant="caption" color="#555">$100k</Typography>
                  </Box>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .8 }}>
                    <Typography variant="caption" color="#888" fontWeight={700}>TAMAÑO POSICIÓN</Typography>
                    <Typography variant="caption" color="#fff" fontWeight={900}>{form.position_size_percent}%</Typography>
                  </Box>
                  <Slider value={form.position_size_percent} min={1} max={100} step={1}
                    onChange={(_, value) => setForm(f => ({ ...f, position_size_percent: value }))}
                    valueLabelDisplay="auto"
                    sx={{ color: '#38bdf8' }}
                  />
                  <Typography variant="caption" color="#666" display="block" sx={{ mt: .5, lineHeight: 1.55 }}>
                    Porcentaje del capital que se usa en cada entrada simulada. 100% usa todo el capital disponible;
                    25% prueba una entrada más conservadora.
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="#888" mb={1} display="block" fontWeight={600}>
                    MODELOS A COMPARAR
                  </Typography>
                  <Typography variant="caption" color="#666" display="block" sx={{ mb: 1.1, lineHeight: 1.5 }}>
                    El backtest entrena cada modelo con datos anteriores a cada día simulado y compara cuál habría funcionado mejor.
                  </Typography>
                  <FormGroup>
                    {MODEL_OPTIONS.map(m => (
                      <FormControlLabel key={m}
                        control={
                          <Checkbox
                            checked={form.models.includes(m)}
                            onChange={() => handleModelToggle(m)}
                            size="small"
                            sx={{ color: MODEL_COLORS[m] || '#555', '&.Mui-checked': { color: MODEL_COLORS[m] || '#7c3aed' } }}
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: MODEL_COLORS[m] || '#aaa' }} />
                            <Typography variant="body2" color="#ccc" fontSize={13}>
                              {MODEL_LABELS[m] || m}
                            </Typography>
                          </Box>
                        }
                      />
                    ))}
                  </FormGroup>
                </Box>

                <Button
                  variant="contained" fullWidth onClick={handleRun}
                  disabled={loading || !form.ticker.trim() || !form.models.length}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                  sx={{ py: 1.5, background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, fontSize: 14, mt: 1 }}
                >
                  {loading ? 'Ejecutando...' : 'Ejecutar backtest'}
                </Button>
              </Box>

              {/* Leyenda de modelos */}
              {results && (
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #2d2d4e' }}>
                  <Typography variant="caption" color="#555" display="block" mb={1}>Modelos ejecutados</Typography>
                  {activeModels.map(m => (
                    <Box key={m} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.6 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: MODEL_COLORS[m] }} />
                      <Typography fontSize={12} color="#888">{MODEL_LABELS[m] || m}</Typography>
                    </Box>
                  ))}
                  <Typography variant="caption" color="#555" mt={1} display="block">
                    {results.period}
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* ── Resultados ── */}
          <Grid item xs={12} md={8} lg={9}>

            {/* Estado vacío */}
            {!results && !loading && !error && (
              <Box sx={{ textAlign: 'center', py: 16, color: '#555' }}>
                <BarChart sx={{ fontSize: 80, mb: 2, opacity: 0.2 }} />
                <Typography variant="h5" fontWeight={700} color="#666" mb={1}>
                  Configura y ejecuta un backtest
                </Typography>
                <Typography variant="body2" color="#555" mb={3}>
                  Compara Exp. Smoothing, ARIMA y Media Móvil sobre datos históricos reales
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {['Curva de capital', 'Predicción vs Real', 'MAE · RMSE · MAPE', 'Dir. Accuracy'].map(f => (
                    <Chip key={f} label={f} sx={{ bgcolor: 'background.paper', color: '#666', border: '1px solid', borderColor: 'divider' }} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Cargando */}
            {loading && (
              <Box textAlign="center" py={16}>
                <CircularProgress size={52} sx={{ color: '#7c3aed', mb: 2 }} />
                <Typography color="#888" fontWeight={600}>Preparando datos históricos y ejecutando simulación...</Typography>
                <Typography variant="caption" color="#555" mt={1} display="block">
                  Si faltan precios del ticker, MyPredicts los descarga antes de lanzar el backtest. Puede tardar 15-40 s.
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ bgcolor: '#2d1515', color: '#f44336', mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {results && (
              <Box>
                {/* ── Summary header ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={results.ticker || form.ticker}
                    sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 800, fontSize: 16, height: 34 }}
                  />
                  <Typography color="#888" variant="body2">{form.start_date} → {form.end_date}</Typography>
                  <Chip label={`Capital: ${formatCurrency(form.initial_capital)}`} size="small"
                    sx={{ bgcolor: '#2d2d4e', color: '#ccc' }} />
                  <Chip label={`${results.model_results?.length} modelos`} size="small"
                    sx={{ bgcolor: '#2d2d4e', color: '#ccc' }} />
                  {results.metadata?.computation_time_seconds && (
                    <Chip
                      label={`⚡ ${results.metadata.computation_time_seconds}s`}
                      size="small"
                      sx={{ bgcolor: '#7c3aed22', color: '#b89eff', border: '1px solid #7c3aed33' }}
                    />
                  )}
                </Box>

                {/* ── Tabs: Rendimiento / Credibilidad ── */}
                <Box sx={{ mb: 3 }}>
                  <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    sx={{
                      '& .MuiTabs-indicator': { bgcolor: '#7c3aed', height: 3, borderRadius: 2 },
                      '& .MuiTab-root': { color: '#666', fontWeight: 600, textTransform: 'none', fontSize: 14 },
                      '& .Mui-selected': { color: '#b89eff !important' },
                      borderBottom: '1px solid #2d2d4e',
                      minHeight: 44,
                    }}
                  >
                    <Tab icon={<TrendingUp sx={{ fontSize: 16 }} />} iconPosition="start" label="Rendimiento" />
                    <Tab icon={<Verified sx={{ fontSize: 16 }} />} iconPosition="start" label="Credibilidad del modelo" />
                  </Tabs>
                </Box>

                {/* ════════════════════════════════════════
                    TAB 0 — RENDIMIENTO
                ════════════════════════════════════════ */}
                {tab === 0 && (
                  <Box>
                    {/* Equity curve */}
                    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5, mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography fontWeight={700} color="#fff" fontSize={15}>
                          📈 Curva de capital
                        </Typography>
                        <Typography variant="caption" color="#555">
                          Capital inicial: {formatCurrency(form.initial_capital)}
                        </Typography>
                      </Box>
                      <EquityCurve
                        equityCurve={results.equity_curve || []}
                        models={activeModels}
                        initialCapital={form.initial_capital}
                      />
                    </Paper>

                    {/* Per-model cards */}
                    <Grid container spacing={2} mb={3}>
                      {(results.model_results || []).map(r => (
                        <Grid item xs={12} sm={6} lg={4} key={r.model}>
                          <ModelCard r={r} />
                        </Grid>
                      ))}
                    </Grid>

                    {/* Mejor modelo */}
                    {results.best_model && (
                      <Paper sx={{ bgcolor: '#1a2a1a', border: '1px solid #4caf5044', borderRadius: 2.5, p: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <EmojiEvents sx={{ color: '#ffc107', fontSize: 22 }} />
                          <Typography color="#4caf50" fontWeight={700} fontSize={15}>Mejor modelo:</Typography>
                          <Chip
                            label={MODEL_LABELS[results.best_model] || results.best_model.toUpperCase()}
                            sx={{ bgcolor: '#4caf5022', color: '#4caf50', border: '1px solid #4caf5044', fontWeight: 700 }}
                          />
                          <Typography color="#888" variant="body2">según retorno ajustado al riesgo (Sharpe Ratio)</Typography>
                        </Box>
                      </Paper>
                    )}
                  </Box>
                )}

                {/* ════════════════════════════════════════
                    TAB 1 — CREDIBILIDAD
                ════════════════════════════════════════ */}
                {tab === 1 && (
                  <Box>
                    {/* Intro banner */}
                    <Paper sx={{
                      background: 'linear-gradient(135deg, #7c3aed11, #2196f311)',
                      border: '1px solid #7c3aed33',
                      borderRadius: 2.5, p: 2.5, mb: 3,
                      display: 'flex', gap: 2, alignItems: 'flex-start',
                    }}>
                      <Verified sx={{ color: '#7c3aed', fontSize: 24, mt: 0.2, flexShrink: 0 }} />
                      <Box>
                        <Typography fontWeight={800} color="#fff" fontSize={15} mb={0.5}>
                          Evaluación de credibilidad del modelo
                        </Typography>
                        <Typography color="#aaa" fontSize={13} lineHeight={1.6}>
                          Comparamos las predicciones día a día de cada modelo con los precios reales usando
                          un proceso <b style={{ color: '#ccc' }}>walk-forward</b>: el modelo sólo conoce datos
                          anteriores al día que predice, simulando condiciones reales de trading.
                        </Typography>
                      </Box>
                    </Paper>

                    {/* Pred vs Actual chart */}
                    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5, mb: 3 }}>
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <QueryStats sx={{ color: '#7c3aed', fontSize: 20 }} />
                          <Typography fontWeight={700} color="#fff" fontSize={15}>
                            Predicción vs Precio Real
                          </Typography>
                        </Box>
                        <Typography color="#666" fontSize={12}>
                          Línea blanca sólida = precio real · líneas de colores punteadas = predicciones de cada modelo
                        </Typography>
                      </Box>
                      <Divider sx={{ borderColor: 'divider', mb: 2 }} />
                      <PredVsActualChart
                        modelResults={results.results || {}}
                        activeModels={activeModels}
                      />
                    </Paper>

                    {/* Accuracy metrics */}
                    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                        <BarChart sx={{ color: '#2196f3', fontSize: 20 }} />
                        <Typography fontWeight={700} color="#fff" fontSize={15}>Métricas de Precisión por Modelo</Typography>
                      </Box>
                      <AccuracyMetricsPanel
                        modelResults={results.results || {}}
                        activeModels={activeModels}
                      />
                    </Paper>
                  </Box>
                )}
                {/* fin tabs */}
              </Box>
            )}
          </Grid>
          {/* fin columna derecha */}
        </Grid>
        {/* fin grid principal */}
      </Box>
    </Box>
  )
}
