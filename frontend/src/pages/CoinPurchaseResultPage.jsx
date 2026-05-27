import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import {
  AccountBalanceWalletRounded,
  CheckCircleRounded,
  ErrorOutlineRounded,
  HourglassTopRounded,
  PaidRounded,
  ReceiptLongRounded,
  RefreshRounded,
  ShoppingCartRounded,
  StorefrontRounded,
} from '@mui/icons-material'
import { getMeThunk } from '@/store/slices/authSlice'
import coinPaymentService from '@/services/coinPaymentService'

const STATUS_COPY = {
  paid: {
    color: 'success',
    icon: <CheckCircleRounded />,
    label: 'Monedas acreditadas',
    title: 'Compra completada',
    body: 'Stripe ha confirmado el pago y las monedas ya se han sumado a tu wallet.',
  },
  pending: {
    color: 'warning',
    icon: <HourglassTopRounded />,
    label: 'Procesando webhook',
    title: 'Pago recibido',
    body: 'Estamos esperando la confirmacion firmada de Stripe. Normalmente tarda unos segundos.',
  },
  cancelled: {
    color: 'default',
    icon: <ErrorOutlineRounded />,
    label: 'Checkout cancelado',
    title: 'Compra cancelada',
    body: 'No se han cargado monedas porque el checkout se cancelo antes de finalizar.',
  },
  failed: {
    color: 'error',
    icon: <ErrorOutlineRounded />,
    label: 'Pago fallido',
    title: 'No se pudo completar',
    body: 'Stripe marco el intento como fallido. Puedes intentarlo de nuevo con otro pago test.',
  },
}

function money(cents, currency) {
  const value = Number(cents || 0) / 100
  return `${value.toFixed(2)} ${String(currency || 'EUR').toUpperCase()}`
}

function shortId(value) {
  if (!value) return '-'
  const text = String(value)
  return text.length > 24 ? `${text.slice(0, 12)}...${text.slice(-8)}` : text
}

function SummaryItem({ label, value, accent }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'rgba(245,245,247,.52)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ mt: .35, fontWeight: 950, fontSize: accent ? { xs: 28, sm: 34 } : 15, color: accent ? '#ffe08a' : '#fff' }}>
        {value}
      </Typography>
    </Box>
  )
}

