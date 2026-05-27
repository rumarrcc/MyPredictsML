import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, InputAdornment, InputLabel, MenuItem, Pagination, Paper, Select,
  Skeleton, Stack, TextField, Typography,
} from '@mui/material'
import {
  AccountBalanceWallet, AutoGraph, Close, Lock,
  LockOpen, Search, ShoppingCart, Storefront,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import strategyService from '@/services/strategyService'
import coinPaymentService from '@/services/coinPaymentService'
import InsufficientCoinsModal from '@/components/coins/InsufficientCoinsModal'
import CopyToPredictionsModal from '@/components/strategies/CopyToPredictionsModal'

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'momentum', label: 'Alcistas' },
  { value: 'mean_reversion', label: 'Rebotes' },
  { value: 'swing', label: 'Varios días' },
  { value: 'long_term', label: 'Medio plazo' },
  { value: 'other', label: 'Otras' },
]

const SORTS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'top_sales', label: 'Más compradas' },
  { value: 'best_rating', label: 'Mejor valoradas' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(item => [item.value, item.label]))
const getPriceCoins = (strategy) => Number(strategy?.price_coins ?? Math.max(0, Math.round(Number(strategy?.price || 0))))
const firstTicker = (strategy) => String(strategy?.target_tickers || 'AAPL').split(',')[0].trim().toUpperCase() || 'AAPL'

function RuleSummary({ strategy }) {
  const rules = strategy?.rules || {}
  const publicSummary = rules.public_summary || {}
  const entry = publicSummary.entry || rules.entry_rules?.[0]?.description
  const exit = publicSummary.exit || rules.exit_rules?.[0]?.description

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,.035)' }}>
        <Typography color="text.secondary" fontSize={12} fontWeight={900}>Idea</Typography>
        <Typography fontSize={14}>{publicSummary.thesis || strategy?.description || 'Sin resumen ampliado.'}</Typography>
      </Paper>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 2, bgcolor: 'rgba(34,197,94,.06)' }}>
            <Typography color="#86efac" fontSize={12} fontWeight={900}>Entrada</Typography>
            <Typography fontSize={13}>{entry || 'Entrada cuando la predicción confirme el escenario.'}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 2, bgcolor: 'rgba(248,113,113,.06)' }}>
            <Typography color="#fca5a5" fontSize={12} fontWeight={900}>Salida</Typography>
            <Typography fontSize={13}>{exit || 'Salida si el escenario deja de cumplirse.'}</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  )
}

