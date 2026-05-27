import { Box, Typography, Grid, Divider } from '@mui/material'
import { TrendingUp, TrendingDown } from '@mui/icons-material'
import { formatCurrency, formatPercent, getPnlColor } from '@/utils/formatters'

export default function PortfolioOverview({ portfolio }) {
  if (!portfolio) return null
  const pnl   = (portfolio.current_value || 0) - (portfolio.initial_capital || 0)
  const color = getPnlColor(pnl)
  const Icon  = pnl >= 0 ? TrendingUp : TrendingDown

  return (
    <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" fontWeight={700} color="#fff" mb={0.5}>{portfolio.name}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Icon sx={{ color, fontSize: 20 }} />
        <Typography variant="h4" fontWeight={700} sx={{ color }}>
          {formatCurrency(portfolio.current_value)}
        </Typography>
        <Typography variant="body2" sx={{ color, ml: 1 }}>
          ({formatPercent(portfolio.total_return)})
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {[
          { label: 'Capital inicial',  value: formatCurrency(portfolio.initial_capital) },
          { label: 'Invertido',        value: formatCurrency(portfolio.total_invested) },
          { label: 'Disponible',       value: formatCurrency(portfolio.cash_available) },
          { label: 'Ganancias/Pérd.',  value: formatCurrency(pnl), color },
        ].map(({ label, value, color: c }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Typography variant="caption" color="#888" display="block">{label}</Typography>
            <Typography variant="body1" fontWeight={600} sx={{ color: c || '#fff' }}>{value}</Typography>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
