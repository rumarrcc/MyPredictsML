import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Box, Typography, Chip, Paper, useMediaQuery, useTheme } from '@mui/material'

const MODEL_COLORS = { prophet: '#7c3aed', arima: '#2196f3', sma: '#4caf50' }
const MODEL_LABELS = { prophet: 'Exp. Smoothing', arima: 'ARIMA', sma: 'Media Móvil' }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minWidth: 180 }}>
      <Typography color="#888" fontSize={11} mb={0.8}>{label}</Typography>
      {payload.map(p => (
        <Box key={p.dataKey} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.3 }}>
          <Typography fontSize={12} sx={{ color: p.color }}>{p.name}</Typography>
          <Typography fontSize={12} fontWeight={700} color="#fff">
            ${Number(p.value).toFixed(2)}
          </Typography>
        </Box>
      ))}
    </Paper>
  )
}

/**
 * Muestra la predicción de cada modelo vs el precio real.
 * Props:
 *   modelResults  — objeto { prophet: { accuracy_metrics: { sampled_curve: [...] } }, ... }
 *   activeModels  — array de strings con los modelos a mostrar
 */
export default function PredVsActualChart({ modelResults = {}, activeModels = [] }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [hiddenModels, setHiddenModels] = useState([])
  const chartHeight = isMobile ? 300 : 360

  // Fusionar las curvas de todos los modelos en un array por fecha
  const chartData = useMemo(() => {
    const byDate = {}

    activeModels.forEach(model => {
      const curve = modelResults[model]?.accuracy_metrics?.sampled_curve || []
      curve.forEach(pt => {
        if (!byDate[pt.date]) {
          byDate[pt.date] = { date: pt.date, actual: pt.actual }
        }
        byDate[pt.date][`pred_${model}`] = pt.predicted
      })
    })

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }, [modelResults, activeModels])

  const toggleModel = (model) => {
    setHiddenModels(prev =>
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
  }

  if (!chartData.length) {
    return (
      <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="#555">Sin datos de predicción vs real disponibles</Typography>
      </Box>
    )
  }

  // Calcular rango dinámico para el eje Y
  const allValues = chartData.flatMap(d =>
    [d.actual, ...activeModels.map(m => d[`pred_${m}`])].filter(Boolean)
  )
  const minY = Math.floor(Math.min(...allValues) * 0.98)
  const maxY = Math.ceil(Math.max(...allValues) * 1.02)

  return (
    <Box>
      {/* Leyenda interactiva */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          label="Precio real"
          sx={{
            bgcolor: '#ffffff22', color: '#fff',
            border: '2px solid #fff',
            fontWeight: 700, fontSize: 11,
          }}
        />
        {activeModels.map(model => (
          <Chip
            key={model}
            label={MODEL_LABELS[model] || model}
            onClick={() => toggleModel(model)}
            sx={{
              bgcolor: hiddenModels.includes(model)
                ? '#2d2d4e'
                : MODEL_COLORS[model] + '22',
              color: hiddenModels.includes(model) ? '#555' : MODEL_COLORS[model],
              border: `2px solid ${hiddenModels.includes(model) ? '#2d2d4e' : MODEL_COLORS[model]}`,
              fontWeight: 700, fontSize: 11, cursor: 'pointer',
              textDecoration: hiddenModels.includes(model) ? 'line-through' : 'none',
              transition: 'all .15s',
            }}
          />
        ))}
        <Typography variant="caption" color="#555" sx={{ ml: { xs: 0, sm: 'auto' }, width: { xs: '100%', sm: 'auto' }, alignSelf: 'center' }}>
          Haz clic en un modelo para ocultarlo
        </Typography>
      </Box>

      <Box sx={{ width: '100%', minWidth: 0, height: chartHeight, overflow: 'hidden', borderRadius: 2, bgcolor: '#050711' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={isMobile ? { top: 8, right: 8, bottom: 18, left: 2 } : { top: 8, right: 16, bottom: 24, left: 16 }}
        >
          <defs>
            <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ffffff" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#ffffff" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#666', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#2d2d4e' }}
            interval="preserveStartEnd"
            minTickGap={isMobile ? 28 : 16}
          />
          <YAxis
            domain={[minY, maxY]}
            tick={{ fill: '#666', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#2d2d4e' }}
            tickFormatter={v => `$${v.toFixed(0)}`}
            width={isMobile ? 42 : 56}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Precio real — área + línea */}
          <Area
            dataKey="actual"
            name="Precio real"
            type="monotone"
            stroke="#ffffff"
            strokeWidth={2.5}
            fill="url(#gradActual)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />

          {/* Una línea por modelo (punteada) */}
          {activeModels.map(model => (
            !hiddenModels.includes(model) && (
              <Line
                key={model}
                dataKey={`pred_${model}`}
                name={MODEL_LABELS[model] || model}
                type="monotone"
                stroke={MODEL_COLORS[model] || '#aaa'}
                strokeWidth={1.8}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
                connectNulls
              />
            )
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      </Box>
    </Box>
  )
}
