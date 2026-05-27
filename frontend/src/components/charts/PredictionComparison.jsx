import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { Box, Typography, Alert } from '@mui/material'
import { MODEL_COLORS, MODEL_LABELS, DISCLAIMER } from '@/utils/constants'

export default function PredictionComparison({ historicalData = [], predictionData = null, height = 400 }) {
  const traces = useMemo(() => {
    const result = []
    // dechever - 05/03/2026: añadí las gráficas para ver mejor la evolución del activo y comparar las predicciones.

    // Histórico (últimos 60 días)
    const hist = historicalData.slice(-60)
    if (hist.length) {
      result.push({
        type: 'scatter', mode: 'lines',
        x: hist.map(d => d.date), y: hist.map(d => d.close),
        name: 'Histórico', line: { color: '#aaa', width: 2 },
        hovertemplate: '$%{y:.2f}<extra>Histórico</extra>',
      })
    }

    // Predicciones por modelo
    if (predictionData?.models) {
      predictionData.models.forEach(model => {
        if (!model.predictions?.length) return
        const color = MODEL_COLORS[model.name] || '#fff'
        const label = MODEL_LABELS[model.name] || model.name

        result.push({
          type: 'scatter', mode: 'lines+markers',
          x: model.predictions.map(p => p.date),
          y: model.predictions.map(p => p.predicted_price),
          name: label, line: { color, width: 2, dash: 'dash' },
          marker: { size: 4, color },
          hovertemplate: `$%{y:.2f}<extra>${label}</extra>`,
        })

        // Banda de confianza
        const uppers = model.predictions.map(p => p.upper_bound).filter(Boolean)
        const lowers = model.predictions.map(p => p.lower_bound).filter(Boolean)
        if (uppers.length) {
          result.push({
            type: 'scatter', mode: 'lines',
            x: [...model.predictions.map(p => p.date), ...model.predictions.map(p => p.date).reverse()],
            y: [...uppers, ...lowers.reverse()],
            fill: 'toself', fillcolor: `${color}20`,
            line: { color: 'transparent' },
            name: `${label} IC 95%`, showlegend: false, hoverinfo: 'skip',
          })
        }
      })
    }

    return result
  }, [historicalData, predictionData])

  const layout = {
    paper_bgcolor: '#050711', plot_bgcolor: '#050711',
    font: { color: '#d4d4df', family: 'Inter, sans-serif', size: 12 },
    xaxis: { gridcolor: 'rgba(148,163,184,.16)', linecolor: 'rgba(148,163,184,.24)' },
    yaxis: { gridcolor: 'rgba(148,163,184,.16)', linecolor: 'rgba(148,163,184,.24)', tickprefix: '$' },
    legend: { bgcolor: 'rgba(5,7,17,.88)', bordercolor: 'rgba(148,163,184,.24)', borderwidth: 1 },
    margin: { t: 20, r: 20, b: 40, l: 60 },
    hovermode: 'x unified',
    shapes: [{
      type: 'line',
      x0: historicalData[historicalData.length - 1]?.date,
      x1: historicalData[historicalData.length - 1]?.date,
      y0: 0, y1: 1, yref: 'paper',
      line: { color: '#ffffff44', width: 1, dash: 'dot' },
    }],
  }

  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 1, bgcolor: '#2d1a00', color: '#ffb74d', '& .MuiAlert-icon': { color: '#ff9800' } }}>
        {DISCLAIMER}
      </Alert>
      {traces.length === 0 ? (
        <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
          <Typography color="#555">Genera una predicción para visualizarla</Typography>
        </Box>
      ) : (
        <Plot
          data={traces}
          layout={{ ...layout, height, autosize: true }}
          config={{ displayModeBar: true, responsive: true, displaylogo: false }}
          style={{ width: '100%' }}
          useResizeHandler
        />
      )}
    </Box>
  )
}
