import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Chip, Stack,
  Slider, ToggleButton, ToggleButtonGroup, CircularProgress,
  Alert, Divider,
} from '@mui/material'
import {
  AutoGraph, Psychology, TrendingUp, ShowChart,
  CheckCircle, NavigateNext,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import strategyService from '@/services/strategyService'

const MODELS = [
  { key: 'prophet', label: 'Prophet', icon: <Psychology fontSize="small" />, color: '#7c3aed' },
  { key: 'arima',   label: 'ARIMA',   icon: <TrendingUp fontSize="small" />, color: '#2196f3' },
  { key: 'sma',     label: 'SMA',     icon: <ShowChart fontSize="small" />,  color: '#4caf50' },
]

const HORIZON_MARKS = [
  { value: 5,  label: '5d'  },
  { value: 10, label: '10d' },
  { value: 20, label: '20d' },
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
]

const sx = {
  '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'divider' }, '&:hover fieldset': { borderColor: '#7c3aed' } },
  '& label': { color: '#888' },
}

export default function CopyToPredictionsModal({ open, onClose, strategy, onDone }) {
  const navigate = useNavigate()
  const [ticker,       setTicker]      = useState(strategy?.ticker || '')
  const [models,       setModels]      = useState(['prophet', 'arima', 'sma'])
  const [horizonDays,  setHorizonDays] = useState(20)
  const [loading,      setLoading]     = useState(false)
  const [result,       setResult]      = useState(null)
  const [error,        setError]       = useState(null)

  const handleOpen = () => {
    setTicker(strategy?.ticker || '')
    setModels(['prophet', 'arima', 'sma'])
    setHorizonDays(20)
    setResult(null)
    setError(null)
  }

  const handleModels = (_, val) => {
    if (val?.length > 0) setModels(val)
  }

  const handleGenerate = async () => {
    const t = ticker.trim().toUpperCase()
    if (!t) { toast.warning('Introduce un ticker'); return }
    if (models.length === 0) { toast.warning('Selecciona al menos un modelo'); return }

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await strategyService.copyToPredictions(strategy.id, {
        ticker: t,
        models,
        horizon_days: horizonDays,
        historical_days: 1825,
      })
      setResult(data)
    } catch (err) {
      const msg = err?.response?.data?.message || 'Error generando las predicciones ML.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoToPredictions = () => {
    onDone?.()
    onClose()
    navigate(`/prediction?ticker=${result?.ticker || ticker}`)
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEnter: handleOpen }}
      PaperProps={{ sx: { bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <AutoGraph sx={{ color: '#7c3aed' }} />
          <Box>
            <Typography variant="h6" fontWeight={800}>Copiar a Mis Predicciones</Typography>
            <Typography variant="body2" color="text.secondary">
              Genera predicciones ML reales basadas en «{strategy?.name}»
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {result ? (
          <Box textAlign="center" py={3}>
            <CheckCircle sx={{ fontSize: 56, color: '#4caf50', mb: 2 }} />
            <Typography variant="h6" fontWeight={800} mb={1}>
              ¡Predicciones generadas!
            </Typography>
            <Typography color="text.secondary" mb={2}>
              {result.saved} puntos de predicción guardados para <strong>{result.ticker}</strong>
              {' '}con los modelos {result.models_used?.join(', ')}.
            </Typography>
            <Alert severity="info" sx={{ textAlign: 'left', mb: 2 }}>
              {result.disclaimer || 'Las predicciones son estimaciones educativas. No constituyen asesoramiento financiero.'}
            </Alert>
            <Button
              variant="contained"
              endIcon={<NavigateNext />}
              onClick={handleGoToPredictions}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}
            >
              Ver mis predicciones
            </Button>
          </Box>
        ) : (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Ticker a predecir"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder={`Ej: ${strategy?.ticker || 'AAPL'}`}
              size="small"
              fullWidth
              sx={sx}
              helperText="Por defecto usa el ticker de la estrategia. Puedes cambiarlo."
              FormHelperTextProps={{ sx: { color: '#666' } }}
            />

            <Box>
              <Typography variant="body2" fontWeight={700} color="#fff" mb={1}>
                Modelos ML a ejecutar
              </Typography>
              <ToggleButtonGroup
                value={models}
                onChange={handleModels}
                size="small"
                sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
              >
                {MODELS.map(m => (
                  <ToggleButton
                    key={m.key}
                    value={m.key}
                    sx={{
                      flex: 1,
                      border: '1px solid',
                      borderColor: models.includes(m.key) ? m.color : 'divider',
                      borderRadius: '8px !important',
                      color: models.includes(m.key) ? m.color : '#666',
                      bgcolor: models.includes(m.key) ? `${m.color}18` : 'transparent',
                      '&.Mui-selected': {
                        bgcolor: `${m.color}22`,
                        color: m.color,
                        '&:hover': { bgcolor: `${m.color}33` },
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      {m.icon}
                      <Typography variant="caption" fontWeight={700}>{m.label}</Typography>
                    </Stack>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                Selecciona los modelos que quieres ejecutar. Más modelos = más tiempo.
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight={700} color="#fff" mb={1}>
                Horizonte de predicción: <Chip size="small" label={`${horizonDays} días`} sx={{ bgcolor: '#7c3aed22', color: '#b89eff', fontWeight: 700, ml: 0.5 }} />
              </Typography>
              <Slider
                value={horizonDays}
                onChange={(_, v) => setHorizonDays(v)}
                min={5}
                max={60}
                step={5}
                marks={HORIZON_MARKS}
                sx={{
                  color: '#7c3aed',
                  '& .MuiSlider-markLabel': { color: '#666', fontSize: 11 },
                }}
              />
            </Box>

            <Divider />

            <Alert severity="warning" icon={<AutoGraph />} sx={{ fontSize: 12 }}>
              Las predicciones son generadas por algoritmos ML (Prophet, ARIMA, SMA) entrenados con datos históricos reales.
              Precisión típica: 55-60%. No constituyen asesoramiento financiero.
            </Alert>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      {!result && (
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={loading} sx={{ color: 'text.secondary' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={loading || !ticker.trim()}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoGraph />}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}
          >
            {loading ? 'Generando predicciones ML…' : 'Generar predicciones'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
