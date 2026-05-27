import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Grid, Paper, Stack, Typography,
} from '@mui/material'
import {
  AccountBalanceWalletRounded, AddRounded, CasinoRounded,
  HistoryRounded, PaidRounded, StorefrontRounded,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import coinPaymentService from '@/services/coinPaymentService'

const REASON_LABELS = {
  stripe_test_purchase: 'Compra de monedas',
  roulette: 'Ruleta diaria',
  marketplace_purchase: 'Compra marketplace',
  marketplace_sale: 'Venta marketplace',
  strategy_purchase: 'Compra de estrategia',
  strategy_sale: 'Venta de estrategia',
  prediction_extra: 'Credito extra de prediccion',
  round_reward: 'Recompensa de jornada',
  final_league_reward: 'Recompensa final',
  admin_adjustment: 'Ajuste admin',
}

export default function WalletPage() {
  const navigate = useNavigate()
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [balanceData, txData, pkgData] = await Promise.all([
        coinPaymentService.balance(),
        coinPaymentService.transactions(),
        coinPaymentService.packages().catch(() => ({ items: [] })),
      ])
      setBalance(balanceData?.balance ?? 0)
      setTransactions(txData?.items || [])
      setPackages(pkgData?.items || [])
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo cargar tu wallet de monedas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h3" fontWeight={950}>Wallet de monedas</Typography>
          <Typography color="text.secondary">
            Consulta saldo, historial y accesos para recargar o ganar monedas dentro de MyPredicts.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<CasinoRounded />} onClick={() => navigate('/wheel')}>
            Ruleta
          </Button>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/coins/buy')}>
            Comprar monedas
          </Button>
        </Stack>
      </Stack>

      {loading ? (
        <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 4, mb: 2.5, background: 'radial-gradient(circle at 18% 20%, rgba(168,85,247,.30), transparent 30%), linear-gradient(135deg, rgba(20,18,42,.94), rgba(6,9,20,.98))', border: '1px solid rgba(168,85,247,.22)' }}>
              <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} spacing={3}>
                  <Box sx={{ width: 72, height: 72, borderRadius: 4, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#6d28d9,#a855f7)', boxShadow: '0 22px 70px rgba(124,58,237,.38)' }}>
                    <AccountBalanceWalletRounded sx={{ fontSize: 36 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography color="text.secondary" fontWeight={800} fontSize={12}>SALDO DISPONIBLE</Typography>
                    <Typography variant="h2" fontWeight={950}>
                      {Number(balance || 0).toLocaleString('es-ES')} monedas
                    </Typography>
                    <Typography color="text.secondary">
                      Sirven para estrategias premium, predicciones premium, marketplace y gamificacion.
                    </Typography>
                  </Box>
                  <Chip label="Sin valor monetario real" color="success" variant="outlined" />
                </Stack>
              </CardContent>
            </Card>

            <Paper sx={{ p: 2.5, borderRadius: 4, mb: 2.5 }}>
              <Stack direction="row" spacing={1.3} alignItems="center" mb={2}>
                <PaidRounded sx={{ color: '#a855f7' }} />
                <Typography variant="h5" fontWeight={950}>Paquetes disponibles</Typography>
              </Stack>
              <Grid container spacing={1.4}>
                {(packages || []).slice(0, 3).map(pkg => (
                  <Grid item xs={12} sm={4} key={pkg.id}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                      <Typography fontWeight={950}>{pkg.name}</Typography>
                      <Typography variant="h5" fontWeight={950}>{pkg.coins} monedas</Typography>
                      <Typography color="text.secondary" fontSize={13}>
                        {(pkg.price_cents / 100).toFixed(2)} {pkg.currency}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
              <Button sx={{ mt: 2 }} variant="contained" onClick={() => navigate('/coins/buy')}>
                Comprar monedas
              </Button>
              <Alert severity="info" sx={{ mt: 2 }}>
                Stripe recarga monedas y gestiona suscripciones. Las compras internas gastan monedas.
              </Alert>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 4 }}>
              <Stack direction="row" spacing={1.3} alignItems="center" mb={2}>
                <HistoryRounded sx={{ color: '#a855f7' }} />
                <Typography variant="h5" fontWeight={950}>Movimientos recientes</Typography>
              </Stack>
              <Stack divider={<Divider flexItem />}>
                {transactions.length ? transactions.map(tx => {
                  const signedAmount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
                  return (
                    <Stack key={tx.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.4 }} gap={2}>
                      <Box>
                        <Typography fontWeight={850}>{REASON_LABELS[tx.reason] || tx.reason || 'Movimiento de monedas'}</Typography>
                        <Typography color="text.secondary" fontSize={12}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleString('es-ES') : ''}
                          {tx.reference_type ? ` · ${tx.reference_type} #${tx.reference_id || '-'}` : ''}
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
                  <Typography color="text.secondary" sx={{ py: 3 }}>Todavia no hay movimientos de monedas.</Typography>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={2}>
              <Paper sx={{ p: 2.5, borderRadius: 4 }}>
                <Typography fontWeight={950} mb={1}>Para que sirven</Typography>
                <Typography color="text.secondary" fontSize={13}>
                  Las monedas desbloquean predicciones premium, estrategias del marketplace y recompensas internas.
                </Typography>
              </Paper>
              <Paper sx={{ p: 2.5, borderRadius: 4 }}>
                <Typography fontWeight={950} mb={1}>Accesos rapidos</Typography>
                <Stack spacing={1}>
                  <Button variant="outlined" startIcon={<StorefrontRounded />} onClick={() => navigate('/marketplace')}>Marketplace</Button>
                  <Button variant="outlined" onClick={() => navigate('/billing')}>Suscripcion</Button>
                </Stack>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
