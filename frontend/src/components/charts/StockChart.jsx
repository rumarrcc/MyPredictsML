import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material'

export default function StockChart({ data = [], ticker = '', height }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))
  const chartHeight = height || (isMobile ? 300 : isTablet ? 360 : 420)
  const maxVolume = useMemo(() => {
    const volumes = data
      .map(d => Number(d.volume || 0))
      .filter(v => Number.isFinite(v) && v > 0)
    return volumes.length ? Math.max(...volumes) : 1
  }, [data])

  const traces = useMemo(() => {
    if (!data.length) return []
    const dates  = data.map(d => d.date)
    const open   = data.map(d => d.open)
    const high   = data.map(d => d.high)
    const low    = data.map(d => d.low)
    const close  = data.map(d => d.close)
    const volume = data.map(d => d.volume)
    const sma20  = data.map(d => d.sma_20)
    const sma50  = data.map(d => d.sma_50)

    return [
      {
        type: 'candlestick', x: dates,
        open, high, low, close,
        name: ticker,
        increasing: { line: { color: '#4caf50' }, fillcolor: '#4caf5055' },
        decreasing: { line: { color: '#f44336' }, fillcolor: '#f4433655' },
        hoverlabel: { namelength: 12 },
      },
      {
        type: 'scatter', x: dates, y: sma20,
        name: 'SMA 20', line: { color: '#ff9800', width: 1.5, dash: 'dot' },
        hovertemplate: 'SMA20: $%{y:.2f}<extra></extra>',
      },
      {
        type: 'scatter', x: dates, y: sma50,
        name: 'SMA 50', line: { color: '#9c27b0', width: 1.5, dash: 'dot' },
        hovertemplate: 'SMA50: $%{y:.2f}<extra></extra>',
      },
      {
        type: 'bar', x: dates, y: volume,
        name: 'Volumen', yaxis: 'y2', opacity: isMobile ? 0.18 : 0.28,
        marker: { color: '#2196f3' },
        hovertemplate: 'Vol: %{y:,.0f}<extra></extra>',
      },
    ]
  }, [data, ticker, isMobile])

  const layout = useMemo(() => ({
    paper_bgcolor: '#050711',
    plot_bgcolor: '#050711',
    font: { color: '#d4d4df', family: 'Inter, sans-serif', size: isMobile ? 10 : 12 },
    xaxis: {
      rangeslider: { visible: false },
      gridcolor: 'rgba(148,163,184,.16)', linecolor: 'rgba(148,163,184,.24)',
      type: 'date',
      tickfont: { size: isMobile ? 9 : 11 },
      automargin: true,
      nticks: isMobile ? 4 : 8,
    },
    yaxis: {
      title: isMobile ? '' : 'Precio (USD)',
      gridcolor: 'rgba(148,163,184,.16)',
      linecolor: 'rgba(148,163,184,.24)',
      tickprefix: '$',
      tickfont: { size: isMobile ? 9 : 11 },
      automargin: true,
    },
    yaxis2: {
      title: isMobile ? '' : 'Volumen',
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      showticklabels: !isMobile,
      range: [0, maxVolume * 4],
    },
    showlegend: !isMobile,
    legend: {
      orientation: 'h',
      x: 0,
      y: isTablet ? 1.1 : 1.06,
      bgcolor: 'rgba(5,7,17,.88)',
      bordercolor: 'rgba(148,163,184,.18)',
      borderwidth: 1,
      font: { size: isMobile ? 9 : 11 },
    },
    margin: isMobile
      ? { t: 18, r: 8, b: 32, l: 34 }
      : isTablet
        ? { t: 42, r: 30, b: 38, l: 48 }
        : { t: 34, r: 58, b: 42, l: 62 },
    hovermode: 'x unified',
    dragmode: 'pan',
  }), [isMobile, isTablet, maxVolume])

  if (!data.length) {
    return (
      <Box sx={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
        <Typography color="#555">Sin datos disponibles</Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
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
        layout={{ ...layout, height: chartHeight, autosize: true }}
        config={{
          displayModeBar: !isMobile,
          responsive: true,
          displaylogo: false,
          scrollZoom: false,
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </Box>
  )
}
