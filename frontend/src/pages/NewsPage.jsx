import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, Grid, Paper, Chip, TextField,
  InputAdornment, IconButton, CircularProgress, Skeleton,
  Divider, Button, Avatar, Tooltip, LinearProgress,
} from '@mui/material'
import {
  Search, OpenInNew, Schedule, TrendingUp,
  Newspaper, Refresh, ArrowForward, SentimentSatisfiedAlt,
  SentimentDissatisfied, SentimentNeutral, BarChart,
} from '@mui/icons-material'
import { newsService } from '@/services/newsService'
import { format, fromUnixTime, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'

// ─── Constantes ───────────────────────────────────────────────────────────────
const POPULAR = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'NFLX', 'JPM', 'NVDA']

// Categorías Finnhub para el filtro sin ticker
const FINNHUB_CATEGORIES = [
  { key: 'general', label: '🌐 Mercado General' },
  { key: 'forex',   label: '💱 Divisas'         },
  { key: 'crypto',  label: '₿ Cripto'           },
  { key: 'merger',  label: '🤝 Fusiones'        },
]

// Tabs de trending (vienen del backend /trending)
const TRENDING_SECTORS = ['Mercado General', 'Divisas (Forex)', 'Criptomonedas', 'Fusiones & M&A', 'Top Tickers']

const PUBLISHER_COLORS = {
  'Reuters':           '#f44336',
  'Bloomberg':         '#2196f3',
  'CNBC':             '#005594',
  'MarketWatch':       '#00ac4e',
  'Motley Fool':       '#e67e22',
  'Benzinga':          '#00bcd4',
  'Seeking Alpha':     '#ff9800',
  'Yahoo Finance':     '#6001D2',
  'Business Insider':  '#e91e63',
  'The Wall Street Journal': '#888888',
}

// ─── Widget de sentimiento ────────────────────────────────────────────────────
function SentimentWidget({ ticker }) {
  const [sentiment, setSentiment] = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    newsService.getSentiment(ticker)
      .then(setSentiment)
      .catch(() => setSentiment(null))
      .finally(() => setLoading(false))
  }, [ticker])

  if (!ticker || (!loading && !sentiment)) return null

  const overallColor = sentiment?.overall === 'positive' ? '#4caf50'
    : sentiment?.overall === 'negative' ? '#f44336' : '#ff9800'
  const OverallIcon = sentiment?.overall === 'positive' ? SentimentSatisfiedAlt
    : sentiment?.overall === 'negative' ? SentimentDissatisfied : SentimentNeutral

  return (
    <Paper sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: overallColor + '44',
      borderRadius: 2.5, p: 2, mb: 3,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <BarChart sx={{ color: overallColor, fontSize: 18 }} />
        <Typography fontWeight={700} fontSize={14} color="text.primary">
          Sentimiento de noticias — {ticker}
        </Typography>
        {loading && <CircularProgress size={14} sx={{ ml: 'auto', color: overallColor }} />}
      </Box>

      {!loading && sentiment && (
        <>
          {/* Barra combinada */}
          <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', height: 10, mb: 1.5 }}>
            <Box sx={{ width: `${sentiment.positive_pct}%`, bgcolor: '#4caf50', transition: 'width .6s' }} />
            <Box sx={{ width: `${sentiment.neutral_pct}%`,  bgcolor: '#ff9800', transition: 'width .6s' }} />
            <Box sx={{ width: `${sentiment.negative_pct}%`, bgcolor: '#f44336', transition: 'width .6s' }} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {[
              { label: 'Positivo', pct: sentiment.positive_pct, color: '#4caf50' },
              { label: 'Neutral',  pct: sentiment.neutral_pct,  color: '#ff9800' },
              { label: 'Negativo', pct: sentiment.negative_pct, color: '#f44336' },
            ].map(({ label, pct, color }) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                <Typography fontSize={11} color="text.secondary">{label}</Typography>
                <Typography fontSize={11} fontWeight={700} sx={{ color }}>{pct}%</Typography>
              </Box>
            ))}
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <OverallIcon sx={{ color: overallColor, fontSize: 16 }} />
              <Typography fontSize={11} fontWeight={700} sx={{ color: overallColor }}>
                {sentiment.overall === 'positive' ? 'Alcista' : sentiment.overall === 'negative' ? 'Bajista' : 'Neutral'}
              </Typography>
              <Typography fontSize={10} color="#555"> · {sentiment.total_articles} artículos</Typography>
            </Box>
          </Box>
        </>
      )}
    </Paper>
  )
}

