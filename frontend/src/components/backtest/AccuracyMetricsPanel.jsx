import { Box, Typography, Paper, Grid, Chip, Tooltip, LinearProgress } from '@mui/material'
import {
  CheckCircle, Cancel, TrendingUp, ShowChart,
  Info,
} from '@mui/icons-material'

const MODEL_COLORS  = { prophet: '#7c3aed', arima: '#2196f3', sma: '#4caf50' }
const MODEL_LABELS  = { prophet: 'Exp. Smoothing', arima: 'ARIMA', sma: 'Media Móvil' }
const MODEL_BG      = { prophet: '#7c3aed22', arima: '#2196f322', sma: '#4caf5022' }

// Interpretaciones de cada métrica
const METRIC_INFO = {
  mae: {
    label: 'MAE',
    full:  'Error Absoluto Medio',
    unit:  '$',
    desc:  'Diferencia promedio (en dólares) entre el precio predicho y el real. Cuanto menor, mejor.',
    icon:  <ShowChart sx={{ fontSize: 18 }} />,
    lowerIsBetter: true,
  },
  rmse: {
    label: 'RMSE',
    full:  'Raíz del Error Cuadrático Medio',
    unit:  '$',
    desc:  'Penaliza más los errores grandes. Un RMSE muy superior al MAE indica errores puntuales importantes.',
    icon:  <ShowChart sx={{ fontSize: 18 }} />,
    lowerIsBetter: true,
  },
  mape: {
    label: 'MAPE',
    full:  'Error Porcentual Absoluto Medio',
    unit:  '%',
    desc:  'Error relativo al precio. MAPE < 2% = excelente, < 5% = bueno, > 10% = mejorable.',
    icon:  <TrendingUp sx={{ fontSize: 18 }} />,
    lowerIsBetter: true,
    thresholds: { excellent: 2, good: 5 },
  },
  directional_accuracy: {
    label: 'Dir. Accuracy',
    full:  'Precisión Direccional',
    unit:  '%',
    desc:  'Porcentaje de veces que el modelo acertó la dirección del movimiento (subida/bajada). > 55% es útil para trading.',
    icon:  <CheckCircle sx={{ fontSize: 18 }} />,
    lowerIsBetter: false,
    thresholds: { excellent: 60, good: 55 },
  },
}

function getQualityColor(metric, value) {
  if (value == null) return '#555'
  const info = METRIC_INFO[metric]
  if (!info) return '#ccc'

  if (metric === 'mape') {
    if (value < 2)  return '#4caf50'
    if (value < 5)  return '#8bc34a'
    if (value < 10) return '#ffc107'
    return '#f44336'
  }
  if (metric === 'directional_accuracy') {
    if (value >= 60) return '#4caf50'
    if (value >= 55) return '#8bc34a'
    if (value >= 50) return '#ffc107'
    return '#f44336'
  }
  return '#ccc'
}

function getQualityLabel(metric, value) {
  if (value == null) return ''
  if (metric === 'mape') {
    if (value < 2)  return 'Excelente'
    if (value < 5)  return 'Bueno'
    if (value < 10) return 'Aceptable'
    return 'Mejorable'
  }
  if (metric === 'directional_accuracy') {
    if (value >= 60) return 'Excelente'
    if (value >= 55) return 'Bueno'
    if (value >= 50) return 'Aceptable'
    return 'Por debajo del azar'
  }
  return ''
}

