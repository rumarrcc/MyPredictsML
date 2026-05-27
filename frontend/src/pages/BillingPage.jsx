/**
 * BillingPage — /billing
 * Muestra el plan actual del usuario, la tabla de comparación de planes
 * y los botones de Stripe Checkout / Portal.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams }  from 'react-router-dom'
import { useDispatch, useSelector }       from 'react-redux'
import {
  Box, Container, Typography, Grid, Card, CardContent, Button, Chip,
  CircularProgress, Alert, Divider, Stack, List, ListItem, ListItemIcon,
  ListItemText, Tooltip,
} from '@mui/material'
import CheckCircleIcon           from '@mui/icons-material/CheckCircle'
import CancelIcon                from '@mui/icons-material/Cancel'
import StarIcon                  from '@mui/icons-material/Star'
import LockOpenIcon              from '@mui/icons-material/LockOpen'
import ManageAccountsIcon        from '@mui/icons-material/ManageAccounts'
import { toast }                 from 'react-toastify'
import { billingService }         from '@/services/billingService'
import PlanBadge                 from '@/components/common/PlanBadge'
import { getMeThunk }            from '@/store/slices/authSlice'

// ── Configuración de planes para la UI ────────────────────────────────────────
// dechever - 09/04/2026: preparé las pantallas de monedas y suscripción PRO para que el flujo de pago quedara claro.
const PLANS_UI = [
  {
    key:       'free',
    label:     'FREE',
    price:     '0€',
    period:    '/mes',
    color:     '#888',
    icon:      null,
    features: [
      { text: '3 alertas activas',       ok: true  },
      { text: 'Predicciones básicas',           ok: true  },
      { text: 'Sin backtesting',         ok: false },
      { text: 'Comprar estrategias',     ok: true  },
      { text: 'Vender estrategias',      ok: false },
      { text: 'Exportar datos',          ok: false },
      { text: '1 giro de ruleta/día',    ok: true  },
      { text: '1 cartera virtual',       ok: true  },
      { text: '10 tickers en watchlist', ok: true  },
    ],
  },
  {
    key:       'pro',
    label:     'PRO',
    price:     '9.99€',
    period:    '/mes',
    color:     '#2196f3',
    icon:      <StarIcon />,
    popular:   true,
    features: [
      { text: 'Alertas ilimitadas',          ok: true  },
      { text: 'Predicciones y analisis avanzados', ok: true  },
      { text: 'Backtesting ilimitado',       ok: true  },
      { text: 'Comprar estrategias',         ok: true  },
      { text: 'Vender estrategias',          ok: true  },
      { text: 'Exportar datos',              ok: true  },
      { text: '2 giros de ruleta/día',       ok: true  },
      { text: 'Carteras virtuales ilimitadas', ok: true },
      { text: 'Watchlist ilimitado',         ok: true  },
    ],
  },
]


// ── Tarjeta de plan ───────────────────────────────────────────────────────────
function PlanCard({ plan, currentPlan, onUpgrade, loading }) {
  const isCurrent = currentPlan === plan.key
  const isDowngrade = false
  const isFree = plan.key === 'free'
  const showBadge = isCurrent || (plan.popular && !isCurrent)

  return (
    <Card sx={{
      height:       '100%',
      width:        '100%',
      display:      'flex',
      flexDirection:'column',
      border:       isCurrent ? `2px solid ${plan.color}` : '1px solid rgba(255,255,255,0.08)',
      borderRadius: { xs: 3, sm: 4 },
      position:     'relative',
      overflow:     'hidden',
      bgcolor:      isCurrent ? `${plan.color}0f` : 'background.paper',
      backgroundImage: isCurrent
        ? `radial-gradient(circle at top right, ${plan.color}24, transparent 32%), linear-gradient(180deg, ${plan.color}0f, transparent 46%)`
        : 'linear-gradient(180deg, rgba(255,255,255,.035), transparent 45%)',
      boxShadow:    isCurrent ? `0 22px 55px ${plan.color}24` : '0 16px 40px rgba(0,0,0,.16)',
      transition:   'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
      '&:hover':    { transform: { sm: 'translateY(-4px)' }, boxShadow: `0 18px 50px ${plan.color}30` },
    }}>
      {plan.popular && !isCurrent && (
        <Chip
          label="Más popular"
          size="small"
          sx={{
            position: 'absolute', top: 14, right: 14,
            bgcolor: plan.color, color: '#000', fontWeight: 900, fontSize: 10, height: 24,
          }}
        />
      )}
      {isCurrent && (
        <Chip
          label="Plan actual"
          size="small"
          sx={{
            position: 'absolute', top: 14, right: 14,
            bgcolor: plan.color, color: '#fff',
            fontWeight: 900, fontSize: 10, height: 24,
          }}
        />
      )}

      <CardContent sx={{ flex: 1, p: { xs: 2.5, sm: 3 }, pt: { xs: showBadge ? 5.5 : 3, sm: showBadge ? 5.75 : 3 } }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" gap={1} mb={1} sx={{ minWidth: 0 }}>
          {plan.icon && <Box sx={{ color: plan.color }}>{plan.icon}</Box>}
          <Typography variant="h6" fontWeight={900} sx={{ color: plan.color, letterSpacing: '.03em' }}>
            {plan.label}
          </Typography>
        </Stack>

        {/* Precio */}
        <Stack direction="row" alignItems="baseline" gap={0.5} mb={{ xs: 2.5, sm: 3 }} flexWrap="wrap">
          <Typography
            variant="h3"
            fontWeight={950}
            color="text.primary"
            sx={{ fontSize: { xs: '2.4rem', sm: '2.85rem', md: 'clamp(2.35rem, 3vw, 3rem)' }, lineHeight: 1 }}
          >
            {plan.price}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={700}>{plan.period}</Typography>
        </Stack>

        <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,.10)' }} />

        {/* Features */}
        <List dense disablePadding sx={{ display: 'grid', gap: { xs: 0.75, sm: 0.5 } }}>
          {plan.features.map((f, i) => (
            <ListItem key={i} disablePadding sx={{ alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 28, pt: '2px' }}>
                {f.ok
                  ? <CheckCircleIcon sx={{ fontSize: 16, color: plan.color }} />
                  : <CancelIcon     sx={{ fontSize: 16, color: 'text.disabled' }} />
                }
              </ListItemIcon>
              <ListItemText
                primary={f.text}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: 700,
                  color: f.ok ? 'text.primary' : 'text.disabled',
                  sx: { fontSize: { xs: 13, sm: 14 }, lineHeight: 1.45 },
                }}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>

      {/* CTA */}
      <Box sx={{ p: { xs: 2.5, sm: 3 }, pt: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {isCurrent ? (
          <Button fullWidth variant="outlined" disabled sx={{ borderColor: plan.color, color: plan.color, borderRadius: 2.5, py: 1.15 }}>
            Plan actual
          </Button>
        ) : isFree ? (
          <Button fullWidth variant="outlined" color="inherit" disabled={isDowngrade} sx={{ borderRadius: 2.5, py: 1.15 }}>
            {isDowngrade ? 'No disponible' : 'Gratis siempre'}
          </Button>
        ) : (
          <>
            {/* Pagar con Stripe */}
            <Button
              fullWidth variant="contained"
              onClick={() => onUpgrade(plan.key)}
              disabled={loading || isDowngrade}
              sx={{ bgcolor: plan.color, color: '#fff', fontWeight: 900, borderRadius: 2.5, py: 1.15, '&:hover': { filter: 'brightness(1.1)', bgcolor: plan.color } }}
            >
              {loading ? <CircularProgress size={20} /> : isDowngrade ? 'Gestionar plan' : `Pasar a ${plan.label}`}
            </Button>
          </>
        )}
      </Box>
    </Card>
  )
}


// ── BillingPage ───────────────────────────────────────────────────────────────
export default function BillingPage() {
  const navigate      = useNavigate()
  const dispatch      = useDispatch()
  const [params]      = useSearchParams()
  const { user }      = useSelector(s => s.auth)

  const [subInfo,       setSubInfo]      = useState(null)
  const [loadingInfo,   setLoadingInfo]  = useState(true)
  const [loadingPlan,   setLoadingPlan]  = useState(null)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    fetchSubscription()
  }, [user])

  // Notificaciones de vuelta desde Stripe
  useEffect(() => {
    if (params.get('success') === '1') {
      toast.success('¡Suscripción activada correctamente! Bienvenido a tu nuevo plan.')
      fetchSubscription()
    }
    if (params.get('canceled') === '1') {
      toast.info('Has cancelado el proceso de pago. Tu plan no ha cambiado.')
    }
  }, [])

  useEffect(() => {
    async function syncStripeReturn() {
      const sessionId = params.get('session_id')
      if (params.get('success') !== '1' || !sessionId) return

      try {
        await billingService.syncCheckoutSession(sessionId)
        await fetchSubscription()
        await dispatch(getMeThunk()).unwrap()
      } catch (err) {
        console.error(err)
        toast.warning('Pago completado, pero aun estamos sincronizando tu plan. Recarga en unos segundos.')
        await fetchSubscription()
      }
    }

    syncStripeReturn()
  }, [dispatch, params])

  async function fetchSubscription() {
    try {
      setLoadingInfo(true)
      const data = await billingService.getMySubscription()
      setSubInfo(data)
    } catch (err) {
      console.error(err)
      toast.error('Error cargando información de suscripción.')
    } finally {
      setLoadingInfo(false)
    }
  }

  async function handleUpgrade(plan) {
    setLoadingPlan(plan)
    try {
      const { checkout_url } = await billingService.createCheckoutSession(plan)
      window.location.href = checkout_url
    } catch (err) {
      const msg = err.response?.data?.message || 'Error iniciando el proceso de pago.'
      toast.error(msg)
    } finally {
      setLoadingPlan(null)
    }
  }

  async function handleManagePortal() {
    setPortalLoading(true)
    try {
      const { portal_url } = await billingService.createPortalSession()
      window.location.href = portal_url
    } catch (err) {
      const msg = err.response?.data?.message || 'Error abriendo el portal de facturación.'
      toast.error(msg)
    } finally {
      setPortalLoading(false)
    }
  }

  const rawEffectivePlan = subInfo?.effective_plan || user?.subscription || 'free'
  const effectivePlan = rawEffectivePlan === 'premium' ? 'pro' : rawEffectivePlan
  const activeSub     = subInfo?.subscription
  const trials        = subInfo?.active_trials || []

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 3, sm: 5, md: 6 },
        backgroundImage: 'radial-gradient(circle at 15% 5%, rgba(14,165,233,.12), transparent 26%), radial-gradient(circle at 85% 10%, rgba(34,197,94,.10), transparent 24%)',
      }}
    >
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box textAlign="center" mb={{ xs: 4, md: 6 }}>
          <Typography variant="h3" fontWeight={950} color="text.primary" gutterBottom sx={{ fontSize: { xs: 34, sm: 44, md: 52 }, letterSpacing: '-0.05em' }}>
            Planes y precios
          </Typography>
          <Typography variant="body1" color="text.secondary" maxWidth={620} mx="auto" sx={{ fontSize: { xs: 14, sm: 16 } }}>
            MyPredicts usa un único plan PRO: todas las funciones avanzadas por 9,99 euros al mes.
          </Typography>
        </Box>

        {/* Estado actual */}
        {loadingInfo ? (
          <Box textAlign="center" mb={4}><CircularProgress /></Box>
        ) : (
          <Box mb={{ xs: 3, md: 4 }}>
            <Card sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: { xs: 3, sm: 4 }, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 18px 48px rgba(0,0,0,.16)' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} justifyContent="space-between">
                <Stack direction="row" alignItems="center" gap={2}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(14,165,233,.12)', flexShrink: 0 }}>
                    <LockOpenIcon sx={{ color: '#38bdf8' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Tu plan actual</Typography>
                    <Stack direction="row" alignItems="center" gap={1} mt={0.5}>
                      <PlanBadge plan={effectivePlan} size="medium" />
                      {trials.length > 0 && (
                        <Tooltip title={`Trial activo hasta ${trials[0].expires_at ? new Date(trials[0].expires_at).toLocaleDateString() : 'sin límite'}`}>
                          <Chip label="Trial activo" size="small" color="warning" sx={{ fontWeight: 700, fontSize: 10 }} />
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                </Stack>

                {activeSub?.provider === 'stripe' && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={portalLoading ? <CircularProgress size={14} /> : <ManageAccountsIcon />}
                    onClick={handleManagePortal}
                    disabled={portalLoading}
                    sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, borderRadius: 2.5 }}
                  >
                    Gestionar suscripción
                  </Button>
                )}
              </Stack>

              {activeSub && (
                <Box mt={2} pt={2} borderTop="1px solid" borderColor="divider">
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={3}>
                    {activeSub.current_period_end && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Próxima renovación</Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {new Date(activeSub.current_period_end).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </Typography>
                      </Box>
                    )}
                    {activeSub.cancel_at_period_end && (
                      <Alert severity="warning" sx={{ py: 0, flex: 1 }}>
                        Tu suscripción se cancelará al final del período actual.
                      </Alert>
                    )}
                  </Stack>
                </Box>
              )}
            </Card>
          </Box>
        )}

        {/* Tabla de planes */}
        <Grid container spacing={{ xs: 2.25, md: 3 }} alignItems="stretch">
          {PLANS_UI.map(plan => (
            <Grid item xs={12} md={6} key={plan.key} sx={{ display: 'flex' }}>
              <PlanCard
                plan={plan}
                currentPlan={effectivePlan}
                onUpgrade={handleUpgrade}
                loading={loadingPlan === plan.key}
              />
            </Grid>
          ))}
        </Grid>

        {/* Info adicional */}
        <Box mt={6} textAlign="center">
          <Typography variant="body2" color="text.secondary" mb={1}>
            Todos los pagos son procesados por Stripe de forma segura.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ¿Tienes preguntas? Consulta nuestra{' '}
            <a href="mailto:support@mypredicts.io" style={{ color: '#7c3aed' }}>guía de soporte</a>.
          </Typography>
        </Box>
      </Container>

    </Box>
  )
}
