/**
 * StrategiesPage — panel del creador:
 *   - Mis estrategias creadas (borradores, publicadas, archivadas)
 *   - Estrategias compradas
 *   - Formulario de creación / edición
 *   - Gestión de métricas de backtest
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  Box, Typography, Tabs, Tab, Grid, Card, CardContent, CardActions,
  Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel, FormControlLabel,
  Switch, Alert, CircularProgress, Skeleton, Divider, Stack,
  Accordion, AccordionSummary, AccordionDetails, Paper, Rating, Tooltip,
} from '@mui/material'
import {
  Add, Edit, Publish, Archive, Visibility, ShoppingCart,
  TrendingUp, ExpandMore, Save, Close, Lock, LockOpen,
  AutoGraph, Info,
} from '@mui/icons-material'
import strategyService from '@/services/strategyService'
import CreateStrategyModal from '@/components/strategies/CreateStrategyModal'

const CATEGORIES = [
  { value: 'swing',           label: 'Operacion de varios dias' },
  { value: 'momentum',        label: 'Impulso alcista'          },
  { value: 'mean_reversion',  label: 'Rebote a la media'       },
  { value: 'long_term',       label: 'Medio/largo plazo'       },
  { value: 'scalping',        label: 'Intradia corto'          },
  { value: 'breakout',        label: 'Ruptura de precio'       },
  { value: 'trend_following', label: 'Seguir tendencia'        },
  { value: 'contrarian',      label: 'Contraria'               },
  { value: 'other',           label: 'Otra'              },
]

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']
const INDICATORS = ['RSI', 'MACD', 'SMA20', 'SMA50', 'SMA200', 'EMA9', 'EMA21',
                    'Bollinger Bands', 'Volumen', 'ATR', 'Stochastic', 'Otro']
const OPERATORS  = ['<', '>', '<=', '>=', '==', 'cruce_alcista', 'cruce_bajista', 'mayor_que_media', 'menor_que_media']

// ── Formulario de reglas ──────────────────────────────────────────────────────
function RuleRow({ rule, onChange, onRemove }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Indicador</InputLabel>
        <Select value={rule.indicator || ''} label="Indicador" onChange={e => onChange({ ...rule, indicator: e.target.value })}>
          {INDICATORS.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Operador</InputLabel>
        <Select value={rule.operator || ''} label="Operador" onChange={e => onChange({ ...rule, operator: e.target.value })}>
          {OPERATORS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField size="small" label="Valor" value={rule.value || ''} sx={{ width: 90 }}
        onChange={e => onChange({ ...rule, value: e.target.value })} />
      <TextField size="small" label="Descripción" value={rule.description || ''} sx={{ flex: 1, minWidth: 120 }}
        onChange={e => onChange({ ...rule, description: e.target.value })} />
      <Button size="small" color="error" onClick={onRemove} sx={{ minWidth: 30, px: 0.5 }}>✕</Button>
    </Box>
  )
}

// ── Formulario completo de creación/edición ────────────────────────────────────
function StrategyForm({ editTarget, onClose, onSaved }) {
  const { user } = useAuth()
  const isPro    = Boolean(user?.subscription && user.subscription !== 'free') || user?.role === 'admin'

  const blank = {
    name: '', description: '', short_desc: '', category: 'swing',
    is_paid: false, price: '', currency: 'MYC', target_tickers: '',
    rules: {
      timeframe: '1d',
      indicators: [],
      entry_rules: [{ indicator: 'RSI', operator: '<', value: '30', description: 'RSI sobrevendido' }],
      exit_rules:  [{ indicator: 'RSI', operator: '>', value: '60', description: 'RSI sobrecomprado' }],
      filters: [],
    },
  }

  const [form,    setForm]    = useState(editTarget ? {
    name:           editTarget.name || '',
    description:    editTarget.description || '',
    short_desc:     editTarget.short_desc || '',
    category:       editTarget.category || 'swing',
    is_paid:        editTarget.is_paid || false,
    price:          editTarget.price || '',
    currency:       editTarget.currency || 'MYC',
    target_tickers: editTarget.target_tickers || '',
    rules:          editTarget.rules || blank.rules,
  } : blank)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)

  const updateRule = (section, idx, val) => {
    setForm(f => ({
      ...f,
      rules: {
        ...f.rules,
        [section]: f.rules[section].map((r, i) => i === idx ? val : r),
      },
    }))
  }
  const addRule = (section) => setForm(f => ({
    ...f,
    rules: { ...f.rules, [section]: [...(f.rules[section] || []), { indicator: '', operator: '<', value: '', description: '' }] },
  }))
  const removeRule = (section, idx) => setForm(f => ({
    ...f,
    rules: { ...f.rules, [section]: f.rules[section].filter((_, i) => i !== idx) },
  }))

  const handleSave = async () => {
    setLoading(true); setErr(null)
    const payload = { ...form, rules: form.rules }
    try {
      if (editTarget) {
        await strategyService.update(editTarget.id, payload)
      } else {
        await strategyService.create(payload)
      }
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message || 'Error al guardar la estrategia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <TextField fullWidth size="small" label="Nombre *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} sx={{ mb: 2 }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Categoría</InputLabel>
            <Select value={form.category} label="Categoría" onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth multiline rows={3} size="small" label="Descripción detallada *"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} sx={{ mb: 2 }} />
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth size="small" label="Resumen corto (máx. 280 caracteres)" inputProps={{ maxLength: 280 }}
            value={form.short_desc} onChange={e => setForm(f => ({ ...f, short_desc: e.target.value }))} sx={{ mb: 2 }} />
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth size="small" label="Tickers objetivo (ej: AAPL, TSLA, BTC-USD)"
            value={form.target_tickers} onChange={e => setForm(f => ({ ...f, target_tickers: e.target.value }))} sx={{ mb: 2 }} />
        </Grid>

        {/* Precio */}
        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={<Switch checked={form.is_paid} onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))}
              disabled={!isPro} />}
            label={isPro ? "Estrategia de pago" : "Solo PRO puede cobrar"}
          />
        </Grid>
        {form.is_paid && (
          <>
            <Grid item xs={6} sm={4}>
              <TextField fullWidth size="small" label="Precio en monedas" type="number" inputProps={{ min: 1, step: 1 }}
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField fullWidth size="small" label="Forma de pago" value="MyCoins" disabled />
            </Grid>
          </>
        )}
      </Grid>

      {/* Reglas */}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle1" fontWeight={700} mb={1}>⚙️ Reglas de la estrategia</Typography>

      {/* Timeframe */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Timeframe:</Typography>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={form.rules.timeframe} onChange={e => setForm(f => ({ ...f, rules: { ...f.rules, timeframe: e.target.value } }))}>
            {TIMEFRAMES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
        <Tooltip title="Temporalidad de las velas utilizadas para evaluar las condiciones">
          <Info fontSize="small" color="action" />
        </Tooltip>
      </Box>

      {/* Entry rules */}
      <Accordion defaultExpanded sx={{ bgcolor: 'background.paper', mb: 1 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={700} color="#4caf50">🟢 Condiciones de Entrada *</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {form.rules.entry_rules?.map((r, i) => (
            <RuleRow key={i} rule={r} onChange={v => updateRule('entry_rules', i, v)} onRemove={() => removeRule('entry_rules', i)} />
          ))}
          <Button size="small" onClick={() => addRule('entry_rules')} startIcon={<Add />}>Añadir condición</Button>
        </AccordionDetails>
      </Accordion>

      {/* Exit rules */}
      <Accordion defaultExpanded sx={{ bgcolor: 'background.paper', mb: 1 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={700} color="#f44336">🔴 Condiciones de Salida *</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {form.rules.exit_rules?.map((r, i) => (
            <RuleRow key={i} rule={r} onChange={v => updateRule('exit_rules', i, v)} onRemove={() => removeRule('exit_rules', i)} />
          ))}
          <Button size="small" onClick={() => addRule('exit_rules')} startIcon={<Add />}>Añadir condición</Button>
        </AccordionDetails>
      </Accordion>

      {/* Filters */}
      <Accordion sx={{ bgcolor: 'background.paper' }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={700}>🔍 Filtros opcionales</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {(form.rules.filters || []).map((r, i) => (
            <RuleRow key={i} rule={r} onChange={v => updateRule('filters', i, v)} onRemove={() => removeRule('filters', i)} />
          ))}
          <Button size="small" onClick={() => addRule('filters')} startIcon={<Add />}>Añadir filtro</Button>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ display: 'flex', gap: 1, mt: 3, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          {editTarget ? 'Guardar cambios' : 'Crear estrategia'}
        </Button>
      </Box>
    </Box>
  )
}

// ── Card de estrategia en mis listas ─────────────────────────────────────────
function MyStrategyCard({ strategy, onRefresh, isPurchased }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)
  const [err,     setErr]     = useState(null)
  const [editing, setEditing] = useState(false)

  const statusColors = {
    draft:     { color: '#f59e0b', label: 'Borrador'   },
    published: { color: '#4caf50', label: 'Publicada'  },
    archived:  { color: '#888',    label: 'Archivada'  },
  }
  const sc = statusColors[strategy.status] || { color: '#888', label: strategy.status }

  const handlePublish = async () => {
    setLoading(true); setMsg(null); setErr(null)
    try {
      await strategyService.publish(strategy.id)
      setMsg('Publicada en el marketplace')
      onRefresh()
    } catch (e) {
      setErr(e?.response?.data?.message || 'Error al publicar')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!window.confirm('¿Archivar esta estrategia?')) return
    setLoading(true)
    try {
      await strategyService.archive(strategy.id)
      onRefresh()
    } catch (e) {
      setErr(e?.response?.data?.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card sx={{
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
        borderRadius: 2, mb: 2,
      }}>
        <CardContent>
          {msg && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setMsg(null)}>{msg}</Alert>}
          {err && <Alert severity="error"   sx={{ mb: 1 }} onClose={() => setErr(null)}>{err}</Alert>}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>{strategy.name}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                <Chip label={sc.label} size="small" sx={{ bgcolor: sc.color + '22', color: sc.color, fontWeight: 700, fontSize: 11 }} />
                {strategy.visibility === 'private' && <Chip label="Privada" size="small" sx={{ bgcolor: '#7c3aed22', color: '#c4b5fd', fontWeight: 700, fontSize: 11 }} />}
                {isPurchased && <Chip label="Comprada" size="small" sx={{ bgcolor: '#2196f322', color: '#2196f3', fontSize: 11 }} />}
                {strategy.is_paid
                  ? <Chip label={`${strategy.price_coins ?? Math.round(Number(strategy.price || 0))} monedas`} size="small" sx={{ bgcolor: '#4caf5022', color: '#4caf50', fontSize: 11 }} />
                  : <Chip label="Gratis" size="small" sx={{ bgcolor: '#4caf5011', color: '#4caf50', fontSize: 11 }} />
                }
                {strategy.is_featured && <Chip label="⭐ Destacada" size="small" sx={{ bgcolor: '#f59e0b22', color: '#f59e0b', fontSize: 11 }} />}
              </Box>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">
                {strategy.times_purchased} compras
              </Typography>
              {strategy.average_rating != null && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                  <Rating value={strategy.average_rating} readOnly size="small" precision={0.1} />
                  <Typography variant="caption">{Number(strategy.average_rating).toFixed(1)}</Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 13,
          }}>
            {strategy.short_desc || strategy.description || 'Sin descripción'}
          </Typography>

          {strategy.metrics && (
            <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
              {strategy.metrics.total_return != null && (
                <Typography variant="caption" sx={{ color: strategy.metrics.total_return >= 0 ? '#4caf50' : '#f44336' }}>
                  Retorno: {strategy.metrics.total_return > 0 ? '+' : ''}{Number(strategy.metrics.total_return).toFixed(1)}%
                </Typography>
              )}
              {strategy.metrics.win_rate != null && (
                <Typography variant="caption" color="text.secondary">
                  WR: {Number(strategy.metrics.win_rate).toFixed(0)}%
                </Typography>
              )}
              {strategy.metrics.sharpe_ratio != null && (
                <Typography variant="caption" color="text.secondary">
                  Sharpe: {Number(strategy.metrics.sharpe_ratio).toFixed(2)}
                </Typography>
              )}
            </Box>
          )}
        </CardContent>

        {!isPurchased && (
          <CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" startIcon={<Visibility />}
              onClick={() => navigate(`/marketplace/${strategy.id}`)}>
              Ver
            </Button>
            <Button size="small" variant="outlined" startIcon={<Edit />}
              onClick={() => setEditing(true)}>
              Editar
            </Button>
            {strategy.status === 'draft' && (
              <Button size="small" variant="contained" startIcon={<Publish />}
                onClick={handlePublish} disabled={loading}>
                Publicar
              </Button>
            )}
            {strategy.status === 'published' && (
              <Button size="small" variant="outlined" color="warning" startIcon={<Archive />}
                onClick={handleArchive} disabled={loading}>
                Archivar
              </Button>
            )}
          </CardActions>
        )}
      </Card>

      {/* Modal edición */}
      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between' }}>
          Editar estrategia
          <Button onClick={() => setEditing(false)} color="inherit"><Close /></Button>
        </DialogTitle>
        <DialogContent>
          <StrategyForm editTarget={strategy} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onRefresh() }} />
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function StrategiesPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate   = useNavigate()
  const [sparams]  = useSearchParams()

  const [tab,       setTab]       = useState(0)
  const [mine,      setMine]      = useState([])
  const [purchased, setPurchased] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)

  const isPro = Boolean(user?.subscription && user.subscription !== 'free') || user?.role === 'admin'

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const [m, p] = await Promise.all([
        strategyService.getMine(),
        strategyService.getPurchased(),
      ])
      setMine(m || [])
      setPurchased(p || [])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [isAuthenticated])

  useEffect(() => { loadAll() }, [loadAll])

  if (!isAuthenticated) {
    return (
      <Box sx={{ textAlign: 'center', py: 12 }}>
        <Typography variant="h5" mb={2}>Inicia sesión para gestionar tus estrategias</Typography>
        <Button variant="contained" onClick={() => navigate('/login')}>Iniciar sesión</Button>
      </Box>
    )
  }

  const byStatus = (status) => mine.filter(s => s.status === status)
  const drafts    = byStatus('draft')
  const published = byStatus('published')
  const archived  = byStatus('archived')

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} mb={0.5}>Mis estrategias</Typography>
          <Typography color="text.secondary">
            Guarda estrategias privadas o publica las que quieras vender.
          </Typography>
          {!isPro && (
            <Alert severity="info" sx={{ mt: 1, fontSize: 12 }}>
              Con cuenta PRO puedes vender tus estrategias. Los usuarios FREE pueden crear y compartir gratis.
            </Alert>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={() => navigate('/marketplace')}>
            Ir al marketplace
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>
            Nueva estrategia
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Creadas (${mine.length})`} />
        <Tab label={`Compradas (${purchased.length})`} />
      </Tabs>

      {loading ? (
        <Stack spacing={2}>
          {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={120} />)}
        </Stack>
      ) : tab === 0 ? (
        <>
          {/* Publicadas */}
          {published.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="#4caf50" mb={1}>Publicadas ({published.length})</Typography>
              {published.map(s => <MyStrategyCard key={s.id} strategy={s} onRefresh={loadAll} />)}
            </Box>
          )}

          {/* Borradores */}
          {drafts.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="#f59e0b" mb={1}>Privadas y borradores ({drafts.length})</Typography>
              {drafts.map(s => <MyStrategyCard key={s.id} strategy={s} onRefresh={loadAll} />)}
            </Box>
          )}

          {/* Archivadas */}
          {archived.length > 0 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="#888" mb={1}>
                🗃 Archivadas ({archived.length})
              </Typography>
              {archived.map(s => <MyStrategyCard key={s.id} strategy={s} onRefresh={loadAll} />)}
            </Box>
          )}

          {mine.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary" mb={1}>
                Aún no tienes estrategias
              </Typography>
              <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>
                Crear mi primera estrategia
              </Button>
            </Box>
          )}
        </>
      ) : (
        <>
          {purchased.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary" mb={1}>
                No has comprado ninguna estrategia aún
              </Typography>
              <Button variant="contained" onClick={() => navigate('/marketplace')}>
                Explorar marketplace
              </Button>
            </Box>
          ) : (
            <Box>
              {purchased.map(s => (
                <MyStrategyCard key={s.id} strategy={s} onRefresh={loadAll} />
              ))}
            </Box>
          )}
        </>
      )}

      {creating && (
        <CreateStrategyModal open={creating} onClose={() => setCreating(false)} onCreated={loadAll} />
      )}
    </Box>
  )
}
