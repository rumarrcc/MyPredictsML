import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material'
import { MODEL_COLORS, MODEL_LABELS } from '@/utils/constants'

/**
 * Acepta dos formatos:
 *  A) results = [{ model: 'prophet', equity_curve: [{date, value}, ...] }, ...]
 *  B) equityCurve = [{date, prophet: N, arima: N, sma: N}, ...] + models = ['prophet', ...]
 */
export default function EquityCurve({ results = [], equityCurve = [], models = [], initialCapital = 10000, height }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))
  const chartHeight = height || (isMobile ? 300 : isTablet ? 340 : 380)

  const traces = useMemo(() => {
    // Format A: results array from backtest API
    if (results.length > 0) {
      return results.map(r => {
        const curve = r.equity_curve || []
        return {
          type: 'scatter', mode: 'lines',
          name: MODEL_LABELS[r.model] || r.model,
          x: curve.map(p => p.date),
          y: curve.map(p => p.value ?? p.portfolio_value ?? null),
          line: { color: MODEL_COLORS[r.model] || '#aaa', width: 2 },
          hovertemplate: `$%{y:,.2f}<extra>${MODEL_LABELS[r.model] || r.model}</extra>`,
        }
      })
    }

    // Format B: combined flat array
    if (!equityCurve.length || !models.length) return []
    const dates = equityCurve.map(r => r.date)
    return models.map(model => ({
      type: 'scatter', mode: 'lines',
      name: MODEL_LABELS[model] || model,
      x: dates,
      y: equityCurve.map(r => r[model] ?? null),
      line: { color: MODEL_COLORS[model] || '#aaa', width: 2 },
      hovertemplate: `$%{y:,.2f}<extra>${MODEL_LABELS[model] || model}</extra>`,
    }))
  }, [results, equityCurve, models])

  if (!traces.length) {
    return (
      <Box sx={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#050711', borderRadius: 2 }}>
        <Typography color="#555">Sin datos de equity curve</Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        height: chartHeight,
        overflow: 'hidden',
        borderRadius: 2,
        bgcolor: '#050711',
        '& .js-plotly-plot, & .plot-container, & .svg-container': {
          width: '100% !important',
          maxWidth: '100% !important',
          height: '100% !important',
        },
      }}
    >
      <Plot
        data={traces}
        layout={{
          paper_bgcolor: '#050711',
          plot_bgcolor: '#050711',
          font: { color: '#d4d4df', family: 'Inter, sans-serif', size: isMobile ? 10 : 12 },
          xaxis: {
            gridcolor: 'rgba(148,163,184,.14)',
            linecolor: 'rgba(148,163,184,.24)',
            tickfont: { size: isMobile ? 9 : 11 },
            nticks: isMobile ? 4 : 8,
            automargin: true,
          },
          yaxis: {
            gridcolor: 'rgba(148,163,184,.14)',
            linecolor: 'rgba(148,163,184,.24)',
            tickprefix: '$',
            tickfont: { size: isMobile ? 9 : 11 },
            automargin: true,
          },
          legend: {
            orientation: 'h',
            x: 0,
            y: isMobile ? 1.18 : 1.08,
            bgcolor: 'rgba(5,7,17,.86)',
            bordercolor: 'rgba(148,163,184,.18)',
            borderwidth: 1,
            font: { size: isMobile ? 9 : 11 },
          },
          margin: isMobile
            ? { t: 46, r: 10, b: 34, l: 42 }
            : { t: 34, r: 24, b: 44, l: 70 },
          hovermode: 'x unified',
          hoverlabel: { bgcolor: '#080b16', bordercolor: 'rgba(139,92,246,.28)', font: { color: '#fff' } },
          shapes: [{
            type: 'line', xref: 'paper',
            x0: 0, x1: 1,
            y0: initialCapital, y1: initialCapital,
            line: { color: 'rgba(255,255,255,.32)', width: 1, dash: 'dot' },
          }],
          height: chartHeight,
          autosize: true,
        }}
        config={{ displayModeBar: !isMobile, responsive: true, displaylogo: false, scrollZoom: false }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </Box>
  )
}
