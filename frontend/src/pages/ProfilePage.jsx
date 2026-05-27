import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Paper, TextField, Button, Avatar, Grid,
  Chip, CircularProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Alert, Divider,
} from '@mui/material'
import { Add, Close, Save, Person, TravelExplore, AutoGraph, HistoryRounded } from '@mui/icons-material'
import { updateProfileThunk } from '@/store/slices/authSlice'
import { authService } from '@/services/authService'
import coinPaymentService from '@/services/coinPaymentService'
import { toast } from 'react-toastify'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'

const sx = {
  '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'divider' }, '&:hover fieldset': { borderColor: '#7c3aed' } },
  '& label': { color: '#888' },
}

const emptyForm = user => ({
  username: user?.username || '',
  full_name: user?.full_name || '',
  avatar_url: user?.avatar_url || '',
  headline: user?.headline || '',
  location: user?.location || '',
  website: user?.website || '',
  trading_style: user?.trading_style || '',
  bio: user?.bio || '',
})

const COIN_REASON_LABELS = {
  stripe_test_purchase: 'Compra de monedas',
  roulette: 'Ruleta diaria',
  strategy_purchase: 'Compra en marketplace',
  strategy_sale: 'Venta en marketplace',
  marketplace_purchase: 'Compra en marketplace',
  marketplace_sale: 'Venta en marketplace',
  admin_adjustment: 'Ajuste admin',
}

