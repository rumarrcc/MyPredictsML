import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Grid, Paper, Stack, Typography,
} from '@mui/material'
import {
  AddCardRounded, CreditCardRounded, LockRounded, OpenInNewRounded,
  PaymentRounded, WorkspacePremiumRounded, AccountBalanceWalletRounded,
  AddRounded,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import { billingService } from '@/services/billingService'
import coinPaymentService from '@/services/coinPaymentService'

export default function PaymentMethodsPage() {
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)
  const [subInfo, setSubInfo] = useState(null)
  const [coinBalance, setCoinBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    Promise.all([
      billingService.getMySubscription(),
      coinPaymentService.balance().catch(() => null),
    ])
      .then(([subscription, coinData]) => {
        setSubInfo(subscription)
        setCoinBalance(coinData?.balance ?? null)
      })
      .catch(() => toast.error('No se pudo cargar tu información de pago.'))
      .finally(() => setLoading(false))
  }, [user, navigate])

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const { portal_url } = await billingService.createPortalSession()
      window.location.href = portal_url
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo abrir el portal de pagos.')
    } finally {
      setPortalLoading(false)
    }
  }

  const plan = subInfo?.effective_plan || user?.subscription || 'free'
  const hasStripeSub = subInfo?.subscription?.provider === 'stripe'

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h3" fontWeight={950}>Métodos de pago</Typography>
          <Typography color="text.secondary">Gestiona tarjetas, método predeterminado y datos de cobro.</Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/billing')}>Volver a mi plan</Button>
      </Stack>

      {loading ? (
        <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 4, mb: 2.5, background: 'linear-gradient(135deg, rgba(124,58,237,.22), rgba(9,12,24,.92))' }}>
              <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1.3} alignItems="center" mb={1}>
                      <AccountBalanceWalletRounded sx={{ color: '#c4b5fd' }} />
                      <Typography variant="h5" fontWeight={950}>Monedas internas</Typography>
                    </Stack>
                    <Typography variant="h3" fontWeight={950}>
                      {coinBalance ?? '-'} monedas
                    </Typography>
                    <Typography color="text.secondary" fontSize={13}>
                      Stripe recarga monedas internas desde /coins/buy. Esta pagina queda para tarjetas, portal Stripe y suscripciones.
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
                    <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/coins/buy')}>
                      Comprar monedas
                    </Button>
                    <Button variant="outlined" onClick={() => navigate('/wallet')}>
                      Ver historial
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 4 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                  <PaymentRounded sx={{ color: '#a855f7' }} />
                  <Typography variant="h5" fontWeight={900}>Pago principal</Typography>
                  <Chip label={`Plan ${String(plan).toUpperCase()}`} size="small" />
                </Stack>

                {hasStripeSub ? (
                  <Paper sx={{ p: 2.2, borderRadius: 3, mb: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                      <Box sx={{ width: 54, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(124,58,237,.18)', border: '1px solid rgba(168,85,247,.24)' }}>
                        <CreditCardRounded sx={{ color: '#c4b5fd' }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography fontWeight={900}>Método gestionado por Stripe</Typography>
                        <Typography color="text.secondary" fontSize={13}>Stripe guarda las tarjetas de forma segura. MyPredicts no almacena números de tarjeta.</Typography>
                      </Box>
                      <Chip label="Seguro" color="success" size="small" />
                    </Stack>
                  </Paper>
                ) : (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Todavía no tienes una suscripción Stripe activa. Elige un plan para añadir un método de pago.
                  </Alert>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button
                    variant="contained"
                    startIcon={<OpenInNewRounded />}
                    onClick={openPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? 'Abriendo...' : 'Gestionar tarjetas en Stripe'}
                  </Button>
                  <Button variant="outlined" startIcon={<AddCardRounded />} onClick={() => navigate('/billing')}>
                    Añadir desde un plan
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={2}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <LockRounded sx={{ color: '#39d98a', mb: 1 }} />
                <Typography fontWeight={900}>Seguridad</Typography>
                <Typography color="text.secondary" fontSize={13}>Los cambios de tarjeta, dirección fiscal y método predeterminado se gestionan en Stripe.</Typography>
              </Paper>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <WorkspacePremiumRounded sx={{ color: '#a855f7', mb: 1 }} />
                <Typography fontWeight={900}>Plan actual</Typography>
                <Typography color="text.secondary" fontSize={13}>Tu plan efectivo es {String(plan).toUpperCase()}.</Typography>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
