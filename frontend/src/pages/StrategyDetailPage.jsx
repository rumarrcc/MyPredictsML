import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  Box, Typography, Chip, Button, Rating, Avatar, Divider,
  Alert, CircularProgress, Paper, Grid, TextField, Skeleton,
  Accordion, AccordionSummary, AccordionDetails, Stack, Tooltip,
} from '@mui/material'
import {
  ExpandMore, ShoppingCart, LockOpen, ArrowBack, Edit,
  Archive, Publish, Star, TrendingUp, Shield, Analytics,
  Lock, ContentCopy, AutoGraph, AccountBalanceWallet,
} from '@mui/icons-material'
import strategyService from '@/services/strategyService'
import coinPaymentService from '@/services/coinPaymentService'
import InsufficientCoinsModal from '@/components/coins/InsufficientCoinsModal'
import CopyToPredictionsModal from '@/components/strategies/CopyToPredictionsModal'

const CATEGORY_LABELS = {
  swing: 'Swing Trading', momentum: 'Momentum', mean_reversion: 'Mean Reversion',
  long_term: 'Largo Plazo', scalping: 'Scalping', breakout: 'Breakout',
  trend_following: 'Tendencia', contrarian: 'Contraria', other: 'Otra',
}

const getPriceCoins = (strategy) => Number(strategy?.price_coins ?? Math.max(0, Math.round(Number(strategy?.price || 0))))

function MetricBox({ label, value, color, subtitle }) {
  return (
    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h5" fontWeight={800} sx={{ color: color || 'text.primary' }}>
        {value ?? '—'}
      </Typography>
      <Typography variant="body2" fontWeight={600}>{label}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
    </Paper>
  )
}

function UnlockedStrategySummary({ strategy }) {
  const metrics = strategy.metrics || {}
  const rules = strategy.rules || {}
  const tickers = String(strategy.target_tickers || '').split(',').map(t => t.trim()).filter(Boolean)
  return (
    <Paper sx={{ p: 2.5, mb: 2.5, borderRadius: 3, border: '1px solid rgba(34,197,94,.24)', background: 'linear-gradient(135deg, rgba(34,197,94,.10), rgba(124,58,237,.08))' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
        <LockOpen sx={{ color: '#4ade80', fontSize: 34 }} />
        <Box sx={{ flex: 1 }}>
          <Typography fontWeight={950} color="#fff">Estrategia desbloqueada</Typography>
          <Typography color="text.secondary" fontSize={13}>
            Ya puedes ver el resumen operativo, copiarla a predicciones o añadirla a tus inversiones.
          </Typography>
        </Box>
        <Chip label={`Score ${metrics.sharpe_ratio ? `Sharpe ${Number(metrics.sharpe_ratio).toFixed(2)}` : 'validado'}`} sx={{ bgcolor: '#22c55e22', color: '#4ade80', fontWeight: 900 }} />
      </Stack>
      <Grid container spacing={1.4} sx={{ mt: 1.5 }}>
        <Grid item xs={12} sm={4}>
          <MetricBox label="Universo" value={tickers.slice(0, 3).join(', ') || 'Configurable'} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <MetricBox label="Horizonte" value={rules.horizon_days ? `${rules.horizon_days} días` : metrics.timeframe || '1D'} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <MetricBox label="Reglas" value={Array.isArray(rules.rules) ? rules.rules.length : rules.entry || rules.exit ? 'Entrada/salida' : 'Incluidas'} />
        </Grid>
      </Grid>
    </Paper>
  )
}

function RulesPanel({ rules }) {
  if (!rules) return null

  const renderCondition = (cond, idx) => (
    <Box key={idx} sx={{
      display: 'flex', alignItems: 'center', gap: 1, mb: 0.5,
      bgcolor: 'action.hover', borderRadius: 1, p: 1,
    }}>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
        {cond.indicator && <strong>{cond.indicator}</strong>}
        {cond.operator && ` ${cond.operator} `}
        {cond.value && <span style={{ color: '#2196f3' }}>{cond.value}</span>}
        {cond.description && <em style={{ color: '#888', marginLeft: 4 }}>({cond.description})</em>}
      </Typography>
    </Box>
  )

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={0.5}>⏱ Timeframe</Typography>
        <Chip label={rules.timeframe || '—'} size="small" sx={{ bgcolor: '#2196f322', color: '#2196f3' }} />
      </Box>

      {rules.entry_rules?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} color="#4caf50" mb={0.5}>
            🟢 Condiciones de Entrada
          </Typography>
          {rules.entry_rules.map((r, i) => renderCondition(r, i))}
        </Box>
      )}

      {rules.exit_rules?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} color="#f44336" mb={0.5}>
            🔴 Condiciones de Salida
          </Typography>
          {rules.exit_rules.map((r, i) => renderCondition(r, i))}
        </Box>
      )}

      {rules.indicators?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={0.5}>📊 Indicadores</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {rules.indicators.map((ind, i) => (
              <Chip key={i} label={ind} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      {rules.filters?.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} mb={0.5}>🔍 Filtros opcionales</Typography>
          {rules.filters.map((r, i) => renderCondition(r, i))}
        </Box>
      )}
    </Box>
  )
}