// Tarjeta de una sola métrica con comparativa entre modelos
function MetricCard({ metricKey, modelResults, activeModels }) {
  const info = METRIC_INFO[metricKey]

  const values = activeModels
    .map(m => ({
      model: m,
      value: modelResults[m]?.accuracy_metrics?.[metricKey],
    }))
    .filter(v => v.value != null)

  if (!values.length) return null

  const sorted = [...values].sort((a, b) =>
    info.lowerIsBetter ? a.value - b.value : b.value - a.value
  )
  const best  = sorted[0]?.value
  const worst = sorted[sorted.length - 1]?.value
  const range = worst - best || 1

  return (
    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5, height: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Box sx={{ color: '#7c3aed' }}>{info.icon}</Box>
            <Typography fontWeight={800} color="#fff" fontSize={15}>{info.label}</Typography>
          </Box>
          <Typography color="#666" fontSize={11} mt={0.3}>{info.full}</Typography>
        </Box>
        <Tooltip title={info.desc} placement="top" arrow
          componentsProps={{ tooltip: { sx: { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontSize: 12, maxWidth: 260 } } }}>
          <Info sx={{ fontSize: 15, color: '#444', cursor: 'help' }} />
        </Tooltip>
      </Box>

      {/* Valores por modelo */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {sorted.map(({ model, value }) => {
          const isBest  = value === best
          const barPct  = info.lowerIsBetter
            ? ((worst - value) / range) * 100
            : ((value - best) / range + 1) / 2 * 100
          const clampedPct = Math.max(10, Math.min(100, barPct))
          const color = MODEL_COLORS[model] || '#aaa'

          return (
            <Box key={model}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                  <Typography fontSize={12} color="#aaa">{MODEL_LABELS[model] || model}</Typography>
                  {isBest && (
                    <Chip label="mejor" size="small"
                      sx={{ bgcolor: '#4caf5022', color: '#4caf50', border: '1px solid #4caf5044',
                        fontSize: 9, height: 16, '& .MuiChip-label': { px: 0.8 } }} />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Typography fontWeight={800} fontSize={14} color="#fff">
                    {info.unit === '$' ? `$${value.toFixed(2)}` : `${value.toFixed(2)}${info.unit}`}
                  </Typography>
                  {getQualityLabel(metricKey, value) && (
                    <Typography fontSize={10} fontWeight={600}
                      sx={{ color: getQualityColor(metricKey, value) }}>
                      {getQualityLabel(metricKey, value)}
                    </Typography>
                  )}
                </Box>
              </Box>
              <LinearProgress
                variant="determinate"
                value={clampedPct}
                sx={{
                  height: 5, borderRadius: 5, bgcolor: 'background.default',
                  '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 5 },
                }}
              />
            </Box>
          )
        })}
      </Box>

      {/* Descripción */}
      <Typography color="#555" fontSize={11} mt={2} lineHeight={1.5}>{info.desc}</Typography>
    </Paper>
  )
}

// Scorecard resumen por modelo
function ModelScorecard({ model, metrics, n }) {
  if (!metrics) return null
  const color  = MODEL_COLORS[model] || '#aaa'
  const mape   = metrics.mape
  const dirAcc = metrics.directional_accuracy

  const score = (() => {
    let s = 0
    if (mape != null) {
      if (mape < 2)  s += 3
      else if (mape < 5)  s += 2
      else if (mape < 10) s += 1
    }
    if (dirAcc != null) {
      if (dirAcc >= 60) s += 3
      else if (dirAcc >= 55) s += 2
      else if (dirAcc >= 50) s += 1
    }
    return s
  })()

  const scoreLabel = score >= 5 ? 'Excelente' : score >= 3 ? 'Bueno' : score >= 2 ? 'Aceptable' : 'Limitado'
  const scoreColor = score >= 5 ? '#4caf50' : score >= 3 ? '#8bc34a' : score >= 2 ? '#ffc107' : '#f44336'

  return (
    <Paper sx={{
      bgcolor: 'background.paper', border: `1px solid ${color}33`, borderRadius: 2.5, p: 2.5,
      borderTop: `3px solid ${color}`,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Chip label={MODEL_LABELS[model] || model} size="small"
            sx={{ bgcolor: MODEL_BG[model], color, fontWeight: 700, fontSize: 11 }} />
          <Typography color="#555" fontSize={11} mt={0.5}>{n} predicciones analizadas</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography fontWeight={900} fontSize={13} sx={{ color: scoreColor }}>{scoreLabel}</Typography>
          <Box sx={{ display: 'flex', gap: 0.3, justifyContent: 'flex-end', mt: 0.3 }}>
            {[1,2,3,4,5,6].map(i => (
              <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%',
                bgcolor: i <= score ? scoreColor : '#2d2d4e' }} />
            ))}
          </Box>
        </Box>
      </Box>

      <Grid container spacing={1.5}>
        {[
          { key: 'mae',                  label: 'MAE',       val: metrics.mae != null ? `$${metrics.mae.toFixed(2)}` : '—' },
          { key: 'rmse',                 label: 'RMSE',      val: metrics.rmse != null ? `$${metrics.rmse.toFixed(2)}` : '—' },
          { key: 'mape',                 label: 'MAPE',      val: metrics.mape != null ? `${metrics.mape.toFixed(2)}%` : '—' },
          { key: 'directional_accuracy', label: 'Dir. Acc.', val: metrics.directional_accuracy != null ? `${metrics.directional_accuracy.toFixed(1)}%` : '—' },
        ].map(({ key, label, val }) => (
          <Grid item xs={6} key={key}>
            <Box sx={{ bgcolor: 'background.default', borderRadius: 1.5, p: 1.5, textAlign: 'center' }}>
              <Typography fontSize={10} color="#666" mb={0.3}>{label}</Typography>
              <Typography fontWeight={800} fontSize={14} sx={{ color: getQualityColor(key, metrics[key]) }}>
                {val}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  )
}

/**
 * Props:
 *   modelResults  — objeto { prophet: { accuracy_metrics: {...} }, arima: {...}, ... }
 *   activeModels  — lista de modelos seleccionados
 */
export default function AccuracyMetricsPanel({ modelResults = {}, activeModels = [] }) {
  const hasData = activeModels.some(m => modelResults[m]?.accuracy_metrics?.n_predictions > 0)

  if (!hasData) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography color="#555">Ejecuta un backtest para ver las métricas de precisión</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* ── Introducción ── */}
      <Box sx={{
        bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2,
        mb: 3, display: 'flex', gap: 1.5, alignItems: 'flex-start',
      }}>
        <Info sx={{ color: '#7c3aed', fontSize: 18, mt: 0.2, flexShrink: 0 }} />
        <Typography color="#888" fontSize={13} lineHeight={1.6}>
          Estas métricas miden la <b style={{ color: '#ccc' }}>calidad predictiva</b> de cada modelo comparando
          sus predicciones walk-forward con los precios reales durante el período analizado.
          Se calculan sobre cada día del backtest, no sobre operaciones abiertas/cerradas.
        </Typography>
      </Box>

      {/* ── Scorecards por modelo ── */}
      <Typography fontWeight={700} color="#fff" mb={2} fontSize={15}>Resumen por modelo</Typography>
      <Grid container spacing={2} mb={4}>
        {activeModels.map(model => {
          const am = modelResults[model]?.accuracy_metrics
          return am ? (
            <Grid item xs={12} sm={6} md={4} key={model}>
              <ModelScorecard model={model} metrics={am} n={am.n_predictions} />
            </Grid>
          ) : null
        })}
      </Grid>

      {/* ── Comparativa detallada por métrica ── */}
      <Typography fontWeight={700} color="#fff" mb={2} fontSize={15}>Comparativa detallada</Typography>
      <Grid container spacing={2}>
        {['mae', 'rmse', 'mape', 'directional_accuracy'].map(metric => (
          <Grid item xs={12} sm={6} lg={3} key={metric}>
            <MetricCard metricKey={metric} modelResults={modelResults} activeModels={activeModels} />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