export default function CoinPurchaseResultPage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const purchaseId = searchParams.get('purchase_id')
  const sessionId = searchParams.get('session_id')
  const cancelledPath = location.pathname.includes('cancel')

  const [purchase, setPurchase] = useState(null)
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [polls, setPolls] = useState(0)

  const status = purchase?.status || (cancelledPath ? 'cancelled' : 'pending')
  const copy = STATUS_COPY[status] || STATUS_COPY.pending

  const refresh = useCallback(async (silent = false) => {
    if (!purchaseId) {
      setError('No se ha recibido el identificador de compra.')
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const [purchaseData, balanceData] = await Promise.all([
        coinPaymentService.purchase(purchaseId, sessionId),
        coinPaymentService.balance().catch(() => null),
      ])
      setPurchase(purchaseData)
      setBalance(balanceData?.balance ?? null)
      setError('')
      if (purchaseData?.status === 'paid') {
        window.dispatchEvent(new Event('mypredicts:coins-updated'))
        dispatch(getMeThunk())
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'No se pudo cargar el resumen de la compra.')
    } finally {
      setLoading(false)
    }
  }, [dispatch, purchaseId, sessionId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!purchaseId || cancelledPath || purchase?.status !== 'pending' || polls >= 8) return undefined
    const timer = window.setTimeout(() => {
      setPolls(prev => prev + 1)
      refresh(true)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [cancelledPath, polls, purchase?.status, purchaseId, refresh])

  const paidAt = useMemo(() => {
    const raw = purchase?.paid_at || purchase?.created_at
    if (!raw) return '-'
    try {
      return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(raw))
    } catch (_) {
      return raw
    }
  }, [purchase])

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 1, sm: 2, md: 4 }, py: { xs: 2, md: 4 } }}>
      <Card sx={{ borderRadius: { xs: 3, md: 4 }, overflow: 'hidden', border: '1px solid rgba(139,92,246,.24)' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between" alignItems={{ md: 'flex-start' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
                <Chip icon={copy.icon} label={copy.label} color={copy.color} />
                <Chip icon={<ReceiptLongRounded />} label={`Compra #${purchaseId || '-'}`} variant="outlined" />
              </Stack>
              <Typography variant="h3" sx={{ fontWeight: 950, fontSize: { xs: 30, sm: 42 }, lineHeight: 1.05 }}>
                {copy.title}
              </Typography>
              <Typography sx={{ color: 'rgba(245,245,247,.66)', mt: 1.2, maxWidth: 720 }}>
                {copy.body}
              </Typography>
            </Box>

            <Card sx={{ width: { xs: '100%', md: 280 }, borderRadius: 3, bgcolor: 'rgba(247,201,72,.08)', border: '1px solid rgba(247,201,72,.24)' }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <AccountBalanceWalletRounded sx={{ color: '#f7c948' }} />
                  <Typography sx={{ color: 'rgba(245,245,247,.62)', fontWeight: 800 }}>Saldo actual</Typography>
                </Stack>
                <Typography sx={{ mt: .8, color: '#ffe08a', fontWeight: 950, fontSize: 34 }}>
                  {balance === null ? '-' : Number(balance).toLocaleString('es-ES')}
                </Typography>
                <Typography sx={{ color: 'rgba(245,245,247,.52)', fontSize: 12 }}>monedas internas</Typography>
              </CardContent>
            </Card>
          </Stack>

          {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
          {loading && (
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mt: 3 }}>
              <CircularProgress size={20} />
              <Typography sx={{ color: 'rgba(245,245,247,.62)' }}>Cargando resumen de compra...</Typography>
            </Stack>
          )}

          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%', borderRadius: 3 }}>
                <CardContent><SummaryItem accent label="Monedas" value={purchase?.coins ? `+${purchase.coins}` : '-'} /></CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%', borderRadius: 3 }}>
                <CardContent><SummaryItem label="Importe" value={purchase ? money(purchase.amount_cents, purchase.currency) : '-'} /></CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%', borderRadius: 3 }}>
                <CardContent><SummaryItem label="Paquete" value={purchase?.package?.name || '-'} /></CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%', borderRadius: 3 }}>
                <CardContent><SummaryItem label="Fecha" value={paidAt} /></CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mt: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.025)' }}>
            <CardContent>
              <Stack divider={<Divider flexItem />} spacing={1.2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={.7}>
                  <Typography sx={{ color: 'rgba(245,245,247,.52)', fontWeight: 800 }}>Estado interno</Typography>
                  <Chip label={status} color={copy.color} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={.7}>
                  <Typography sx={{ color: 'rgba(245,245,247,.52)', fontWeight: 800 }}>Sesion Stripe</Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(245,245,247,.78)', wordBreak: 'break-all' }}>
                    {shortId(sessionId || purchase?.stripe_checkout_session_id)}
                  </Typography>
                </Stack>
                {purchase?.stripe_payment_intent_id && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={.7}>
                    <Typography sx={{ color: 'rgba(245,245,247,.52)', fontWeight: 800 }}>Payment intent</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(245,245,247,.78)', wordBreak: 'break-all' }}>
                      {shortId(purchase.stripe_payment_intent_id)}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} sx={{ mt: 3 }}>
            <Button variant="contained" startIcon={<AccountBalanceWalletRounded />} onClick={() => navigate('/wallet')}>
              Ver wallet
            </Button>
            <Button variant="outlined" startIcon={<ShoppingCartRounded />} onClick={() => navigate('/coins/buy')}>
              Comprar mas monedas
            </Button>
            <Button variant="outlined" startIcon={<StorefrontRounded />} onClick={() => navigate('/marketplace')}>
              Ir al marketplace
            </Button>
            {purchase?.status === 'pending' && (
              <Button variant="text" startIcon={<RefreshRounded />} onClick={() => refresh()}>
                Actualizar
              </Button>
            )}
          </Stack>

          <Alert icon={<PaidRounded />} severity="info" sx={{ mt: 3 }}>
            Las monedas de MyPredicts son virtuales, solo sirven dentro del proyecto y no se pueden retirar ni convertir a dinero real.
          </Alert>
        </CardContent>
      </Card>
    </Box>
  )
}