function PurchaseSummaryDialog({ open, strategy, onClose, onCopyPredictions, onCopyPortfolio, copyingPortfolio }) {
  if (!strategy) return null
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box>
            <Typography fontWeight={950}>Predicción desbloqueada</Typography>
            <Typography color="text.secondary" fontSize={13}>{strategy.name}</Typography>
          </Box>
          <Button onClick={onClose} color="inherit" sx={{ minWidth: 40, px: 1 }}><Close /></Button>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip label={firstTicker(strategy)} color="primary" variant="outlined" />
            <Chip label={`${getPriceCoins(strategy)} monedas`} sx={{ bgcolor: '#22c55e22', color: '#86efac', fontWeight: 900 }} />
            <Chip label={CATEGORY_LABELS[strategy.category] || 'Predicción'} />
          </Stack>
          <Typography color="text.secondary">
            Ya puedes ver el contenido completo y reutilizarlo en tus predicciones o en tu cartera virtual.
          </Typography>
          <RuleSummary strategy={strategy} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="outlined" startIcon={<AutoGraph />} onClick={onCopyPredictions}>
          Copiar a predicciones
        </Button>
        <Button
          variant="contained"
          startIcon={copyingPortfolio ? <CircularProgress size={16} color="inherit" /> : <AccountBalanceWallet />}
          onClick={onCopyPortfolio}
          disabled={copyingPortfolio}
          sx={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', fontWeight: 900 }}
        >
          Copiar a cartera virtual
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function StrategyCard({ strategy, onBuy, buying }) {
  const navigate = useNavigate()
  const isLocked = strategy.is_paid && !strategy.already_purchased
  const priceCoins = getPriceCoins(strategy)

  return (
    <Card sx={{
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 2,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 300,
      overflow: 'hidden',
    }}>
      <CardContent sx={{ flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start" mb={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={950} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/marketplace/${strategy.id}`)}>
              {strategy.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              @{strategy.author_username || 'usuario'} · {firstTicker(strategy)}
            </Typography>
          </Box>
          <Chip label={`${priceCoins} monedas`} size="small" sx={{ bgcolor: '#22c55e18', color: '#86efac', fontWeight: 900 }} />
        </Stack>

        <Stack direction="row" gap={1} flexWrap="wrap" mb={1.5}>
          <Chip label={CATEGORY_LABELS[strategy.category] || 'Predicción'} size="small" variant="outlined" />
          {strategy.already_purchased && <Chip label="Comprada" size="small" color="success" variant="outlined" />}
          {strategy.times_purchased > 0 && <Chip label={`${strategy.times_purchased} compras`} size="small" />}
        </Stack>

        <Box sx={{ position: 'relative', minHeight: 132 }}>
          <Box sx={{ filter: isLocked ? 'blur(5px)' : 'none', opacity: isLocked ? 0.45 : 1 }}>
            <Typography color="text.secondary" fontSize={13} sx={{ mb: 1.5 }}>
              {strategy.short_desc || strategy.description || 'Predicción publicada por la comunidad.'}
            </Typography>
            <RuleSummary strategy={strategy} />
          </Box>
          {isLocked && (
            <Box sx={{
              position: 'absolute',
              inset: -4,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              p: 2,
              borderRadius: 2,
              background: 'linear-gradient(180deg, rgba(8,10,18,.14), rgba(8,10,18,.88))',
              border: '1px solid rgba(168,85,247,.18)',
            }}>
              <Stack alignItems="center" spacing={0.6}>
                <Lock sx={{ color: '#c4b5fd' }} />
                <Typography fontWeight={950} fontSize={14}>Contenido bloqueado</Typography>
                <Typography color="text.secondary" fontSize={12}>Compra para ver la idea completa.</Typography>
              </Stack>
            </Box>
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => navigate(`/marketplace/${strategy.id}`)} sx={{ flex: 1 }}>
          Ver detalle
        </Button>
        {strategy.already_purchased ? (
          <Button size="small" variant="contained" color="success" disabled startIcon={<LockOpen />} sx={{ flex: 1 }}>
            Desbloqueada
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            onClick={() => onBuy(strategy)}
            disabled={buying}
            startIcon={buying ? <CircularProgress size={16} color="inherit" /> : <ShoppingCart />}
            sx={{ flex: 1, bgcolor: '#7c3aed' }}
          >
            {buying ? 'Comprando...' : 'Comprar'}
          </Button>
        )}
      </CardActions>
    </Card>
  )
}

export default function MarketplacePage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [strategies, setStrategies] = useState([])
  const [myPublished, setMyPublished] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [buyingId, setBuyingId] = useState(null)
  const [coinBalance, setCoinBalance] = useState(null)
  const [coinsModal, setCoinsModal] = useState({ open: false, details: {} })
  const [summaryStrategy, setSummaryStrategy] = useState(null)
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyingPortfolio, setCopyingPortfolio] = useState(false)

  const [search, setSearch] = useState(params.get('search') || '')
  const [category, setCategory] = useState(params.get('category') || '')
  const [sort, setSort] = useState(params.get('sort') || 'recent')

  const refreshBalance = useCallback(() => {
    if (!isAuthenticated) {
      setCoinBalance(null)
      return Promise.resolve()
    }
    return coinPaymentService.balance()
      .then(data => setCoinBalance(data?.balance ?? 0))
      .catch(() => setCoinBalance(null))
  }, [isAuthenticated])

  const loadMine = useCallback(() => {
    if (!isAuthenticated) {
      setMyPublished([])
      return Promise.resolve()
    }
    return strategyService.getMine('published')
      .then(items => setMyPublished(items || []))
      .catch(() => setMyPublished([]))
  }, [isAuthenticated])

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await strategyService.getMarketplace({
        page: pg,
        per_page: 12,
        sort,
        category: category || undefined,
        search: search || undefined,
      })
      setStrategies(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setPage(pg)
    } catch (err) {
      setStrategies([])
      setTotal(0)
      setPages(1)
      setPage(pg)
      setLoadError(err?.response?.data?.message || 'No se pudo cargar el marketplace.')
    } finally {
      setLoading(false)
    }
  }, [sort, category, search])

  useEffect(() => { load(1) }, [sort, category, load])
  useEffect(() => { refreshBalance(); loadMine() }, [refreshBalance, loadMine])

  const handleSearch = (event) => {
    if (event.key === 'Enter') load(1)
  }

  const handleBuyWithCoins = async (strategy) => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setBuyingId(strategy.id)
    try {
      const result = await strategyService.purchase(strategy.id)
      const unlocked = result?.strategy || await strategyService.getOne(strategy.id)
      setStrategies(items => items.map(item => String(item.id) === String(strategy.id) ? { ...item, ...unlocked, already_purchased: true } : item))
      setSummaryStrategy({ ...strategy, ...unlocked, already_purchased: true })
      await refreshBalance()
      await load(page)
      toast.success('Compra completada con MyCoins.')
    } catch (err) {
      const data = err?.response?.data || {}
      if (data.error === 'INSUFFICIENT_COINS') setCoinsModal({ open: true, details: data })
      else toast.error(data.message || 'No se pudo completar la compra.')
    } finally {
      setBuyingId(null)
    }
  }

  const handleCopyPortfolio = async () => {
    if (!summaryStrategy?.id) return
    setCopyingPortfolio(true)
    try {
      const ticker = firstTicker(summaryStrategy)
      await strategyService.copyToInvestments(summaryStrategy.id, { ticker, quantity: 1 })
      toast.success('Copiada a la cartera virtual.')
      setSummaryStrategy(null)
      navigate('/portfolio')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo copiar a la cartera virtual.')
    } finally {
      setCopyingPortfolio(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={950}>Marketplace</Typography>
          <Typography color="text.secondary">
            Predicciones publicadas por usuarios. Se compran con monedas internas y se desbloquean al instante.
          </Typography>
        </Box>
        {isAuthenticated && (
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip label={`Saldo: ${coinBalance ?? '-'} monedas`} color="primary" variant="outlined" />
            <Button variant="contained" startIcon={<Storefront />} onClick={() => navigate('/strategies')}>
              Publicar predicción
            </Button>
            <Button variant="outlined" onClick={() => navigate('/coins/buy')}>
              Comprar monedas
            </Button>
          </Stack>
        )}
      </Stack>

      {myPublished.length > 0 && (
        <Paper sx={{ p: 2, borderRadius: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5} mb={1.5}>
            <Box>
              <Typography fontWeight={950}>Mis publicaciones</Typography>
              <Typography color="text.secondary" fontSize={13}>Predicciones tuyas visibles en el marketplace.</Typography>
            </Box>
            <Button size="small" onClick={() => navigate('/strategies')}>Gestionar</Button>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {myPublished.slice(0, 6).map(item => (
              <Chip
                key={item.id}
                label={`${item.name} · ${getPriceCoins(item)} monedas`}
                onClick={() => navigate(`/marketplace/${item.id}`)}
                sx={{ bgcolor: '#7c3aed22', color: '#c4b5fd', fontWeight: 800 }}
              />
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar por nombre, ticker o autor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearch}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl size="small" fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select value={category} label="Tipo" onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl size="small" fullWidth>
              <InputLabel>Orden</InputLabel>
              <Select value={sort} label="Orden" onChange={e => setSort(e.target.value)}>
                {SORTS.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {loading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Skeleton variant="rounded" height={300} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      ) : strategies.length > 0 ? (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {total} predicción{total !== 1 ? 'es' : ''} encontrada{total !== 1 ? 's' : ''}
          </Typography>
          <Grid container spacing={2}>
            {strategies.map(strategy => (
              <Grid item xs={12} sm={6} md={4} key={strategy.id}>
                <StrategyCard
                  strategy={strategy}
                  onBuy={handleBuyWithCoins}
                  buying={String(buyingId) === String(strategy.id)}
                />
              </Grid>
            ))}
          </Grid>
          {pages > 1 && (
            <Stack alignItems="center" mt={4}>
              <Pagination count={pages} page={page} onChange={(_, value) => load(value)} color="primary" />
            </Stack>
          )}
        </>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography fontWeight={950} mb={1}>No hay predicciones publicadas</Typography>
          <Typography color="text.secondary" mb={2}>
            Cuando un usuario publique una predicción para vender, aparecerá aquí.
          </Typography>
          {isAuthenticated && (
            <Button variant="contained" onClick={() => navigate('/strategies')}>
              Publicar la primera
            </Button>
          )}
        </Paper>
      )}

      <InsufficientCoinsModal
        open={coinsModal.open}
        details={coinsModal.details}
        onClose={() => setCoinsModal({ open: false, details: {} })}
      />

      <PurchaseSummaryDialog
        open={Boolean(summaryStrategy)}
        strategy={summaryStrategy}
        onClose={() => setSummaryStrategy(null)}
        onCopyPredictions={() => setCopyModalOpen(true)}
        onCopyPortfolio={handleCopyPortfolio}
        copyingPortfolio={copyingPortfolio}
      />

      {summaryStrategy && (
        <CopyToPredictionsModal
          open={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          strategy={{ id: summaryStrategy.id, name: summaryStrategy.name, ticker: firstTicker(summaryStrategy) }}
          onDone={() => load(page)}
        />
      )}
    </Box>
  )
}
