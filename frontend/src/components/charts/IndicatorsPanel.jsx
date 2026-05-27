import { Box, Typography, Chip, Grid, Divider, Stack } from '@mui/material'
import { TrendingUp, TrendingDown, Remove } from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'

const EMPTY = '—'

function formatNumber(value, decimals = 2, prefix = '') {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return EMPTY
  return `${prefix}${numericValue.toFixed(decimals)}`
}

function Stat({ label, value, color }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        p: { xs: 1.1, sm: 1.25 },
        borderRadius: 1.5,
        border: '1px solid rgba(124,58,237,.18)',
        bgcolor: 'rgba(9,11,24,.74)',
      }}
    >
      <Typography
        variant="caption"
        color="#9ca3af"
        display="block"
        sx={{ mb: 0.35, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={750}
        sx={{ color: color || '#f8fafc', lineHeight: 1.25, overflowWrap: 'anywhere' }}
      >
        {value ?? EMPTY}
      </Typography>
    </Box>
  )
}

function SignalChip({ label, tone = 'neutral' }) {
  const colors = {
    positive: { bg: '#22c55e22', text: '#4ade80' },
    negative: { bg: '#ef444422', text: '#f87171' },
    warning: { bg: '#f59e0b22', text: '#fbbf24' },
    neutral: { bg: '#33415566', text: '#cbd5e1' },
  }[tone]

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: colors.bg,
        color: colors.text,
        fontSize: { xs: 11, sm: 12 },
        fontWeight: 700,
        maxWidth: '100%',
        '& .MuiChip-label': {
          display: 'block',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          py: 0.25,
        },
      }}
    />
  )
}

export default function IndicatorsPanel({ indicators }) {
  if (!indicators?.latest) {
    return (
      <Box sx={{ py: 5, textAlign: 'center' }}>
        <Typography color="#9ca3af">Indicadores no disponibles para este ticker.</Typography>
      </Box>
    )
  }

  const { latest, signals = {}, trend = {} } = indicators
  const rsi = Number(latest.rsi_14)
  const rsiColor = rsi > 70 ? '#f87171' : rsi < 30 ? '#4ade80' : '#cbd5e1'
  const trendDirection = trend.direction || 'lateral'
  const TrendIcon = trendDirection === 'alcista'
    ? TrendingUp
    : trendDirection === 'bajista'
      ? TrendingDown
      : Remove
  const trendColor = trendDirection === 'alcista'
    ? '#4ade80'
    : trendDirection === 'bajista'
      ? '#f87171'
      : '#cbd5e1'

  const signalChips = []
  if (signals.golden_cross) signalChips.push({ label: 'Cruce alcista', tone: 'positive' })
  if (signals.death_cross) signalChips.push({ label: 'Cruce bajista', tone: 'negative' })
  if (signals.rsi_overbought) signalChips.push({ label: 'RSI sobrecomprado', tone: 'warning' })
  if (signals.rsi_oversold) signalChips.push({ label: 'RSI sobrevendido', tone: 'positive' })
  signalChips.push({
    label: signals.macd_bullish ? 'MACD alcista' : 'MACD bajista',
    tone: signals.macd_bullish ? 'positive' : 'negative',
  })

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        bgcolor: '#080b16',
        borderRadius: 2,
        p: { xs: 1.25, sm: 2 },
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.25}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <TrendIcon sx={{ color: trendColor, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} color="#fff">
              Indicadores técnicos
            </Typography>
            <Typography variant="caption" color="#9ca3af">
              Último cálculo: {latest.date || EMPTY}
            </Typography>
          </Box>
        </Stack>
        <Chip
          label={`Tendencia ${trendDirection}`}
          size="small"
          sx={{
            bgcolor: `${trendColor}22`,
            color: trendColor,
            border: `1px solid ${trendColor}44`,
            fontWeight: 800,
            alignSelf: { xs: 'flex-start', sm: 'center' },
          }}
        />
      </Stack>

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="Precio" value={latest.price ? formatCurrency(latest.price) : EMPTY} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="SMA 20" value={formatNumber(latest.sma_20, 2, '$')} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="SMA 50" value={formatNumber(latest.sma_50, 2, '$')} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="RSI 14" value={formatNumber(latest.rsi_14, 1)} color={rsiColor} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="MACD" value={formatNumber(latest.macd, 4)} color={latest.macd > 0 ? '#4ade80' : '#f87171'} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Stat label="MACD señal" value={formatNumber(latest.macd_signal, 4)} />
        </Grid>
      </Grid>

      <Divider sx={{ borderColor: 'rgba(124,58,237,.22)', my: { xs: 1.5, sm: 2 } }} />

      <Typography variant="caption" color="#9ca3af" display="block" mb={1}>
        Bandas de Bollinger
      </Typography>
      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={4}>
          <Stat label="Superior" value={formatNumber(latest.bollinger_upper, 2, '$')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <Stat label="Media" value={formatNumber(latest.bollinger_middle, 2, '$')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <Stat label="Inferior" value={formatNumber(latest.bollinger_lower, 2, '$')} />
        </Grid>
      </Grid>

      <Divider sx={{ borderColor: 'rgba(124,58,237,.22)', my: { xs: 1.5, sm: 2 } }} />

      <Typography variant="caption" color="#9ca3af" display="block" mb={1}>
        Lectura técnica
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75}>
        {signalChips.map(signal => (
          <SignalChip key={signal.label} label={signal.label} tone={signal.tone} />
        ))}
      </Stack>

      {(trend.support || trend.resistance) && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 2 }} sx={{ mt: 2 }}>
          {trend.support && (
            <Typography variant="caption" color="#cbd5e1">
              Soporte: <b style={{ color: '#4ade80' }}>${trend.support}</b>
            </Typography>
          )}
          {trend.resistance && (
            <Typography variant="caption" color="#cbd5e1">
              Resistencia: <b style={{ color: '#f87171' }}>${trend.resistance}</b>
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  )
}
