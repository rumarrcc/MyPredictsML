import { Box, Typography, Chip, Divider } from '@mui/material'
import { TrendingUp, TrendingDown, ErrorOutline } from '@mui/icons-material'
import { MODEL_COLORS, MODEL_LABELS } from '@/utils/constants'
import { formatCurrency, formatPercent } from '@/utils/formatters'

function MetricRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="caption" color="#888">{label}</Typography>
      <Typography variant="caption" color="#ccc" fontWeight={600}>{value ?? '—'}</Typography>
    </Box>
  )
}

export default function PredictionCard({ model }) {
  if (!model) return null

  const color = MODEL_COLORS[model.name] || '#aaa'
  const label = MODEL_LABELS[model.name] || model.name

  // Modelo con error — mostrar tarjeta de error en lugar de null
  if (model.error || !model.predictions?.length) {
    return (
      <Box sx={{
        bgcolor: 'background.paper', borderRadius: 2, p: 2,
        border: '1px solid #f4433622', minHeight: 120,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          <Typography variant="subtitle2" fontWeight={700} color="#fff">{label}</Typography>
          <Chip label="Error" size="small" sx={{ ml: 'auto', bgcolor: '#f4433622', color: '#f44336', fontSize: 10 }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.5 }}>
          <ErrorOutline sx={{ color: '#f4433688', fontSize: 16, mt: '2px', flexShrink: 0 }} />
          <Typography variant="caption" color="#888" sx={{ lineHeight: 1.5 }}>
            {model.error
              ? model.error.includes('stan_backend') || model.error.includes('cmdstan')
                ? 'Error en el modelo de predicción. Intenta recargar la página.'
                : model.error.includes('iloc') || model.error.includes('conf_int')
                ? 'Error interno de ARIMA. Prueba con otro ticker o período.'
                : model.error.length > 120
                ? model.error.slice(0, 117) + '...'
                : model.error
              : 'Sin predicciones disponibles para este modelo.'
            }
          </Typography>
        </Box>
      </Box>
    )
  }

  const preds   = model.predictions
  const metrics = model.metrics || {}
  const firstPred = preds[0]
  const lastPred  = preds[preds.length - 1]
  const trend = lastPred && firstPred
    ? ((lastPred.predicted_price - firstPred.predicted_price) / firstPred.predicted_price)
    : null

  return (
    <Box sx={{
      bgcolor: 'background.paper', borderRadius: 2, p: 2,
      border: `1px solid ${color}44`,
      transition: 'border 0.2s',
      '&:hover': { border: `1px solid ${color}99` },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
        <Typography variant="subtitle2" fontWeight={700} color="#fff">{label}</Typography>
        {trend !== null && (
          <Chip
            icon={trend >= 0 ? <TrendingUp style={{ fontSize: 14 }} /> : <TrendingDown style={{ fontSize: 14 }} />}
            label={formatPercent(trend)}
            size="small"
            sx={{
              ml: 'auto', fontSize: 11,
              bgcolor: trend >= 0 ? '#4caf5022' : '#f4433622',
              color:   trend >= 0 ? '#4caf50'   : '#f44336',
            }}
          />
        )}
      </Box>

      {firstPred && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="#888">Próxima predicción</Typography>
          <Typography variant="h6" fontWeight={700} sx={{ color }}>
            {formatCurrency(firstPred.predicted_price)}
          </Typography>
          <Typography variant="caption" color="#555">{firstPred.date}</Typography>
          {firstPred.lower_bound != null && firstPred.upper_bound != null && (
            <Typography variant="caption" color="#666" display="block">
              IC 95%: {formatCurrency(firstPred.lower_bound)} — {formatCurrency(firstPred.upper_bound)}
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ borderColor: 'divider', mb: 1.5 }} />

      <Typography variant="caption" color="#888" display="block" mb={0.5}>Métricas</Typography>
      <MetricRow label="MAE" value={metrics.mae != null ? `$${metrics.mae.toFixed(2)}` : null} />
      <MetricRow label="RMSE" value={metrics.rmse != null ? `$${metrics.rmse.toFixed(2)}` : null} />
      <MetricRow label="MAPE" value={metrics.mape != null ? `${metrics.mape.toFixed(1)}%` : null} />
      <MetricRow label="Muestras" value={metrics.training_samples?.toLocaleString()} />
    </Box>
  )
}
