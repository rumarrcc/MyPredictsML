import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { AutoAwesome, History, Paid, Shield } from '@mui/icons-material'
import { toast } from 'react-toastify'
import coinPaymentService from '@/services/coinPaymentService'

export default function BuyCoinsPage() {
  const [packages, setPackages] = useState([])
  const [purchases, setPurchases] = useState([])
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  const mode = location.pathname.includes('success') ? 'success' : location.pathname.includes('cancel') ? 'cancel' : 'buy'

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const [pkgData, purchaseData, balanceData] = await Promise.all([
          coinPaymentService.packages(),
          coinPaymentService.purchases().catch(() => ({ items: [] })),
          coinPaymentService.balance().catch(() => null),
        ])
        if (!alive) return
        setPackages(pkgData.items || [])
        setPurchases(purchaseData.items || [])
        setBalance(balanceData?.balance ?? null)
      } catch (err) {
        toast.error(err?.response?.data?.message || 'No se pudieron cargar los paquetes de monedas.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [location.search])

  const buy = async (packageId) => {
    setPayingId(packageId)
    try {
      const result = await coinPaymentService.createCheckoutSession(packageId)
      window.location.href = result.checkout_url
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo abrir el pago seguro.')
    } finally {
      setPayingId(null)
    }
  }

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 }, py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ md: 'center' }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <Paid sx={{ color: '#a855f7' }} />
            <Chip label="Pagos seguros" color="primary" size="small" />
            <Chip label="Monedas internas" variant="outlined" size="small" />
          </Stack>
          <Typography variant="h3" fontWeight={950}>Comprar monedas internas</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
            Recarga tu saldo para desbloquear predicciones premium, estrategias y recompensas internas.
          </Typography>
        </Box>
        <Card sx={{ minWidth: 220, borderRadius: 4, background: 'linear-gradient(135deg, rgba(124,58,237,.35), rgba(15,15,28,.95))' }}>
          <CardContent>
            <Typography color="text.secondary" fontSize={13}>Tu saldo</Typography>
            <Typography variant="h4" fontWeight={950}>{balance ?? '-'} monedas</Typography>
            <Typography color="text.secondary" fontSize={12}>Sin valor monetario real</Typography>
          </CardContent>
        </Card>
      </Stack>

      {mode === 'success' && (
        <Alert severity="success" sx={{ mt: 3 }}>
          Compra completada. Si el saldo no aparece al instante, actualiza la página en unos segundos.
        </Alert>
      )}
      {mode === 'cancel' && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          Checkout cancelado. No se han acreditado monedas.
        </Alert>
      )}

      <Alert icon={<Shield />} severity="info" sx={{ mt: 3 }}>
        Las monedas internas solo funcionan dentro de MyPredicts. No se pueden retirar ni convertir a dinero real.
      </Alert>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress /></Stack>
      ) : (
        <Grid container spacing={2.5} sx={{ mt: 2 }}>
          {packages.map(pkg => (
            <Grid item xs={12} sm={6} md={3} key={pkg.id}>
              <Card sx={{ height: '100%', borderRadius: 4, border: '1px solid rgba(168,85,247,.28)', background: 'rgba(8,10,22,.88)' }}>
                <CardContent>
                  <Stack spacing={1.2}>
                    <AutoAwesome sx={{ color: '#a855f7' }} />
                    <Typography variant="h6" fontWeight={900}>{pkg.name}</Typography>
                    <Typography variant="h3" fontWeight={950}>{pkg.coins}</Typography>
                    <Typography color="text.secondary">monedas internas</Typography>
                    <Divider />
                    <Typography variant="h5" fontWeight={900}>{pkg.price?.toFixed?.(2) ?? (pkg.price_cents / 100).toFixed(2)} {pkg.currency}</Typography>
                    <Button
                      variant="contained"
                      onClick={() => buy(pkg.id)}
                      disabled={payingId === pkg.id}
                      sx={{ mt: 1, borderRadius: 3 }}
                    >
                      {payingId === pkg.id ? 'Abriendo Stripe...' : 'Comprar con Stripe'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Card sx={{ mt: 4, borderRadius: 4 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <History sx={{ color: '#a855f7' }} />
            <Typography variant="h5" fontWeight={900}>Historial de compras</Typography>
          </Stack>
          {(purchases || []).length === 0 ? (
            <Typography color="text.secondary">Todavía no hay compras.</Typography>
          ) : (
            <Stack divider={<Divider flexItem />}>
              {purchases.map(p => (
                <Stack key={p.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} py={1.2}>
                  <Box>
                    <Typography fontWeight={800}>{p.package?.name || `Compra #${p.id}`}</Typography>
                    <Typography color="text.secondary" fontSize={13}>{p.coins} monedas · {(p.amount_cents / 100).toFixed(2)} {p.currency}</Typography>
                  </Box>
                  <Chip label={p.status} color={p.status === 'paid' ? 'success' : p.status === 'pending' ? 'warning' : 'default'} />
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
