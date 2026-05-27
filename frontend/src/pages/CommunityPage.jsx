import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Grid, Paper, Button, Chip, Select, MenuItem,
  FormControl, InputLabel, InputBase, IconButton, CircularProgress
} from '@mui/material'
import { Search, People, Forum, Insights, LocalFireDepartment, QueryStats, RocketLaunch } from '@mui/icons-material'
import { fetchAnalyses } from '@/store/slices/communitySlice'
import AnalysisCard from '@/components/community/AnalysisCard'
import TopAnalysesPanel from '@/components/community/TopAnalysesPanel'
import { communityService } from '@/services/communityService'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'likes', label: 'Más valorados' },
  { value: 'views', label: 'Más vistos' },
  { value: 'comments', label: 'Más comentados' },
]

export default function CommunityPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { analyses, total: analysesTotal, isLoading: loading } = useSelector(s => s.community)
  const [topAnalyses, setTopAnalyses] = useState([])
  const [sort, setSort] = useState('recent')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const perPage = 12

  useEffect(() => {
    dispatch(fetchAnalyses({ sort_by: sort, page: 1, per_page: perPage }))
    setPage(1)
    setHasMore(true)
  }, [sort])

  useEffect(() => {
    communityService.getTopAnalyses()
      .then(data => setTopAnalyses(Array.isArray(data) ? data : (data?.analyses || [])))
      .catch(() => {})
  }, [])

  const handleLoadMore = () => {
    const next = page + 1
    dispatch(fetchAnalyses({ sort_by: sort, page: next, per_page: perPage, search }))
    setPage(next)
    if (analyses.length + perPage >= (analysesTotal || 0)) setHasMore(false)
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      dispatch(fetchAnalyses({ sort_by: sort, page: 1, per_page: perPage, search: search.trim() }))
    }
  }

  const filtered = Array.isArray(analyses)
    ? (search ? analyses.filter(a =>
        a.ticker?.toLowerCase().includes(search.toLowerCase()) ||
        a.title?.toLowerCase().includes(search.toLowerCase())
      ) : analyses)
    : []

  const communityStats = {
    ideas: analysesTotal || analyses.length || 0,
    likes: analyses.reduce((sum, a) => sum + Number(a.likes_count || a.likes || 0), 0),
    comments: analyses.reduce((sum, a) => sum + Number(a.comments_count || a.comments || 0), 0),
    tickers: new Set(analyses.map(a => a.ticker).filter(Boolean)).size,
  }

  const hotTickers = Object.entries(
    analyses.reduce((acc, a) => {
      if (a.ticker) acc[a.ticker] = (acc[a.ticker] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const focusTicker = (symbol) => {
    setSearch(symbol)
    setPage(1)
    setHasMore(true)
    dispatch(fetchAnalyses({ sort_by: sort, page: 1, per_page: perPage, search: symbol }))
  }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1300, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, flexWrap: 'wrap' }}>
          <People sx={{ color: '#a855f7', fontSize: 36 }} />
          <Box>
            <Typography variant="h4" fontWeight={800} color="#fff">Comunidad</Typography>
            <Typography color="#a1a1aa">Radar de ideas: analiza, valida con ML y convierte tesis en predicciones propias</Typography>
          </Box>
        </Box>

        <Paper
          sx={{
            mb: 3,
            p: { xs: 2.5, md: 3 },
            borderRadius: 4,
            overflow: 'hidden',
            position: 'relative',
            bgcolor: 'rgba(10,12,24,.82)',
            border: '1px solid rgba(168,85,247,.20)',
            background:
              'radial-gradient(circle at 12% 10%, rgba(124,58,237,.24), transparent 34%), radial-gradient(circle at 86% 20%, rgba(168,85,247,.16), transparent 28%), linear-gradient(145deg, rgba(13,16,32,.96), rgba(5,7,17,.98))',
            boxShadow: '0 28px 80px rgba(0,0,0,.34)',
          }}
        >
          <Box sx={{ position: 'absolute', inset: 0, opacity: .18, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(rgba(255,255,255,.18) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            maskImage: 'linear-gradient(90deg, #000, transparent 82%)',
          }} />
          <Grid container spacing={2.5} sx={{ position: 'relative', zIndex: 1 }}>
            <Grid item xs={12} md={5}>
              <Chip
                icon={<Insights sx={{ fontSize: 16 }} />}
                label="UTILIDAD REAL"
                sx={{
                  mb: 2,
                  bgcolor: 'rgba(124,58,237,.22)',
                  color: '#d8b4fe',
                  border: '1px solid rgba(168,85,247,.35)',
                  fontWeight: 900,
                  letterSpacing: '.08em',
                }}
              />
              <Typography variant="h5" fontWeight={950} color="#fff" sx={{ letterSpacing: '-.03em', mb: 1 }}>
                Usa la comunidad como filtro de mercado, no como muro social.
              </Typography>
              <Typography color="#a1a1aa" sx={{ maxWidth: 560, mb: 2.5 }}>
                Aqui puedes detectar tickers repetidos, leer tesis de otros usuarios y llevar una idea directamente a Prediction para validarla con modelos ML antes de invertir.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<RocketLaunch />}
                  onClick={() => navigate('/prediction')}
                  sx={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', fontWeight: 900, borderRadius: 2 }}
                >
                  Validar una idea
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Insights />}
                  onClick={() => navigate('/prediction')}
                  sx={{ borderColor: 'rgba(168,85,247,.45)', color: '#d8b4fe', fontWeight: 800, borderRadius: 2 }}
                >
                  Validar con ML
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Grid container spacing={1.2}>
                {[
                  { label: 'Ideas publicadas', value: communityStats.ideas, icon: Forum },
                  { label: 'Tickers activos', value: communityStats.tickers, icon: QueryStats },
                  { label: 'Interacciones', value: communityStats.likes + communityStats.comments, icon: LocalFireDepartment },
                  { label: 'Top analisis', value: topAnalyses.length, icon: Insights },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <Grid item xs={6} key={item.label}>
                      <Box sx={{
                        p: 1.6,
                        minHeight: 98,
                        borderRadius: 3,
                        bgcolor: 'rgba(255,255,255,.045)',
                        border: '1px solid rgba(255,255,255,.09)',
                      }}>
                        <Icon sx={{ color: '#a855f7', fontSize: 20, mb: 1 }} />
                        <Typography color="#fff" fontWeight={950} fontSize={24} lineHeight={1}>
                          {item.value}
                        </Typography>
                        <Typography color="#8b8fa3" fontSize={12}>{item.label}</Typography>
                      </Box>
                    </Grid>
                  )
                })}
              </Grid>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(0,0,0,.20)', border: '1px solid rgba(255,255,255,.08)', height: '100%' }}>
                <Typography color="#fff" fontWeight={900} mb={1}>Tickers calientes</Typography>
                <Typography color="#8b8fa3" fontSize={12} mb={1.5}>
                  Filtra el feed por los activos que mas se estan comentando.
                </Typography>
                <Box sx={{ display: 'flex', gap: .8, flexWrap: 'wrap' }}>
                  {(hotTickers.length ? hotTickers : [['AAPL', 0], ['NVDA', 0], ['MSFT', 0], ['TSLA', 0], ['AMZN', 0]]).map(([symbol, count]) => (
                    <Chip
                      key={symbol}
                      label={count ? `${symbol} (${count})` : symbol}
                      size="small"
                      onClick={() => focusTicker(symbol)}
                      sx={{
                        bgcolor: search === symbol ? 'rgba(124,58,237,.34)' : 'rgba(255,255,255,.06)',
                        color: search === symbol ? '#fff' : '#d8b4fe',
                        border: '1px solid rgba(168,85,247,.28)',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3}>
          {/* Main feed */}
          <Grid item xs={12} lg={8}>
            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.5 }}>
                <Search sx={{ color: '#555', mr: 1, fontSize: 20 }} />
                <InputBase
                  placeholder="Buscar por ticker o título..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleSearch}
                  sx={{ flex: 1, color: '#fff', fontSize: 14, py: 1 }}
                />
              </Box>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel sx={{ color: '#888' }}>Ordenar por</InputLabel>
                <Select value={sort} onChange={e => setSort(e.target.value)} label="Ordenar por"
                  sx={{ color: '#fff', bgcolor: 'background.paper', '& fieldset': { borderColor: 'divider' } }}>
                  {SORT_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Cards */}
            {loading && !filtered.length ? (
              <Box textAlign="center" py={10}><CircularProgress /></Box>
            ) : filtered.length ? (
              <>
                <Grid container spacing={2}>
                  {filtered.map(a => (
                    <Grid item xs={12} sm={6} key={a.id}>
                      <AnalysisCard analysis={a} />
                    </Grid>
                  ))}
                </Grid>
                {hasMore && (
                  <Box textAlign="center" mt={4}>
                    <Button variant="outlined" onClick={handleLoadMore} disabled={loading}
                      sx={{ borderColor: 'divider', color: '#aaa', px: 4 }}>
                      {loading ? <CircularProgress size={18} /> : 'Cargar más'}
                    </Button>
                  </Box>
                )}
              </>
            ) : (
              <Box textAlign="center" py={10}>
                <People sx={{ fontSize: 64, color: '#2d2d4e', mb: 2 }} />
                <Typography color="#555">No se encontraron análisis</Typography>
                {search && (
                  <Button size="small" onClick={() => setSearch('')} sx={{ color: '#7c3aed', mt: 1 }}>
                    Limpiar búsqueda
                  </Button>
                )}
              </Box>
            )}
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} lg={4}>
            <Box sx={{ position: 'sticky', top: 80 }}>
              <TopAnalysesPanel analyses={topAnalyses} />

              <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, mt: 2 }}>
                <Typography fontWeight={700} color="#fff" mb={2}>¿Quieres compartir tu análisis?</Typography>
                <Typography variant="body2" color="#888" mb={2}>
                  Después de generar una predicción, usa el botón Compartir para publicarla en la comunidad.
                </Typography>
                <Button variant="outlined" fullWidth sx={{ borderColor: '#7c3aed', color: '#b89eff' }}
                  onClick={() => navigate('/prediction')}>
                  Ir a predicciones
                </Button>
              </Paper>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}
