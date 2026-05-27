import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { Save, Settings, Tune, NotificationsActive, Shield } from '@mui/icons-material'
import { toast } from 'react-toastify'
import { authService } from '@/services/authService'
import { getMeThunk } from '@/store/slices/authSlice'

const DEFAULT_SETTINGS = {
  default_ticker: 'AAPL',
  default_horizon_days: 20,
  default_historical_days: 1825,
  risk_profile: 'moderate',
  trading_style_default: 'swing',
  preferred_market: 'US',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  landing_after_login: '/dashboard',
  email_alerts: true,
  prediction_notifications: true,
  marketplace_notifications: true,
  public_profile: true,
  show_predictions_on_profile: true,
  compact_dashboard: false,
}

export default function SettingsPage() {
  const dispatch = useDispatch()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    authService.getSettings()
      .then(data => setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }))
      .catch(() => toast.error('No se pudieron cargar los ajustes.'))
      .finally(() => setLoading(false))
  }, [])

  const setField = (field, value) => setSettings(prev => ({ ...prev, [field]: value }))

  const save = async () => {
    setSaving(true)
    try {
      const data = await authService.updateSettings(settings)
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) })
      await dispatch(getMeThunk()).unwrap()
      toast.success('Ajustes guardados')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudieron guardar los ajustes.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '60vh' }}>
        <CircularProgress />
      </Stack>
    )
  }

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 }, py: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={3}>
        <Settings sx={{ color: '#7c3aed', fontSize: 36 }} />
        <Box>
          <Typography variant="h4" fontWeight={950}>Ajustes</Typography>
          <Typography color="text.secondary">Configura tu cuenta, experiencia de trading y avisos de MyPredicts.</Typography>
        </Box>
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        Estos ajustes personalizan la experiencia de analisis, mercado y notificaciones.
      </Alert>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <Tune sx={{ color: '#22c55e' }} />
                <Typography variant="h6" fontWeight={900}>Predicciones y mercado</Typography>
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Ticker por defecto" value={settings.default_ticker} onChange={(e) => setField('default_ticker', e.target.value.toUpperCase())} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth type="number" label="Horizonte ML por defecto" value={settings.default_horizon_days} onChange={(e) => setField('default_horizon_days', Number(e.target.value))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth type="number" label="Historico por defecto" value={settings.default_historical_days} onChange={(e) => setField('default_historical_days', Number(e.target.value))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Perfil de riesgo</InputLabel>
                    <Select label="Perfil de riesgo" value={settings.risk_profile} onChange={(e) => setField('risk_profile', e.target.value)}>
                      <MenuItem value="conservative">Conservador</MenuItem>
                      <MenuItem value="moderate">Moderado</MenuItem>
                      <MenuItem value="aggressive">Agresivo</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Estilo principal</InputLabel>
                    <Select label="Estilo principal" value={settings.trading_style_default} onChange={(e) => setField('trading_style_default', e.target.value)}>
                      <MenuItem value="intraday">Intradia</MenuItem>
                      <MenuItem value="swing">Swing</MenuItem>
                      <MenuItem value="long_term">Largo plazo</MenuItem>
                      <MenuItem value="quant">Quant</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Mercado preferido</InputLabel>
                    <Select label="Mercado preferido" value={settings.preferred_market} onChange={(e) => setField('preferred_market', e.target.value)}>
                      <MenuItem value="US">Estados Unidos</MenuItem>
                      <MenuItem value="EU">Europa</MenuItem>
                      <MenuItem value="GLOBAL">Global</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <NotificationsActive sx={{ color: '#38bdf8' }} />
                <Typography variant="h6" fontWeight={900}>Notificaciones y experiencia</Typography>
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Moneda visual</InputLabel>
                    <Select label="Moneda visual" value={settings.currency} onChange={(e) => setField('currency', e.target.value)}>
                      <MenuItem value="EUR">EUR</MenuItem>
                      <MenuItem value="USD">USD</MenuItem>
                      <MenuItem value="GBP">GBP</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Zona horaria" value={settings.timezone} onChange={(e) => setField('timezone', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Despues de login</InputLabel>
                    <Select label="Despues de login" value={settings.landing_after_login} onChange={(e) => setField('landing_after_login', e.target.value)}>
                      <MenuItem value="/dashboard">Dashboard</MenuItem>
                      <MenuItem value="/prediction">Predicciones ML</MenuItem>
                      <MenuItem value="/marketplace">Marketplace</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel control={<Switch checked={Boolean(settings.email_alerts)} onChange={(e) => setField('email_alerts', e.target.checked)} />} label="Recibir avisos por email" />
                  <FormControlLabel control={<Switch checked={Boolean(settings.prediction_notifications)} onChange={(e) => setField('prediction_notifications', e.target.checked)} />} label="Avisos de predicciones y modelos" />
                  <FormControlLabel control={<Switch checked={Boolean(settings.marketplace_notifications)} onChange={(e) => setField('marketplace_notifications', e.target.checked)} />} label="Avisos de marketplace" />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <Shield sx={{ color: '#f59e0b' }} />
                <Typography variant="h6" fontWeight={900}>Privacidad y presentacion</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                <FormControlLabel control={<Switch checked={Boolean(settings.public_profile)} onChange={(e) => setField('public_profile', e.target.checked)} />} label="Perfil visible para otros usuarios" />
                <FormControlLabel control={<Switch checked={Boolean(settings.show_predictions_on_profile)} onChange={(e) => setField('show_predictions_on_profile', e.target.checked)} />} label="Mostrar historial de predicciones en mi perfil" />
                <FormControlLabel control={<Switch checked={Boolean(settings.compact_dashboard)} onChange={(e) => setField('compact_dashboard', e.target.checked)} />} label="Dashboard compacto" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack direction="row" justifyContent="flex-end" mt={3}>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />} onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar ajustes'}
        </Button>
      </Stack>
    </Box>
  )
}