function publisherColor(name = '') {
  return PUBLISHER_COLORS[name] || '#7c3aed'
}

function timeAgo(ts) {
  if (!ts) return ''
  try {
    return formatDistanceToNow(fromUnixTime(ts), { addSuffix: true, locale: es })
  } catch { return '' }
}

function formatDate(ts) {
  if (!ts) return ''
  try { return format(fromUnixTime(ts), "d MMM yyyy · HH:mm", { locale: es }) } catch { return '' }
}

// ─── Tarjeta de noticia grande (featured) ────────────────────────────────────
function FeaturedCard({ article }) {
  if (!article) return null
  const color = publisherColor(article.publisher)
  return (
    <Paper
      component="a" href={article.url} target="_blank" rel="noopener noreferrer"
      sx={{
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer', textDecoration: 'none', height: '100%',
        transition: 'border-color .2s, transform .2s',
        '&:hover': { borderColor: '#7c3aed55', transform: 'translateY(-3px)' },
      }}
    >
      {/* Thumbnail */}
      {article.thumbnail ? (
        <Box
          component="img" src={article.thumbnail} alt={article.title}
          sx={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      ) : (
        <Box sx={{
          width: '100%', height: 160,
          background: `linear-gradient(135deg, ${color}22, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Newspaper sx={{ fontSize: 56, color: color + '44' }} />
        </Box>
      )}

      <Box sx={{ p: 2.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Publisher + time */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            label={article.publisher || 'Fuente'}
            size="small"
            sx={{ bgcolor: color + '22', color, border: `1px solid ${color}44`, fontWeight: 700, fontSize: 10, height: 20 }}
          />
          {article.tickers?.slice(0, 3).map(t => (
            <Chip key={t} label={t} size="small"
              sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700, fontSize: 10, height: 20 }} />
          ))}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, ml: 'auto' }}>
            <Schedule sx={{ fontSize: 11, color: '#555' }} />
            <Typography color="#555" fontSize={11}>{timeAgo(article.published_at)}</Typography>
          </Box>
        </Box>

        {/* Title */}
        <Typography
          color="text.primary" fontWeight={700} fontSize={16} lineHeight={1.45} mb={1}
          sx={{ flex: 1 }}
        >
          {article.title}
        </Typography>

        {article.summary && (
          <Typography color="text.secondary" fontSize={12} lineHeight={1.5} mb={1}
            sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {article.summary}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          <OpenInNew sx={{ fontSize: 13, color: 'text.disabled' }} />
          <Typography color="text.disabled" fontSize={11}>{formatDate(article.published_at)}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}

// ─── Tarjeta de noticia compacta ─────────────────────────────────────────────
function CompactCard({ article }) {
  const color = publisherColor(article.publisher)
  return (
    <Box
      component="a" href={article.url} target="_blank" rel="noopener noreferrer"
      sx={{
        display: 'flex', gap: 1.5, py: 1.5, px: 1,
        borderRadius: 2, cursor: 'pointer', textDecoration: 'none',
        transition: 'background .15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Thumbnail pequeño o avatar */}
      {article.thumbnail ? (
        <Box
          component="img" src={article.thumbnail} alt=""
          sx={{ width: 64, height: 52, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none' }}
        />
      ) : (
        <Avatar sx={{ bgcolor: color + '33', width: 52, height: 52, borderRadius: 1.5, flexShrink: 0 }}>
          <Newspaper sx={{ fontSize: 22, color }} />
        </Avatar>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          color="text.primary" fontWeight={600} fontSize={13} lineHeight={1.4} mb={0.5}
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {article.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography fontSize={10} fontWeight={700} sx={{ color }}>{article.publisher}</Typography>
          {article.tickers?.slice(0, 2).map(t => (
            <Typography key={t} fontSize={10} color="secondary.main" fontWeight={700}>{t}</Typography>
          ))}
          <Typography color="text.disabled" fontSize={10} ml="auto" flexShrink={0}>{timeAgo(article.published_at)}</Typography>
        </Box>
      </Box>
    </Box>
  )
}

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function NewsSkeleton({ count = 6, featured = false }) {
  return (
    <Grid container spacing={2}>
      {[...Array(count)].map((_, i) => (
        <Grid item xs={12} sm={featured ? 6 : 12} md={featured ? 4 : 12} key={i}>
          <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            {featured && <Skeleton variant="rectangular" height={160} sx={{ bgcolor: 'action.hover' }} />}
            <Box sx={{ p: 2 }}>
              <Skeleton variant="text" width="30%" height={18} sx={{ bgcolor: '#2d2d4e', mb: 1 }} />
              <Skeleton variant="text" width="100%" height={20} sx={{ bgcolor: 'action.hover' }} />
              <Skeleton variant="text" width="80%" height={20} sx={{ bgcolor: 'action.hover' }} />
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function NewsPage() {
  const navigate          = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchInput,   setSearchInput]   = useState(searchParams.get('ticker') || '')
  const [activeTicker,  setActiveTicker]  = useState(searchParams.get('ticker') || '')
  const [activeCategory,setActiveCategory]= useState('general')  // general|forex|crypto|merger
  const [articles,      setArticles]      = useState([])
  const [trending,      setTrending]      = useState({})
  const [loading,       setLoading]       = useState(false)
  const [trendLoading,  setTrendLoading]  = useState(true)
  const [error,         setError]         = useState('')
  const [lastUpdated,   setLastUpdated]   = useState(null)
  const [activeTab,     setActiveTab]     = useState('all')   // 'all' | trending sector name
  const abortRef = useRef(null)

  // ── Cargar noticias ─────────────────────────────────────────────────────
  const loadNews = useCallback(async (ticker = '', category = 'general') => {
    setLoading(true)
    setError('')
    try {
      const data = await newsService.getNews(ticker, 40, category)
      setArticles(data.articles || [])
      setLastUpdated(new Date())
    } catch {
      setError('No se pudieron cargar las noticias. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Cargar trending al montar ───────────────────────────────────────────
  useEffect(() => {
    newsService.getTrending()
      .then(data => setTrending(data.by_sector || {}))
      .catch(() => {})
      .finally(() => setTrendLoading(false))
    loadNews(searchParams.get('ticker') || '', 'general')
  }, []) // eslint-disable-line

  const handleSearch = () => {
    const t = searchInput.trim().toUpperCase()
    setActiveTicker(t)
    setActiveTab('all')
    if (t) setSearchParams({ ticker: t })
    else setSearchParams({})
    loadNews(t, activeCategory)
  }

  const handleTickerChip = (t) => {
    setSearchInput(t)
    setActiveTicker(t)
    setActiveTab('all')
    setSearchParams({ ticker: t })
    loadNews(t, activeCategory)
  }

  const handleClear = () => {
    setSearchInput('')
    setActiveTicker('')
    setActiveTab('all')
    setSearchParams({})
    loadNews('', activeCategory)
  }

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat)
    setActiveTab('all')
    loadNews(activeTicker, cat)
  }

  // Artículos del tab activo
  const displayedArticles = activeTab === 'all'
    ? articles
    : (trending[activeTab] || [])

  const featured  = displayedArticles.slice(0, 3)
  const rest      = displayedArticles.slice(3)

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 8 }}>
      <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 } }}>

        {/* ── Cabecera ── */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" fontWeight={900} color="text.primary">
              📰 Noticias financieras
            </Typography>
            {lastUpdated && (
              <Chip
                label={`Actualizado ${formatDistanceToNow(lastUpdated, { addSuffix: true, locale: es })}`}
                size="small"
                sx={{ bgcolor: '#4caf5022', color: '#4caf50', border: '1px solid #4caf5033', fontSize: 11 }}
              />
            )}
          </Box>
          <Typography color="text.secondary">
            Noticias financieras en tiempo real vía <strong style={{ color: '#2196f3' }}>Finnhub</strong> — mercado, divisas, cripto y más
          </Typography>
        </Box>

        {/* ── Buscador ── */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <TickerAutocomplete
              value={searchInput}
              onInputChange={setSearchInput}
              onChange={(symbol) => {
                setSearchInput(symbol)
                setActiveTicker(symbol)
                setSearchParams({ ticker: symbol })
                loadNews(symbol)
              }}
              textFieldProps={{ onKeyDown: e => e.key === 'Enter' && handleSearch() }}
              placeholder="Buscar noticias de un ticker (ej: AAPL, TSLA, NVDA...)"
              size="small"
              sx={{
                flex: 1, minWidth: 220,
                '& .MuiOutlinedInput-root': {
                  color: '#fff', bgcolor: 'background.default',
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: '#7c3aed' },
                  '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
                },
                '& input': { py: 1.3 },
              }}
            />
            <Button
              variant="contained" onClick={handleSearch}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 3, whiteSpace: 'nowrap' }}
            >
              Buscar
            </Button>
            {activeTicker && (
              <Button variant="outlined" onClick={handleClear}
                sx={{ borderColor: 'divider', color: '#888', '&:hover': { borderColor: '#7c3aed', color: '#fff' } }}>
                Ver todo
              </Button>
            )}
            <Tooltip title="Recargar noticias">
              <IconButton
                onClick={() => loadNews(activeTicker)}
                sx={{ color: '#555', '&:hover': { color: '#7c3aed' } }}
              >
                <Refresh />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Quick-access tickers */}
          <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" color="#555" mr={0.5}>Populares:</Typography>
            {POPULAR.map(t => (
              <Chip key={t} label={t} size="small"
                onClick={() => handleTickerChip(t)}
                sx={{
                  bgcolor: activeTicker === t ? '#7c3aed22' : 'transparent',
                  color:   activeTicker === t ? '#b89eff' : '#666',
                  border:  `1px solid ${activeTicker === t ? '#7c3aed55' : '#2d2d4e'}`,
                  cursor: 'pointer', fontWeight: 700, fontSize: 11,
                  '&:hover': { bgcolor: '#7c3aed11', color: '#b89eff' },
                  transition: 'all .15s',
                }}
              />
            ))}
          </Box>
        </Paper>

        {/* ── Filtro de categoría Finnhub (solo sin ticker activo) ── */}
        {!activeTicker && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <Typography color="#555" fontSize={12} mr={0.5} alignSelf="center">Categoría:</Typography>
            {FINNHUB_CATEGORIES.map(({ key, label }) => (
              <Chip
                key={key}
                label={label}
                onClick={() => handleCategoryChange(key)}
                sx={{
                  bgcolor:     activeCategory === key ? '#2196f3' : 'background.paper',
                  color:       activeCategory === key ? '#fff' : 'text.secondary',
                  borderColor: activeCategory === key ? '#2196f3' : 'divider',
                  border: '1px solid',
                  fontWeight: 700, cursor: 'pointer', fontSize: 12,
                  '&:hover': { bgcolor: activeCategory === key ? '#2196f3' : 'action.hover' },
                  transition: 'all .15s',
                }}
              />
            ))}
          </Box>
        )}

        {/* ── Tabs de trending por sector ── */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          <Chip
            label="📰 Noticias principales"
            onClick={() => { setActiveTab('all'); loadNews(activeTicker, activeCategory) }}
            sx={{
              bgcolor:     activeTab === 'all' ? '#7c3aed' : 'background.paper',
              color:       activeTab === 'all' ? '#fff' : 'text.secondary',
              borderColor: activeTab === 'all' ? '#7c3aed' : 'divider',
              border: '1px solid',
              fontWeight: 700, cursor: 'pointer', fontSize: 12,
              '&:hover': { bgcolor: activeTab === 'all' ? '#7c3aed' : 'action.hover' },
            }}
          />
          {TRENDING_SECTORS.map(s => (
            <Chip
              key={s}
              label={s}
              onClick={() => setActiveTab(s)}
              sx={{
                bgcolor:     activeTab === s ? '#7c3aed' : 'background.paper',
                color:       activeTab === s ? '#fff' : 'text.secondary',
                borderColor: activeTab === s ? '#7c3aed' : 'divider',
                border: '1px solid',
                fontWeight: 700, cursor: 'pointer', fontSize: 12,
                '&:hover': { bgcolor: activeTab === s ? '#7c3aed' : 'action.hover' },
                transition: 'all .15s',
              }}
            />
          ))}
          <Typography color="#555" fontSize={12} sx={{ ml: 'auto', alignSelf: 'center' }}>
            {displayedArticles.length} artículos
          </Typography>
        </Box>

        {/* ── Ticker activo badge ── */}
        {activeTicker && activeTab === 'all' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUp sx={{ color: '#2196f3', fontSize: 16 }} />
            <Typography color="text.secondary" fontSize={13}>
              Mostrando noticias de{' '}
              <span style={{ color: '#2196f3', fontWeight: 700 }}>{activeTicker}</span>
            </Typography>
            <Button
              size="small" startIcon={<ArrowForward sx={{ fontSize: 13 }} />}
              onClick={() => navigate(`/prediction?ticker=${activeTicker}`)}
              sx={{ color: '#7c3aed', fontSize: 11, ml: 1, textTransform: 'none',
                '&:hover': { bgcolor: '#7c3aed11' } }}
            >
              Ver predicciones de {activeTicker}
            </Button>
          </Box>
        )}

        {/* ── Sentimiento del ticker activo ── */}
        {activeTicker && activeTab === 'all' && (
          <SentimentWidget ticker={activeTicker} />
        )}

        {/* ── Estado de carga / error ── */}
        {(loading || (trendLoading && activeTab !== 'all')) && (
          <NewsSkeleton count={6} featured />
        )}

        {error && !loading && (
          <Paper sx={{ bgcolor: '#2d1515', border: '1px solid #f4433633', borderRadius: 2, p: 2.5, mb: 3 }}>
            <Typography color="#f44336">{error}</Typography>
            <Button onClick={() => loadNews(activeTicker)} sx={{ color: '#f44336', mt: 1 }}>
              Reintentar
            </Button>
          </Paper>
        )}

        {/* ── Contenido ── */}
        {!loading && !error && displayedArticles.length > 0 && (
          <Box>
            {/* Featured top 3 */}
            <Grid container spacing={2.5} mb={3}>
              {featured.map((art, i) => (
                <Grid item xs={12} sm={6} md={4} key={art.id || i}>
                  <FeaturedCard article={art} />
                </Grid>
              ))}
            </Grid>

            {rest.length > 0 && (
              <>
                <Divider sx={{ borderColor: 'divider', mb: 3 }} />
                <Typography fontWeight={700} color="text.primary" mb={2} fontSize={15}>
                  Más noticias
                </Typography>
                <Grid container spacing={0}>
                  <Grid item xs={12} md={8}>
                    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden' }}>
                      {rest.map((art, i) => (
                        <Box key={art.id || i}>
                          {i > 0 && <Divider sx={{ borderColor: 'divider', mx: 2 }} />}
                          <CompactCard article={art} />
                        </Box>
                      ))}
                    </Paper>
                  </Grid>

                  {/* Sidebar: trending por sector (sólo en tab "all") */}
                  {activeTab === 'all' && (
                    <Grid item xs={12} md={4}>
                      <Box sx={{ pl: { md: 2.5 }, mt: { xs: 3, md: 0 } }}>
                        <Typography fontWeight={700} color="text.primary" mb={2} fontSize={15}>
                          🔥 Tendencias por sector
                        </Typography>
                        {trendLoading ? (
                          <NewsSkeleton count={3} />
                        ) : (
                          Object.entries(trending).map(([sector, arts]) => (
                            arts.length > 0 && (
                              <Paper key={sector} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, mb: 2, overflow: 'hidden' }}>
                                <Box sx={{ px: 2, py: 1.2, borderBottom: '1px solid', borderBottomColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography fontWeight={700} color="text.secondary" fontSize={13}>{sector}</Typography>
                                  <Button size="small"
                                    onClick={() => { setActiveTab(sector) }}
                                    sx={{ color: '#7c3aed', fontSize: 10, textTransform: 'none', minWidth: 'auto', p: 0 }}>
                                    Ver más
                                  </Button>
                                </Box>
                                {arts.slice(0, 3).map((art, i) => (
                                  <Box key={art.id || i}>
                                    {i > 0 && <Divider sx={{ borderColor: 'divider', mx: 1.5 }} />}
                                    <CompactCard article={art} />
                                  </Box>
                                ))}
                              </Paper>
                            )
                          ))
                        )}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </>
            )}
          </Box>
        )}

        {!loading && !error && displayedArticles.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 10, color: '#555' }}>
            <Newspaper sx={{ fontSize: 64, mb: 2, opacity: 0.2 }} />
            <Typography variant="h6" color="#666" mb={1}>Sin noticias disponibles</Typography>
            <Typography variant="body2" color="#555">
              Intenta con otro ticker o categoría
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