function LockedRulesPreview({ price, onBuy, buying }) {
  const fakeRules = ['RSI(14) cruza sobre 52 con volumen superior a la media', 'Confirmacion de tendencia en 1h y 4h', 'Stop dinamico por ATR y salida por perdida de momentum']
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 3 }}>
      <Box sx={{ filter: 'blur(7px)', opacity: 0.45, p: 2, bgcolor: 'rgba(255,255,255,.04)', border: '1px solid rgba(168,85,247,.16)' }}>
        <Typography variant="subtitle2" fontWeight={900} color="#4caf50" mb={1}>Condiciones de entrada</Typography>
        {fakeRules.map((rule, idx) => (
          <Box key={idx} sx={{ p: 1.2, mb: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,.05)' }}>
            <Typography fontFamily="monospace" fontSize={13}>{rule}</Typography>
          </Box>
        ))}
        <Typography variant="subtitle2" fontWeight={900} color="#f87171" mt={2} mb={1}>Gestion de riesgo</Typography>
        <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: 'rgba(255,255,255,.05)' }}>
          <Typography fontFamily="monospace" fontSize={13}>Take profit escalonado, trailing stop y filtro de volatilidad.</Typography>
        </Box>
      </Box>
      <Box sx={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3,
        background: 'linear-gradient(180deg, rgba(7,9,17,.25), rgba(7,9,17,.92))',
      }}>
        <Stack alignItems="center" spacing={1.3} textAlign="center" maxWidth={420}>
          <Lock sx={{ fontSize: 42, color: '#c4b5fd' }} />
          <Typography variant="h5" fontWeight={950}>Estrategia protegida</Typography>
          <Typography color="text.secondary">
            Compra la estrategia para ver reglas completas, parametros y poder copiarla a tu biblioteca.
          </Typography>
          <Button variant="contained" onClick={onBuy} disabled={buying} startIcon={buying ? <CircularProgress size={18} color="inherit" /> : <ShoppingCart />}>
            {buying ? 'Comprando...' : `Comprar con ${price}`}
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}