export default function ProfilePage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user, isLoading } = useSelector(s => s.auth)
  const [form, setForm] = useState(emptyForm(user))
  const [newFav, setNewFav] = useState('')
  const [favorites, setFavorites] = useState(user?.favorites || [])
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [coinTransactions, setCoinTransactions] = useState([])

  useEffect(() => {
    setForm(emptyForm(user))
  }, [user])

  useEffect(() => {
    if (!user) return
    setHistoryLoading(true)
    authService.getProfilePredictions({ limit: 8 })
      .then(setHistory)
      .catch(() => setHistory({ ml_predictions: [] }))
      .finally(() => setHistoryLoading(false))
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    coinPaymentService.transactions()
      .then(data => setCoinTransactions((data?.items || []).slice(0, 8)))
      .catch(() => setCoinTransactions([]))
  }, [user?.id])

  const handleAddFav = () => {
    const t = newFav.trim().toUpperCase()
    if (t && !favorites.includes(t)) setFavorites(f => [...f, t])
    setNewFav('')
  }

  const handleRemoveFav = (t) => setFavorites(f => f.filter(x => x !== t))

  const handleSave = async () => {
    setSaving(true)
    try {
      await dispatch(updateProfileThunk({ ...form, favorites })).unwrap()
      toast.success('Perfil actualizado')
    } catch (err) {
      toast.error(err || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <Person sx={{ color: '#7c3aed', fontSize: 36 }} />
          <Box>
            <Typography variant="h4" fontWeight={950} color="#fff">Mi perfil</Typography>
            <Typography color="#888">{user?.email}</Typography>
          </Box>
        </Box>

        <Paper sx={{
          border: '1px solid', borderColor: 'divider', borderRadius: 4, p: { xs: 2.5, md: 4 }, mb: 3,
          background: 'radial-gradient(circle at 20% 0%, rgba(124,58,237,.26), transparent 36%), rgba(10,13,25,.92)',
        }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }} mb={3}>
            <Avatar src={form.avatar_url || undefined} sx={{ width: 96, height: 96, fontSize: 34, bgcolor: '#7c3aed', fontWeight: 900, border: '1px solid rgba(168,85,247,.42)' }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" fontWeight={950}>{form.full_name || form.username || 'Trader'}</Typography>
              <Typography color="#c4b5fd" fontWeight={700}>{form.headline || 'Trader cuantitativo en MyPredicts'}</Typography>
              <Typography variant="body2" color="text.secondary">
                Miembro desde {user?.created_at ? new Date(user.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '-'}
              </Typography>
            </Box>
            <Chip label={`Plan ${String(user?.subscription || 'free').toUpperCase()}`} sx={{ bgcolor: '#7c3aed33', color: '#ddd', fontWeight: 900 }} />
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Nombre de usuario" value={form.username} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Nombre visible" value={form.full_name} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="URL de avatar" value={form.avatar_url} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Titular profesional" value={form.headline} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Estilo de trading" value={form.trading_style} size="small" fullWidth sx={sx}
                placeholder="Swing, scalping, quant, largo plazo..."
                onChange={e => setForm(f => ({ ...f, trading_style: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Ubicación" value={form.location} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Web / enlace" value={form.website} size="small" fullWidth sx={sx}
                onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Biografía" value={form.bio} size="small" fullWidth multiline rows={4} sx={sx}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 4, p: 3, mb: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoGraph sx={{ color: '#22c55e' }} />
              <Box>
                <Typography fontWeight={900} color="#fff">Predicciones guardadas</Typography>
                <Typography color="text.secondary" fontSize={13}>Historial personal de predicciones ML.</Typography>
              </Box>
            </Stack>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button variant="outlined" size="small" onClick={() => navigate('/prediction')}>Nueva predicción</Button>
            </Stack>
          </Stack>

          {historyLoading ? (
            <Stack alignItems="center" py={3}><CircularProgress /></Stack>
          ) : (
            <Grid container spacing={2.5}>
              <Grid item xs={12}>
                <Typography fontWeight={900} mb={1}>Predicciones ML</Typography>
                <PredictionHistoryTable rows={history?.ml_predictions || []} onOpen={(row) => navigate(`/prediction?ticker=${row.ticker}&group=${row.group_id}`)} />
              </Grid>
            </Grid>
          )}

          {!historyLoading && !history?.ml_predictions?.length && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Todavía no hay predicciones guardadas. Genera una predicción ML para construir tu historial.
            </Alert>
          )}
        </Paper>

        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 4, p: 3, mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <TravelExplore sx={{ color: '#8b5cf6' }} />
            <Typography fontWeight={900} color="#fff">Tickers favoritos</Typography>
          </Stack>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TickerAutocomplete
              value={newFav}
              onInputChange={setNewFav}
              onChange={(symbol) => setNewFav(symbol)}
              placeholder="Añadir ticker (ej: AAPL)"
              size="small"
              sx={{ flex: 1 }}
              textFieldProps={{ onKeyDown: e => e.key === 'Enter' && handleAddFav() }}
            />
            <Button variant="outlined" startIcon={<Add />} onClick={handleAddFav}
              sx={{ borderColor: '#7c3aed', color: '#b89eff', whiteSpace: 'nowrap' }}>
              Añadir
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {favorites.length ? favorites.map(t => (
              <Chip key={t} label={t}
                deleteIcon={<Close sx={{ fontSize: '14px !important' }} />}
                onDelete={() => handleRemoveFav(t)}
                sx={{ bgcolor: '#7c3aed22', color: '#b89eff', fontWeight: 700 }} />
            )) : (
              <Typography variant="body2" color="#555">Sin favoritos aún.</Typography>
            )}
          </Box>
        </Paper>

        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 4, p: 3, mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryRounded sx={{ color: '#a855f7' }} />
            <Box>
              <Typography fontWeight={900} color="#fff">Historial de monedas</Typography>
              <Typography color="text.secondary" fontSize={13}>Compras, ventas y recargas recientes.</Typography>
            </Box>
          </Stack>
          <Stack divider={<Divider flexItem />}>
            {coinTransactions.length ? coinTransactions.map(tx => {
              const signedAmount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
              return (
                <Stack key={tx.id} direction="row" justifyContent="space-between" alignItems="center" py={1.2} gap={2}>
                  <Box>
                    <Typography fontWeight={850}>{COIN_REASON_LABELS[tx.reason] || tx.reason || 'Movimiento de monedas'}</Typography>
                    <Typography color="text.secondary" fontSize={12}>
                      {tx.created_at ? new Date(tx.created_at).toLocaleString('es-ES') : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography fontWeight={950} color={signedAmount >= 0 ? '#4ade80' : '#f87171'}>
                      {signedAmount >= 0 ? '+' : ''}{signedAmount} monedas
                    </Typography>
                    <Typography color="text.secondary" fontSize={12}>Saldo: {tx.balance_after}</Typography>
                  </Box>
                </Stack>
              )
            }) : (
              <Typography color="text.secondary" fontSize={13}>Todavía no hay movimientos.</Typography>
            )}
          </Stack>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            onClick={handleSave}
            disabled={saving || isLoading}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 900, px: 4 }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

function PredictionHistoryTable({ rows, onOpen }) {
  if (!rows.length) return <Typography color="text.secondary" fontSize={13}>Sin predicciones ML guardadas.</Typography>
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Ticker</TableCell>
          <TableCell>Tendencia</TableCell>
          <TableCell>Fecha</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.group_id || row.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(row)}>
            <TableCell>{row.ticker}</TableCell>
            <TableCell><Chip size="small" label={row.trend === 'up' ? 'Alcista' : 'Bajista'} color={row.trend === 'up' ? 'success' : 'warning'} /></TableCell>
            <TableCell>{row.created_at ? new Date(row.created_at).toLocaleDateString('es-ES') : '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
