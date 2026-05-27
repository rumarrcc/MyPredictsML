import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Grid, Paper, Stack, Typography,
} from '@mui/material'
import {
  DescriptionRounded, DownloadRounded, OpenInNewRounded,
  ReceiptLongRounded, WorkspacePremiumRounded,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import { billingService } from '@/services/billingService'

export default function InvoicesPage() {
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)
  const [subInfo, setSubInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    billingService.getMySubscription()
      .then(setSubInfo)
      .catch(() => toast.error('No se pudo cargar la facturación.'))
      .finally(() => setLoading(false))
  }, [user, navigate])

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const { portal_url } = await billingService.createPortalSession()
      window.location.href = portal_url
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo abrir el portal de facturación.')
    } finally {
      setPortalLoading(false)
    }
  }

  const plan = subInfo?.effective_plan || user?.subscription || 'free'
  const subscription = subInfo?.subscription
  const hasStripeSub = subscription?.provider === 'stripe'
  const nextRenewal = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Sin renovación programada'

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h3" fontWeight={950}>Facturación</Typography>
          <Typography color="text.secondary">Consulta estado de suscripción, facturas y portal de cliente.</Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/billing')}>Volver a mi plan</Button>
      </Stack>

      {loading ? (
        <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 4 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                  <ReceiptLongRounded sx={{ color: '#a855f7' }} />
                  <Typography variant="h5" fontWeight={900}>Resumen de facturación</Typography>
                  <Chip label={`Plan ${String(plan).toUpperCase()}`} size="small" />
                </Stack>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, borderRadius: 3 }}>
                      <Typography color="text.secondary" fontSize={12}>Estado</Typography>
                      <Typography fontWeight={950}>{subscription?.status || 'Sin suscripción'}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, borderRadius: 3 }}>
                      <Typography color="text.secondary" fontSize={12}>Proveedor</Typography>
                      <Typography fontWeight={950}>{subscription?.provider || 'Manual / Free'}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, borderRadius: 3 }}>
                      <Typography color="text.secondary" fontSize={12}>Próxima renovación</Typography>
                      <Typography fontWeight={950}>{nextRenewal}</Typography>
                    </Paper>
                  </Grid>
                </Grid>

                {hasStripeSub ? (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Tus facturas y recibos oficiales están disponibles en el portal de Stripe.
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    No hay facturas Stripe todavía. Cuando contrates un plan, aparecerán en el portal de cliente.
                  </Alert>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button
                    variant="contained"
                    startIcon={<OpenInNewRounded />}
                    onClick={openPortal}
                    disabled={portalLoading || !hasStripeSub}
                  >
                    {portalLoading ? 'Abriendo...' : 'Abrir portal de facturación'}
                  </Button>
                  <Button variant="outlined" startIcon={<DownloadRounded />} disabled={!hasStripeSub}>
                    Descargar facturas desde Stripe
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={2}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <DescriptionRounded sx={{ color: '#60a5fa', mb: 1 }} />
                <Typography fontWeight={900}>Historial</Typography>
                <Typography color="text.secondary" fontSize={13}>Stripe conserva facturas, recibos, datos fiscales y métodos de pago del cliente.</Typography>
              </Paper>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <WorkspacePremiumRounded sx={{ color: '#a855f7', mb: 1 }} />
                <Typography fontWeight={900}>Suscripción</Typography>
                <Divider sx={{ my: 1.2 }} />
                <Typography color="text.secondary" fontSize={13}>Plan efectivo: {String(plan).toUpperCase()}</Typography>
                <Typography color="text.secondary" fontSize={13}>Estado: {subscription?.status || 'sin suscripción'}</Typography>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