function ReviewForm({ strategyId, onSuccess, existingReview }) {
  const [rating,  setRating]  = useState(existingReview?.rating || 0)
  const [comment, setComment] = useState(existingReview?.comment || '')
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)

  const handleSubmit = async () => {
    if (!rating) { setErr('Selecciona una valoración'); return }
    setLoading(true); setErr(null)
    try {
      if (existingReview) {
        await strategyService.updateReview(strategyId, existingReview.id, rating, comment)
      } else {
        await strategyService.addReview(strategyId, rating, comment)
      }
      onSuccess()
    } catch (e) {
      setErr(e?.response?.data?.message || 'Error al enviar la reseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" mb={1} fontWeight={700}>
        {existingReview ? 'Editar mi reseña' : 'Añadir reseña'}
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Rating value={rating} onChange={(_, v) => setRating(v)} />
        <Typography variant="body2" color="text.secondary">
          {rating > 0 ? ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'][rating] : 'Sin valorar'}
        </Typography>
      </Box>
      <TextField
        multiline rows={3} fullWidth size="small"
        placeholder="Comparte tu experiencia con esta estrategia (opcional)…"
        value={comment} onChange={e => setComment(e.target.value)}
        sx={{ mb: 1.5 }}
      />
      <Button variant="contained" size="small" onClick={handleSubmit} disabled={loading}>
        {loading ? <CircularProgress size={16} /> : (existingReview ? 'Actualizar' : 'Publicar reseña')}
      </Button>
    </Box>
  )
}

export default function StrategyDetailPage() {
  const { id }             = useParams()
  const navigate           = useNavigate()
  const { user, isAuthenticated } = useAuth()

  const [strategy,       setStrategy]      = useState(null)
  const [reviews,        setReviews]       = useState([])
  const [loading,        setLoading]       = useState(true)
  const [buyMsg,         setBuyMsg]        = useState(null)
  const [buyErr,         setBuyErr]        = useState(null)
  const [actionMsg,      setActionMsg]     = useState(null)
  const [actionErr,      setActionErr]     = useState(null)
  const [buying,         setBuying]        = useState(false)
  const [copyingInvest,  setCopyingInvest] = useState(false)
  const [coinBalance,    setCoinBalance]   = useState(null)
  const [coinsModal,     setCoinsModal]    = useState({ open: false, details: {} })
  const [copyModalOpen,  setCopyModalOpen] = useState(false)

  const loadStrategy = async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        strategyService.getOne(id),
        strategyService.getReviews(id),
      ])
      setStrategy(s)
      setReviews(r)
    } catch {
      setStrategy(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStrategy() }, [id])

  useEffect(() => {
    if (!isAuthenticated) { setCoinBalance(null); return }
    coinPaymentService.balance()
      .then(data => setCoinBalance(data?.balance ?? 0))
      .catch(() => setCoinBalance(null))
  }, [isAuthenticated])

  const handleBuy = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setBuyMsg(null); setBuyErr(null)
    setBuying(true)
    try {
      const result = await strategyService.purchase(strategy.id)
      setBuyMsg(result?.message || 'Estrategia desbloqueada con monedas internas.')
      if (result?.strategy) setStrategy(result.strategy)
      await loadStrategy()
      setCopyModalOpen(true)
      coinPaymentService.balance().then(data => setCoinBalance(data?.balance ?? 0)).catch(() => {})
    } catch (e) {
      const data = e?.response?.data || {}
      if (data.error === 'INSUFFICIENT_COINS') setCoinsModal({ open: true, details: data })
      else setBuyErr(data.message || 'No se pudo completar la compra con monedas.')
    } finally {
      setBuying(false)
    }
  }

  const handleCopyStrategy = async () => {
    if (!strategy?.rules) {
      setActionErr('No hay reglas disponibles para copiar.')
      return
    }
    const payload = {
      name: strategy.name,
      version: strategy.version,
      category: strategy.category,
      target_tickers: strategy.target_tickers,
      rules: strategy.rules,
      metrics: strategy.metrics,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setActionMsg('Estrategia copiada al portapapeles.')
    } catch {
      setActionErr('No se pudo copiar la estrategia en este navegador.')
    }
  }

  const handleCopyToInvestments = async () => {
    if (!strategy?.id) return
    setCopyingInvest(true)
    setActionMsg(null)
    setActionErr(null)
    try {
      const ticker = strategy.target_tickers?.split(',')[0]?.trim() || 'AAPL'
      const result = await strategyService.copyToInvestments(strategy.id, { ticker, quantity: 1 })
      setActionMsg(result?.message || 'Predicción copiada a la cartera virtual.')
      navigate('/portfolio')
    } catch (e) {
      setActionErr(e?.response?.data?.message || 'No se pudo copiar a la cartera virtual.')
    } finally {
      setCopyingInvest(false)
    }
  }

  const handlePublish = async () => {
    try {
      await strategyService.publish(strategy.id)
      setActionMsg('✅ Estrategia publicada en el marketplace')
      loadStrategy()
    } catch (e) {
      setActionErr(e?.response?.data?.message || 'Error al publicar')
    }
  }

  const handleArchive = async () => {
    if (!window.confirm('¿Archivar esta estrategia? Dejará de estar visible en el marketplace.')) return
    try {
      await strategyService.archive(strategy.id)
      setActionMsg('Estrategia archivada')
      loadStrategy()
    } catch (e) {
      setActionErr(e?.response?.data?.message || 'Error al archivar')
    }
  }

  const isAuthor       = user && strategy && user.id === strategy.user_id
  const isAdmin_       = user?.role === 'admin'
  const canEdit        = isAuthor || isAdmin_
  const hasPurchased   = strategy?.already_purchased === true
  const purchaseStatus = strategy?.purchase_status
  const isPending      = purchaseStatus === 'pending'
  const hasAccess      = hasPurchased || isAuthor || isAdmin_
  const myReview       = reviews.find(r => r.user_id === user?.id)

  if (loading) return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: 4 }}>
      <Skeleton variant="text" height={60} width="60%" sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={300} />
    </Box>
  )

  if (!strategy) return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h5" color="text.secondary">Estrategia no encontrada</Typography>
      <Button onClick={() => navigate('/marketplace')} sx={{ mt: 2 }}>Volver al marketplace</Button>
    </Box>
  )

  const m = strategy.metrics

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/marketplace')} sx={{ mb: 2, color: 'text.secondary' }}>
        Volver al marketplace
      </Button>

      {buyMsg    && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setBuyMsg(null)}>{buyMsg}</Alert>}
      {buyErr    && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setBuyErr(null)}>{buyErr}</Alert>}
      {actionMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionMsg(null)}>{actionMsg}</Alert>}
      {actionErr && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setActionErr(null)}>{actionErr}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Box>
                {strategy.is_featured && (
                  <Chip label="⭐ Destacada" size="small" sx={{ bgcolor: '#f59e0b', color: '#000', mb: 1, fontWeight: 700 }} />
                )}
                <Typography variant="h4" fontWeight={800}>{strategy.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  por <strong>@{strategy.author_username}</strong>
                  {strategy.author_subscription === 'pro' && (
                    <Chip label="PRO" size="small" sx={{ ml: 0.5, height: 16, fontSize: 10, bgcolor: '#7c3aed22', color: '#b89eff' }} />
                  )}
                  {' · v' + strategy.version}
                  {strategy.published_at && (
                    <> · publicada {new Date(strategy.published_at).toLocaleDateString('es-ES')}</>
                  )}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                <Chip
                  label={CATEGORY_LABELS[strategy.category] || strategy.category}
                  size="small" variant="outlined"
                  sx={{ borderColor: '#2196f344', color: '#2196f3' }}
                />
                {strategy.target_tickers && (
                  <Typography variant="caption" color="text.secondary">
                    Tickers: {strategy.target_tickers}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {strategy.average_rating != null && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Rating value={strategy.average_rating} precision={0.1} readOnly size="small" />
                  <Typography variant="body2" color="text.secondary">
                    {Number(strategy.average_rating).toFixed(1)} ({strategy.reviews_count} reseñas)
                  </Typography>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary">
                🛒 {strategy.times_purchased} compras
              </Typography>
              <Typography variant="body2" color="text.secondary">
                👁 {strategy.views_count} visitas
              </Typography>
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
              {strategy.description || 'Sin descripción disponible.'}
            </Typography>
          </Paper>

          {m && (
            <Paper sx={{ p: 3, mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700} mb={2}>
                📈 Métricas de Backtest
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Retorno total" value={m.total_return != null ? `${m.total_return > 0 ? '+' : ''}${Number(m.total_return).toFixed(1)}%` : null} color={m.total_return > 0 ? '#4caf50' : '#f44336'} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Win Rate" value={m.win_rate != null ? `${Number(m.win_rate).toFixed(0)}%` : null} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Sharpe Ratio" value={m.sharpe_ratio != null ? Number(m.sharpe_ratio).toFixed(2) : null} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Max Drawdown" value={m.max_drawdown != null ? `${Number(m.max_drawdown).toFixed(1)}%` : null} color="#f44336" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Nº Operaciones" value={m.trades_count} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <MetricBox label="Profit Factor" value={m.profit_factor != null ? Number(m.profit_factor).toFixed(2) : null} />
                </Grid>
                {m.ticker_tested && (
                  <Grid item xs={6} sm={3}>
                    <MetricBox label="Ticker testado" value={m.ticker_tested} />
                  </Grid>
                )}
                {m.backtest_from && (
                  <Grid item xs={6} sm={3}>
                    <MetricBox label="Período" value={`${m.backtest_from} → ${m.backtest_to}`} subtitle="Intervalo backtest" />
                  </Grid>
                )}
              </Grid>
            </Paper>
          )}

          <Paper sx={{ p: 3, mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              ⚙️ Reglas de la Estrategia
            </Typography>

            {hasAccess ? (
              strategy.rules ? (
                <>
                  <UnlockedStrategySummary strategy={strategy} />
                  <RulesPanel rules={strategy.rules} />
                </>
              ) : (
                <>
                  <UnlockedStrategySummary strategy={strategy} />
                  <Typography color="text.secondary">El autor aún no ha definido las reglas detalladas.</Typography>
                </>
              )

            ) : isPending ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Box sx={{ fontSize: 48, mb: 1 }}>⏳</Box>
                <Typography variant="h6" fontWeight={700} mb={0.5}>
                  Pago pendiente de confirmación
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2} maxWidth={400} mx="auto">
                  Tu solicitud de compra está registrada. El acceso completo a las reglas
                  se desbloqueará automáticamente cuando el pago sea confirmado.
                </Typography>
                <Alert severity="info" sx={{ textAlign: 'left', maxWidth: 400, mx: 'auto' }}>
                  Si realizaste el pago y llevas más de 24h esperando, contacta con soporte
                  indicando tu nombre de usuario y el ID de estrategia <strong>{strategy.id}</strong>.
                </Alert>
              </Box>

            ) : (
              <LockedRulesPreview
                price={strategy.is_paid ? `${getPriceCoins(strategy)} monedas` : 'gratis'}
                onBuy={handleBuy}
                buying={buying}
              />
            )}
          </Paper>

          <Paper sx={{ p: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              💬 Reseñas ({reviews.length})
            </Typography>

            {isAuthenticated && hasPurchased && !isAuthor && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                <ReviewForm
                  strategyId={strategy.id}
                  existingReview={myReview}
                  onSuccess={loadStrategy}
                />
              </Box>
            )}

            {reviews.length === 0 ? (
              <Typography color="text.secondary">Aún no hay reseñas. ¡Sé el primero en valorar esta estrategia!</Typography>
            ) : (
              reviews.map(r => (
                <Box key={r.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: '#2196f3', fontSize: 12 }}>
                        {r.username?.[0]?.toUpperCase() || 'U'}
                      </Avatar>
                      <Typography variant="body2" fontWeight={600}>@{r.username}</Typography>
                      <Rating value={r.rating} readOnly size="small" />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(r.created_at).toLocaleDateString('es-ES')}
                    </Typography>
                  </Box>
                  {r.comment && (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 4.5 }}>
                      {r.comment}
                    </Typography>
                  )}
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', position: 'sticky', top: 80 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              {strategy.is_paid ? (
                <>
                  <Typography variant="h3" fontWeight={800} color="#4caf50">
                    {getPriceCoins(strategy)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">monedas internas</Typography>
                  {isAuthenticated && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Saldo: {coinBalance ?? '-'} monedas
                    </Typography>
                  )}
                </>
              ) : (
                <Chip label="ESTRATEGIA GRATUITA" sx={{ bgcolor: '#4caf5022', color: '#4caf50', fontWeight: 700, fontSize: 14, p: 1 }} />
              )}
            </Box>

            {isAuthor ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary" textAlign="center" mb={1}>
                  Esta es tu estrategia
                </Typography>
                {strategy.status === 'draft' && (
                  <Button variant="contained" startIcon={<Publish />} onClick={handlePublish} fullWidth>
                    Publicar en marketplace
                  </Button>
                )}
                {strategy.status === 'published' && (
                  <Button variant="outlined" color="warning" startIcon={<Archive />} onClick={handleArchive} fullWidth>
                    Archivar
                  </Button>
                )}
                <Button variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/strategies?edit=${strategy.id}`)} fullWidth>
                  Editar estrategia
                </Button>
              </Box>

            ) : hasPurchased ? (
              <Box sx={{ textAlign: 'center' }}>
                <Chip
                  label="✅ Acceso completo"
                  sx={{ bgcolor: '#4caf5022', color: '#4caf50', fontWeight: 700, mb: 2, p: 1 }}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Puedes ver las reglas completas en el panel de arriba.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<ContentCopy />}
                  onClick={handleCopyStrategy}
                  disabled={!strategy.rules}
                  fullWidth
                  sx={{ mt: 2 }}
                >
                  Copiar estrategia
                </Button>
              </Box>

            ) : isPending ? (
              <Box sx={{ textAlign: 'center' }}>
                <Alert severity="warning" icon={false} sx={{ mb: 2 }}>
                  Pago pendiente de confirmación. Contacta con soporte si llevas más de 24h.
                </Alert>
              </Box>

            ) : (
              <Box>
                <Button
                  variant="contained" fullWidth size="large"
                  startIcon={<ShoppingCart />}
                  onClick={handleBuy}
                  disabled={buying}
                  sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, py: 1.5, mb: 1.5 }}
                >
                  {buying ? 'Comprando...' : (strategy.is_paid ? `Comprar - ${getPriceCoins(strategy)} monedas` : 'Desbloquear gratis')}
                </Button>
                <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
                  Se descuenta de tu saldo de monedas internas.
                </Typography>
                {strategy.is_paid && (
                  <Button variant="text" size="small" fullWidth onClick={() => navigate('/coins/buy')} sx={{ mt: 0.5 }}>
                    Comprar monedas
                  </Button>
                )}
              </Box>
            )}

            {hasAccess && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Button
                  variant="outlined" fullWidth
                  startIcon={<AutoGraph />}
                  onClick={() => setCopyModalOpen(true)}
                  sx={{ borderColor: '#7c3aed', color: '#b89eff', fontWeight: 700 }}
                >
                  Copiar a Mis Predicciones ML
                </Button>
                <Button
                  variant="outlined" fullWidth
                  startIcon={copyingInvest ? <CircularProgress size={16} color="inherit" /> : <AccountBalanceWallet />}
                  onClick={handleCopyToInvestments}
                  disabled={copyingInvest}
                  sx={{ mt: 1, borderColor: '#22c55e66', color: '#86efac', fontWeight: 700 }}
                >
                  Copiar a cartera virtual
                </Button>
                <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.75}>
                  Genera predicciones ML o crea una posición virtual desde esta estrategia
                </Typography>
              </Box>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Estado</Typography>
                <Chip
                  label={strategy.status}
                  size="small"
                  color={strategy.status === 'published' ? 'success' : strategy.status === 'draft' ? 'warning' : 'default'}
                  sx={{ fontWeight: 700, fontSize: 10 }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Versión</Typography>
                <Typography variant="caption">v{strategy.version}</Typography>
              </Box>
              {strategy.times_purchased > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Compras</Typography>
                  <Typography variant="caption">{strategy.times_purchased}</Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <InsufficientCoinsModal
        open={coinsModal.open}
        details={coinsModal.details}
        onClose={() => setCoinsModal({ open: false, details: {} })}
      />

      {strategy && (
        <CopyToPredictionsModal
          open={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          strategy={{ id: strategy.id, name: strategy.name, ticker: strategy.target_tickers?.split(',')[0]?.trim() || 'AAPL' }}
          onDone={loadStrategy}
        />
      )}
    </Box>
  )
}
