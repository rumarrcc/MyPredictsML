import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box, Typography, Grid, Paper, Button, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  CircularProgress, Tabs, Tab
} from '@mui/material'
import { Add, Delete, AccountBalance, Refresh } from '@mui/icons-material'
import { fetchPortfolios, fetchPortfolio, createPortfolio, deletePortfolio } from '@/store/slices/portfolioSlice'
import PortfolioOverview from '@/components/portfolio/PortfolioOverview'
import PositionTable from '@/components/portfolio/PositionTable'
import AddPositionModal from '@/components/portfolio/AddPositionModal'
import { formatCurrency, getPnlColor } from '@/utils/formatters'
import { toast } from 'react-toastify'

const sx = {
  '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'divider' }, '&:hover fieldset': { borderColor: '#7c3aed' } },
  '& label': { color: '#888' },
}

function CreatePortfolioDialog({ open, onClose, onCreate, isInvestments = false }) {
  const dispatch = useDispatch()
  const [name, setName] = useState(isInvestments ? 'Mis inversiones' : '')
  const [capital, setCapital] = useState(isInvestments ? 0 : 10000)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setName(isInvestments ? 'Mis inversiones' : '')
    setCapital(isInvestments ? 0 : 10000)
  }, [isInvestments, open])

  const handleCreate = async () => {
    if (!name.trim()) { toast.warning('Introduce un nombre'); return }
    setLoading(true)
    try {
      await dispatch(createPortfolio({ name: name.trim(), initial_capital: isInvestments ? 0 : capital })).unwrap()
      toast.success(isInvestments ? 'Cartera de inversiones creada' : 'Cartera creada')
      setName(isInvestments ? 'Mis inversiones' : '')
      setCapital(isInvestments ? 0 : 10000)
      onCreate?.()
      onClose()
    } catch (err) {
      toast.error(err || 'Error al crear cartera')
    } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff' } }}>
      <DialogTitle>Crear nueva cartera</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="Nombre" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth sx={sx} />
          {!isInvestments && (
            <TextField label="Capital inicial ($)" type="number" value={capital}
              onChange={e => setCapital(parseFloat(e.target.value) || 0)} size="small" fullWidth sx={sx} />
          )}
          {isInvestments && (
            <Typography color="text.secondary" fontSize={13}>
              Esta cartera usa saldo virtual de la plataforma. No hay inversión real ni retiradas.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#aaa' }}>Cancelar</Button>
        <Button variant="contained" onClick={handleCreate} disabled={loading}>
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function PortfolioPage() {
  const dispatch = useDispatch()
  const location = useLocation()
  const { list: portfolios, current: currentPortfolio, isLoading: loading } = useSelector(s => s.portfolio)
  const [selectedId, setSelectedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [addPositionOpen, setAddPositionOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isInvestments = location.pathname.includes('investments')
  const visiblePortfolios = useMemo(() => portfolios.filter(p => {
    const investment = Boolean(p.is_investment_wallet) || ['inversiones desde señales', 'mis inversiones'].includes((p.name || '').trim().toLowerCase())
    return isInvestments ? investment : !investment
  }), [portfolios, isInvestments])

  useEffect(() => { dispatch(fetchPortfolios()) }, [])

  useEffect(() => {
    if (!visiblePortfolios.length) {
      if (selectedId) setSelectedId(null)
      return
    }
    if (!selectedId || !visiblePortfolios.some(p => p.id === selectedId)) {
      setSelectedId(visiblePortfolios[0].id)
    }
  }, [visiblePortfolios, selectedId])

  useEffect(() => {
    if (selectedId) dispatch(fetchPortfolio(selectedId))
  }, [selectedId])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cartera y todas sus posiciones?')) return
    setDeleting(true)
    try {
      await dispatch(deletePortfolio(id)).unwrap()
      toast.success('Cartera eliminada')
      setSelectedId(null)
      dispatch(fetchPortfolios())
    } catch { toast.error('Error al eliminar') }
    finally { setDeleting(false) }
  }

  const handleRefresh = () => {
    if (selectedId) dispatch(fetchPortfolio(selectedId))
  }

  const portfolio = currentPortfolio

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1300, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AccountBalance sx={{ color: '#2196f3', fontSize: 36 }} />
            <Box>
              <Typography variant="h4" fontWeight={800} color="#fff">{isInvestments ? 'Mis inversiones' : 'Mi Cartera'}</Typography>
              <Typography color="#888">
                {isInvestments
                  ? 'Aquí aparecen las estrategias y predicciones que has convertido en operaciones virtuales.'
                  : `${visiblePortfolios.length} cartera${visiblePortfolios.length !== 1 ? 's' : ''} virtual${visiblePortfolios.length !== 1 ? 'es' : ''}`}
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}>
            Nueva cartera
          </Button>
        </Box>

        {isInvestments && (
          <Paper sx={{ p: 2.2, mb: 3, borderRadius: 3, border: '1px solid rgba(34,197,94,.18)', background: 'linear-gradient(135deg, rgba(34,197,94,.10), rgba(124,58,237,.08))' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={5}>
                <Typography color="text.secondary" fontSize={12} fontWeight={800}>OPERATIVA VIRTUAL</Typography>
                <Typography variant="h4" fontWeight={950}>Sin recargas Stripe</Typography>
                <Typography color="text.secondary" fontSize={13}>Las inversiones usan posiciones virtuales y saldo interno. Stripe queda reservado para monedas y suscripciones.</Typography>
              </Grid>
              <Grid item xs={12} md={7}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { md: 'flex-end' } }}>
                  <Button variant="outlined" href="/prediction" sx={{ fontWeight: 900 }}>Crear prediccion ML</Button>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        )}

        {loading && !visiblePortfolios.length ? (
          <Box textAlign="center" py={10}><CircularProgress /></Box>
        ) : visiblePortfolios.length === 0 ? (
          <Box textAlign="center" py={12}>
            <AccountBalance sx={{ fontSize: 64, color: '#2d2d4e', mb: 2 }} />
            <Typography variant="h5" color="#555" mb={1}>{isInvestments ? 'Sin inversiones todavía' : 'Sin carteras virtuales'}</Typography>
            <Typography color="#444" mb={3}>
              {isInvestments
                ? 'Genera una predicción ML para crear una posición virtual o crea tu cartera virtual.'
                : 'Crea tu primera cartera virtual para simular posiciones.'}
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}>
              {isInvestments ? 'Crear cartera de inversiones' : 'Crear cartera virtual'}
            </Button>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* Portfolio list */}
            <Grid item xs={12} md={3}>
              <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                {visiblePortfolios.map(p => {
                  const pnl = (p.current_value || 0) - (p.total_invested || 0)
                  const isSelected = p.id === selectedId
                  return (
                    <Box key={p.id}
                      sx={{ p: 2, cursor: 'pointer', borderBottom: '1px solid #2d2d4e',
                        bgcolor: isSelected ? '#2d2d4e' : 'transparent',
                        borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                        '&:hover': { bgcolor: '#25254a' },
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => setSelectedId(p.id)}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} color="#fff" noWrap>{p.name}</Typography>
                        <Typography variant="caption" color="#888">{p.positions_count || 0} posiciones</Typography>
                        <Typography variant="body2" fontWeight={700} color="#fff" display="block">
                          {formatCurrency(p.current_value)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: getPnlColor(pnl) }}>
                          {formatCurrency(pnl)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                        sx={{ color: '#f44336', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  )
                })}
              </Paper>
            </Grid>

            {/* Portfolio detail */}
            <Grid item xs={12} md={9}>
              {loading && selectedId ? (
                <Box textAlign="center" py={10}><CircularProgress /></Box>
              ) : portfolio ? (
                <>
                  <PortfolioOverview portfolio={portfolio} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, mb: 1.5 }}>
                    <Typography fontWeight={700} color="#fff">{isInvestments ? 'Inversiones y posiciones' : 'Posiciones'}</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton size="small" onClick={handleRefresh} sx={{ color: '#888' }}>
                        <Refresh fontSize="small" />
                      </IconButton>
                      <Button size="small" variant="contained" startIcon={<Add />}
                        onClick={() => setAddPositionOpen(true)}
                        sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 600 }}>
                        Añadir posición
                      </Button>
                    </Box>
                  </Box>

                  <PositionTable
                    positions={portfolio.positions || []}
                    portfolioId={portfolio.id}
                    onSold={handleRefresh}
                    isInvestments={isInvestments}
                  />
                </>
              ) : (
                <Box textAlign="center" py={12}>
                  <AccountBalance sx={{ fontSize: 64, color: '#2d2d4e', mb: 2 }} />
                  <Typography variant="h5" color="#555">Selecciona una cartera</Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        )}
      </Box>

      <CreatePortfolioDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={() => dispatch(fetchPortfolios())}
        isInvestments={isInvestments}
      />

      {portfolio && (
        <AddPositionModal
          open={addPositionOpen}
          onClose={() => setAddPositionOpen(false)}
          portfolioId={portfolio.id}
          onAdd={handleRefresh}
        />
      )}
    </Box>
  )
}
