import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Paper, Slider, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import {
  Close, LockRounded, Publish, Save, StorefrontRounded,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import strategyService from '@/services/strategyService'

const ENFOQUES = [
  { value: 'momentum', label: 'Predicción alcista', help: 'Idea pensada para activos con fuerza positiva.' },
  { value: 'mean_reversion', label: 'Rebote esperado', help: 'Idea basada en una posible recuperación del precio.' },
  { value: 'swing', label: 'Movimiento de varios días', help: 'Operación pensada para mantenerla varios días.' },
  { value: 'long_term', label: 'Medio plazo', help: 'Escenario más calmado y menos agresivo.' },
  { value: 'other', label: 'Otra idea', help: 'Úsala si no encaja en las opciones anteriores.' },
]

const HORIZONTES = [
  { value: '1d', label: '1 día' },
  { value: '4h', label: 'Horas' },
  { value: '1w', label: '1 semana' },
]

const EMPTY_INITIAL_DATA = Object.freeze({})

const enfoqueHelp = (value) => ENFOQUES.find(item => item.value === value)?.help || ''

const buildRules = (form, initial = {}) => ({
  timeframe: form.timeframe || '1d',
  indicators: initial.models || ['prophet', 'arima', 'sma'],
  entry_rules: [
    {
      indicator: 'IDEA_ENTRADA',
      operator: '==',
      value: form.target_tickers || initial.ticker || 'ACTIVO',
      description: form.entry_note || 'Entrada cuando la predicción confirme el escenario descrito.',
    },
  ],
  exit_rules: [
    {
      indicator: 'GESTION_RIESGO',
      operator: '==',
      value: 'CONTROL',
      description: form.exit_note || 'Salida si el escenario deja de cumplirse o aparece pérdida relevante.',
    },
  ],
  filters: [],
  prediction_config: {
    ticker: form.target_tickers || initial.ticker || '',
    direction: form.direction || 'alcista',
    models: initial.models || ['prophet', 'arima', 'sma'],
    horizon_days: initial.horizon || (form.timeframe === '1w' ? 7 : 1),
    historical_days: initial.historicalDays || 1825,
  },
  public_summary: {
    thesis: form.description,
    entry: form.entry_note,
    exit: form.exit_note,
  },
})

const emptyForm = (initial = {}) => ({
  name: initial.name || (initial.ticker ? `Predicción ${initial.ticker}` : ''),
  short_desc: initial.short_desc || `Predicción publicada para ${initial.ticker || 'un activo financiero'}.`,
  description: initial.description || 'Explica la idea principal de la predicción y por qué puede ser interesante.',
  category: initial.category || 'momentum',
  target_tickers: initial.ticker || '',
  mode: initial.mode || (initial.marketplace ? 'marketplace' : 'private'),
  price: Number(initial.price || 50),
  timeframe: initial.timeframe || '1d',
  direction: initial.direction || 'alcista',
  entry_note: initial.entry_note || 'Entrar si el precio acompaña la señal y la predicción mantiene confianza.',
  exit_note: initial.exit_note || 'Salir si la predicción se gira o el precio invalida la idea.',
})

export default function CreateStrategyModal({ open, onClose, onCreated, initialData = EMPTY_INITIAL_DATA }) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const initialDataKey = JSON.stringify(initialData || EMPTY_INITIAL_DATA)
  const [form, setForm] = useState(emptyForm(initialData))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(emptyForm(initialData))
      setError(null)
    }
  }, [open, initialDataKey])

  const isMarketplace = form.mode === 'marketplace'
  const canSave = useMemo(() => (
    form.name.trim().length >= 3 &&
    form.description.trim().length >= 12 &&
    form.target_tickers.trim().length >= 1 &&
    (!isMarketplace || Number(form.price) >= 1)
  ), [form.name, form.description, form.target_tickers, form.price, isMarketplace])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (action = 'save') => {
    if (!canSave || loading) return
    setLoading(true)
    setError(null)
    try {
      const publishNow = isMarketplace && action === 'publish'
      const payload = {
        name: form.name.trim(),
        short_desc: form.short_desc.trim(),
        description: form.description.trim(),
        category: form.category,
        target_tickers: form.target_tickers.trim().toUpperCase(),
        is_paid: isMarketplace,
        price: isMarketplace ? Number(form.price || 0) : 0,
        currency: 'MYC',
        rules: buildRules(form, initialData),
      }
      const created = await strategyService.create(payload)
      const finalStrategy = publishNow ? await strategyService.publish(created.id) : created
      toast.success(publishNow ? 'Predicción publicada en el marketplace' : 'Predicción guardada en tus estrategias')
      onCreated?.(finalStrategy)
      onClose?.()
    } catch (err) {
      const msg = err?.response?.data?.message || 'No se pudo guardar la predicción'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="md"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          borderRadius: fullScreen ? 0 : 3,
          border: fullScreen ? 0 : '1px solid rgba(168,85,247,.24)',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
            <StorefrontRounded sx={{ color: '#a78bfa', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={950} noWrap>Crear predicción</Typography>
              <Typography color="text.secondary" fontSize={13}>
                Guárdala para ti o publícala para venderla con MyCoins.
              </Typography>
            </Box>
          </Stack>
          <Button onClick={onClose} disabled={loading} color="inherit" sx={{ minWidth: 40, px: 1 }}>
            <Close />
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,.025)', borderColor: 'rgba(255,255,255,.09)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={900}>Destino</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={form.mode}
                onChange={(_, value) => value && setField('mode', value)}
                sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}
              >
                <ToggleButton value="private" sx={{ borderRadius: '10px !important', border: '1px solid rgba(168,85,247,.22)', px: 2 }}>
                  Guardar para mí
                </ToggleButton>
                <ToggleButton value="marketplace" sx={{ borderRadius: '10px !important', border: '1px solid rgba(168,85,247,.22)', px: 2 }}>
                  Publicar para vender
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary" mt={1.25}>
                {isMarketplace
                  ? 'La compra se hará únicamente con monedas internas. El comprador desbloquea el resumen completo y tú recibes las monedas.'
                  : 'Quedará en tu biblioteca privada para consultarla o publicarla más adelante.'}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <TextField
              autoFocus
              label="Nombre"
              placeholder="Ej: AAPL con posible impulso alcista"
              size="small"
              fullWidth
              value={form.name}
              onChange={e => setField('name', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <TextField
              select
              label="Tipo de idea"
              size="small"
              fullWidth
              value={form.category}
              onChange={e => setField('category', e.target.value)}
              helperText={enfoqueHelp(form.category)}
            >
              {ENFOQUES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Ticker"
              placeholder="AAPL"
              size="small"
              fullWidth
              value={form.target_tickers}
              onChange={e => setField('target_tickers', e.target.value.toUpperCase())}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Dirección esperada"
              size="small"
              fullWidth
              value={form.direction}
              onChange={e => setField('direction', e.target.value)}
            >
              <MenuItem value="alcista">Alcista</MenuItem>
              <MenuItem value="bajista">Bajista</MenuItem>
              <MenuItem value="lateral">Lateral</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Resumen visible"
              size="small"
              fullWidth
              inputProps={{ maxLength: 280 }}
              value={form.short_desc}
              onChange={e => setField('short_desc', e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Idea principal"
              multiline
              minRows={3}
              fullWidth
              value={form.description}
              onChange={e => setField('description', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Cuándo tendría sentido entrar"
              multiline
              minRows={2}
              fullWidth
              value={form.entry_note}
              onChange={e => setField('entry_note', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Cuándo saldría o dejaría de tener sentido"
              multiline
              minRows={2}
              fullWidth
              value={form.exit_note}
              onChange={e => setField('exit_note', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>Horizonte</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={form.timeframe}
              onChange={(_, v) => v && setField('timeframe', v)}
              sx={{ display: 'flex', flexWrap: 'wrap', gap: .75, mt: .5 }}
            >
              {HORIZONTES.map(tf => (
                <ToggleButton key={tf.value} value={tf.value} sx={{ borderRadius: '10px !important', border: '1px solid rgba(168,85,247,.22)', minWidth: 72 }}>
                  {tf.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Grid>

          <Grid item xs={12} md={6}>
            {isMarketplace ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(124,58,237,.08)', borderColor: 'rgba(168,85,247,.20)' }}>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <LockRounded sx={{ color: '#c4b5fd' }} />
                  <Typography fontWeight={900}>Precio de venta</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={1}>
                  El comprador pagará esta cantidad en MyCoins.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Precio: <strong>{Number(form.price).toFixed(0)} monedas</strong>
                </Typography>
                <Slider value={Number(form.price)} min={5} max={500} step={5}
                  onChange={(_, v) => setField('price', v)} />
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2.5, bgcolor: 'rgba(34,197,94,.045)', borderColor: 'rgba(34,197,94,.16)' }}>
                <Typography fontWeight={900}>Predicción privada</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                  No aparecerá en el marketplace y no tendrá precio.
                </Typography>
              </Paper>
            )}
          </Grid>

          <Grid item xs={12}>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip label="Prophet" sx={{ bgcolor: '#7c3aed22', color: '#c4b5fd', fontWeight: 900 }} />
              <Chip label="ARIMA" sx={{ bgcolor: '#7c3aed22', color: '#c4b5fd', fontWeight: 900 }} />
              <Chip label="SMA" sx={{ bgcolor: '#7c3aed22', color: '#c4b5fd', fontWeight: 900 }} />
              <Chip label="Contenido desbloqueable tras compra" sx={{ bgcolor: '#22c55e18', color: '#86efac', fontWeight: 900 }} />
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, flexWrap: 'wrap', gap: 1 }}>
        {!canSave && (
          <Typography color="text.secondary" fontSize={12} sx={{ mr: 'auto' }}>
            Completa nombre, ticker e idea principal para guardar.
          </Typography>
        )}
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button variant="outlined" startIcon={<Save />} disabled={loading || !canSave} onClick={() => submit('save')}>
          Guardar
        </Button>
        {isMarketplace && (
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} /> : <Publish />}
            disabled={loading || !canSave}
            onClick={() => submit('publish')}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', fontWeight: 900 }}
          >
            Publicar en marketplace
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
