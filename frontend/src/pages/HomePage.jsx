import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Box, Typography, Button, Grid, Chip, Paper, Avatar,
  InputBase, IconButton, Skeleton,
} from '@mui/material'
import {
  Search, TrendingUp, TrendingDown, ShowChart, Notifications, Star,
  FormatQuote, Storefront, Paid, Casino, Newspaper,
} from '@mui/icons-material'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { reviewService } from '@/services/reviewService'
import { stockService } from '@/services/stockService'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'
import { POPULAR_TICKERS } from '@/utils/constants'

// dechever - 05/02/2026: dejé preparada la home y el dashboard con una primera versión clara para enseñar el producto.
const FEATURES = [
  { icon: <ShowChart sx={{ fontSize: 36, color: '#7c3aed' }} />, title: 'Predicciones ML', desc: 'Exponential Smoothing, ARIMA y SMA para predicciones precisas de hasta 90 días.', route: '/prediction' },
  { icon: <TrendingUp sx={{ fontSize: 36, color: '#2196f3' }} />, title: 'Backtesting', desc: 'Valida estrategias con datos históricos reales antes de invertir.', route: '/backtest' },
  { icon: <Newspaper sx={{ fontSize: 36, color: '#4caf50' }} />, title: 'Noticias', desc: 'Noticias financieras en tiempo real de Yahoo Finance filtradas por empresa.', route: '/news' },
  { icon: <Notifications sx={{ fontSize: 36, color: '#ff9800' }} />, title: 'Portfolio virtual', desc: 'Gestiona tu cartera virtual, registra operaciones y sigue tu rendimiento.', route: '/portfolio' },
]

const PRODUCT_AREAS = [
  { icon: <ShowChart sx={{ fontSize: 34, color: '#ff9800' }} />, title: 'Predicciones y analisis', desc: 'Genera predicciones ML, valida ideas y convierte una tesis en una decision clara.', route: '/prediction' },
  { icon: <Storefront sx={{ fontSize: 34, color: '#4caf50' }} />, title: 'Marketplace', desc: 'Estrategias publicadas por usuarios, desbloqueadas con monedas internas y reutilizables.', route: '/marketplace' },
  { icon: <Paid sx={{ fontSize: 34, color: '#f59e0b' }} />, title: 'Monedas internas', desc: 'Stripe gestiona recargas y suscripciones; las compras internas se pagan con saldo virtual.', route: '/coins/buy' },
  { icon: <Casino sx={{ fontSize: 34, color: '#ec4899' }} />, title: 'Gamificacion', desc: 'Ruleta diaria y recompensas para cerrar el ciclo de participacion.', route: '/wheel' },
]

const TESTIMONIALS = [
  {
    name: 'Carlos M.', role: 'Inversor particular', initials: 'CM', color: '#7c3aed',
    stars: 5, verified: true,
    text: 'Llevo 6 meses usando MyPredicts y ha cambiado completamente mi forma de invertir. Las predicciones ARIMA aciertan con una precisión sorprendente en tendencias de 2-3 semanas.',
  },
  {
    name: 'Sofía R.', role: 'Analista financiera', initials: 'SR', color: '#2196f3',
    stars: 5, verified: true,
    text: 'El módulo de backtesting me ahorra horas de trabajo. Puedo validar cualquier estrategia sobre datos históricos reales antes de arriesgar capital. Imprescindible.',
  },
  {
    name: 'Alejandro V.', role: 'Day trader', initials: 'AV', color: '#4caf50',
    stars: 4, verified: true,
    text: 'Las alertas de precio son muy precisas. Configuro mis objetivos y la app me avisa al instante. El portafolio virtual para probar estrategias es una pasada.',
  },
  {
    name: 'Laura T.', role: 'Estudiante de finanzas', initials: 'LT', color: '#ff9800',
    stars: 5, verified: false,
    text: 'Empecé sin saber nada de análisis técnico. Con MyPredicts aprendí a interpretar gráficos, indicadores y modelos ML de forma visual e intuitiva. Muy recomendable.',
  },
  {
    name: 'Javier P.', role: 'Gestor de fondos', initials: 'JP', color: '#e91e63',
    stars: 5, verified: true,
    text: 'El marketplace de estrategias es lo que mas me sorprendio. Puedo guardar mis propias ideas, venderlas con monedas y comprar estrategias de otros usuarios cuando me interesa.',
  },
  {
    name: 'María G.', role: 'Emprendedora', initials: 'MG', color: '#00bcd4',
    stars: 4, verified: false,
    text: 'Usaba varias apps por separado para ver gráficos, noticias y predicciones. MyPredicts lo centraliza todo. La interfaz es limpia y va muy fluida. Gran trabajo.',
  },
]

const STATS = [
  { value: '12.400+', label: 'Usuarios activos' },
  { value: '98.7%', label: 'Uptime garantizado' },
  { value: '3 modelos', label: 'de ML integrados' },
  { value: '4.8 / 5', label: 'Valoración media' },
]

// Tooltip personalizado para los mini-gráficos
function MiniTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.5 }}>
      <Typography variant="caption" color="#fff">${Number(payload[0].value).toFixed(2)}</Typography>
    </Box>
  )
}

// Tarjeta individual de ticker con mini-gráfico
function TickerCard({ ticker, onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await stockService.getStock(ticker, 30)
        if (cancelled) return
        if (res?.data?.length) {
          setData(res)
        } else {
          setError(true)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ticker])

  if (loading) {
    return (
      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, cursor: 'pointer', height: 140 }}>
        <Skeleton variant="text" width={60} sx={{ bgcolor: '#2d2d4e' }} />
        <Skeleton variant="text" width={100} sx={{ bgcolor: '#2d2d4e', mb: 1 }} />
        <Skeleton variant="rectangular" height={55} sx={{ bgcolor: '#2d2d4e', borderRadius: 1 }} />
      </Paper>
    )
  }

  if (error || !data) {
    return (
      <Paper onClick={() => onNavigate(ticker)}
        sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2,
          cursor: 'pointer', height: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          '&:hover': { borderColor: '#7c3aed' }, transition: 'border-color .2s' }}>
        <Typography fontWeight={800} color="#fff" fontSize={18}>{ticker}</Typography>
        <Typography variant="caption" color="#555">Sin datos disponibles</Typography>
      </Paper>
    )
  }

  const chartData = data.data.map(d => ({ v: Number(d.close) }))
  const firstClose = chartData[0]?.v || 0
  const lastClose = chartData[chartData.length - 1]?.v || 0
  const change = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0
  const isUp = change >= 0
  const color = isUp ? '#4caf50' : '#f44336'

  return (
    <Paper
      onClick={() => onNavigate(ticker)}
      sx={{
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2,
        cursor: 'pointer', height: 140, display: 'flex', flexDirection: 'column',
        transition: 'border-color .2s, transform .15s',
        '&:hover': { borderColor: '#7c3aed', transform: 'translateY(-2px)' },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
        <Box>
          <Typography fontWeight={800} color="#fff" fontSize={15} lineHeight={1.2}>{ticker}</Typography>
          <Typography variant="caption" color="#888" sx={{ fontSize: 11 }}>
            {data.name?.split(' ').slice(0, 2).join(' ') || ticker}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography fontWeight={700} color="#fff" fontSize={14}>${lastClose.toFixed(2)}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.3 }}>
            {isUp ? <TrendingUp sx={{ fontSize: 13, color }} /> : <TrendingDown sx={{ fontSize: 13, color }} />}
            <Typography sx={{ fontSize: 11, color, fontWeight: 700 }}>
              {isUp ? '+' : ''}{change.toFixed(2)}%
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Mini chart */}
      <Box sx={{ flex: 1, mt: 0.5 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone" dataKey="v"
              stroke={color} strokeWidth={1.5}
              fill={`url(#grad-${ticker})`}
              dot={false} isAnimationActive={false}
            />
            <Tooltip content={<MiniTooltip />} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate  = useNavigate()
  const { isAuthenticated } = useSelector(s => s.auth)
  const [searchTicker, setSearchTicker] = useState('')
  const [userReviews, setUserReviews] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const reviews = await reviewService.list({ per_page: 6, sort: 'top' }).catch(() => ({ reviews: [] }))
        setUserReviews(reviews?.reviews || [])
      } catch { /* silent */ }
    }
    load()
  }, [])

  const handleSearch = useCallback(() => {
    const t = searchTicker.trim().toUpperCase()
    if (t) navigate(`/prediction?ticker=${t}`)
  }, [searchTicker, navigate])

  const displayReviews = userReviews.length
    ? userReviews.map(r => ({
        name: r.author_name || r.author_username || 'Usuario MyPredicts',
        role: r.role || 'Usuario verificado',
        initials: (r.author_name || r.author_username || 'MP').slice(0, 2).toUpperCase(),
        color: '#7c3aed',
        stars: r.stars || 5,
        verified: r.verified !== false,
        text: r.text,
      }))
    : TESTIMONIALS

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>

      {/* ── Hero ── */}
      <Box sx={{
        pt: { xs: 10, md: 16 }, pb: 8, textAlign: 'center', px: 2,
        background: 'radial-gradient(ellipse at top, #1a1a3e 0%, #0f0f23 70%)',
      }}>
        <Typography variant="h2" fontWeight={900} sx={{
          mb: 2, fontSize: { xs: '2.2rem', md: '3.5rem' },
          background: 'linear-gradient(135deg, #7c3aed 30%, #2196f3 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Predice el Mercado<br />con Inteligencia Artificial
        </Typography>
        <Typography color="#aaa" sx={{ mb: 4, maxWidth: 560, mx: 'auto', fontSize: { xs: 16, md: 18 } }}>
          Análisis técnico avanzado, modelos ML y backtesting en una sola plataforma.
        </Typography>

        {/* Buscador */}
        <Box sx={{ maxWidth: 560, mx: 'auto', mb: 4, display: 'flex', gap: 1 }}>
          <TickerAutocomplete
            placeholder="Buscar ticker (ej: AAPL, TSLA, NVDA...)"
            value={searchTicker}
            onInputChange={setSearchTicker}
            onChange={(symbol) => { setSearchTicker(symbol); navigate(`/prediction?ticker=${symbol}`) }}
            fullWidth
            textFieldProps={{ onKeyDown: e => e.key === 'Enter' && handleSearch() }}
          />
          <IconButton onClick={handleSearch} sx={{ color: '#7c3aed' }}><Search /></IconButton>
        </Box>

        {/* Tickers rápidos */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mb: 5 }}>
          {POPULAR_TICKERS.map(t => (
            <Chip key={t} label={t} onClick={() => navigate(`/prediction?ticker=${t}`)}
              sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700, cursor: 'pointer', '&:hover': { bgcolor: '#2196f344' } }} />
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isAuthenticated ? (
            <Button variant="contained" size="large" onClick={() => navigate('/dashboard')}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', px: 4, fontWeight: 700 }}>
              Ir al Dashboard
            </Button>
          ) : (
            <>
              <Button variant="contained" size="large" onClick={() => navigate('/register')}
                sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', px: 4, fontWeight: 700 }}>
                Empezar gratis
              </Button>
              <Button variant="outlined" size="large" onClick={() => navigate('/login')}
                sx={{ borderColor: 'divider', color: '#ccc', px: 4 }}>
                Iniciar sesión
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* ── Mercado en vivo ── */}
      <Box sx={{ py: 6, px: { xs: 2, md: 6 }, maxWidth: 1200, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} color="#fff">Mercado en vivo</Typography>
            <Typography variant="body2" color="#888">Últimos 30 días · Haz clic para analizar</Typography>
          </Box>
          <Button
            variant="outlined" size="small"
            onClick={() => navigate('/prediction')}
            sx={{ borderColor: 'divider', color: '#aaa', fontSize: 12 }}
          >
            Ver análisis completo →
          </Button>
        </Box>

        <Grid container spacing={2}>
          {POPULAR_TICKERS.map(t => (
            <Grid item xs={6} sm={4} md={3} key={t}>
              <TickerCard ticker={t} onNavigate={tk => navigate(`/prediction?ticker=${tk}`)} />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Features ── */}
      <Box sx={{ py: 8, px: { xs: 2, md: 6 }, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h4" fontWeight={700} color="#fff" textAlign="center" mb={6}>
          Todo lo que necesitas para analizar el mercado
        </Typography>
        <Grid container spacing={3}>
          {FEATURES.map(f => (
            <Grid item xs={12} sm={6} md={4} lg={2.4} key={f.title}>
              <Paper onClick={() => navigate(f.route)} sx={{
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3,
                textAlign: 'center', cursor: 'pointer',
                transition: 'border-color .2s, transform .2s',
                '&:hover': { borderColor: '#7c3aed', transform: 'translateY(-3px)' },
              }}>
                <Box mb={1.5}>{f.icon}</Box>
                <Typography fontWeight={700} color="#fff" mb={1}>{f.title}</Typography>
                <Typography variant="body2" color="#888">{f.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Testimonials ── */}
      <Box sx={{ py: 7, px: { xs: 2, md: 6 }, maxWidth: 1180, mx: 'auto' }}>
        <Box textAlign="center" mb={4}>
          <Typography variant="h4" fontWeight={800} color="#fff">
            Una plataforma conectada
          </Typography>
          <Typography color="#888" sx={{ mt: 1, maxWidth: 720, mx: 'auto' }}>
            MyPredicts conecta predicciones financieras, marketplace, monedas internas, suscripciones y gamificacion en un flujo claro para el usuario.
          </Typography>
        </Box>
        <Grid container spacing={2.5}>
          {PRODUCT_AREAS.map(area => (
            <Grid item xs={12} sm={6} md={3} key={area.title}>
              <Paper onClick={() => navigate(area.route)} sx={{
                height: '100%', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                borderRadius: 2, p: 2.4, cursor: 'pointer',
                '&:hover': { borderColor: '#7c3aed', transform: 'translateY(-2px)' },
                transition: 'border-color .18s, transform .18s',
              }}>
                <Box mb={1.3}>{area.icon}</Box>
                <Typography color="#fff" fontWeight={900} mb={1}>{area.title}</Typography>
                <Typography color="#888" fontSize={13}>{area.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box sx={{ py: 8, px: { xs: 2, md: 6 }, background: 'radial-gradient(ellipse at center, #1a1a3e 0%, #0f0f23 70%)' }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <Box textAlign="center" mb={6}>
            <Chip label="✨ OPINIONES REALES" size="small"
              sx={{ bgcolor: '#7c3aed22', color: '#b89eff', border: '1px solid #7c3aed44', mb: 2, fontWeight: 700, letterSpacing: 1 }} />
            <Typography variant="h4" fontWeight={700} color="#fff" mb={1}>
              Lo que dicen nuestros usuarios
            </Typography>
            <Typography color="#888" mb={3}>Miles de inversores ya usan MyPredicts para tomar mejores decisiones</Typography>
            <Button variant="outlined" onClick={() => navigate('/reviews')}
              sx={{ borderColor: '#7c3aed66', color: '#b89eff', '&:hover': { borderColor: '#7c3aed', bgcolor: '#7c3aed11' } }}>
              Ver todas las valoraciones →
            </Button>
          </Box>

          <Grid container spacing={3}>
            {displayReviews.map((t, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Paper onClick={() => navigate('/reviews')} sx={{
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3, height: '100%',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  cursor: 'pointer', transition: 'border-color .2s, transform .2s',
                  '&:hover': { borderColor: '#7c3aed55', transform: 'translateY(-3px)' },
                }}>
                  {/* Quote icon */}
                  <Box>
                    <FormatQuote sx={{ color: '#7c3aed44', fontSize: 40, mb: 1, transform: 'scaleX(-1)' }} />
                    <Typography color="#ccc" fontSize={14} lineHeight={1.7} mb={2.5}>
                      "{t.text}"
                    </Typography>
                  </Box>
                  {/* Stars */}
                  <Box>
                    <Box sx={{ display: 'flex', gap: 0.3, mb: 2 }}>
                      {[...Array(5)].map((_, si) => (
                        <Star key={si} sx={{ fontSize: 16, color: si < t.stars ? '#ffc107' : '#2d2d4e' }} />
                      ))}
                    </Box>
                    {/* Author */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ bgcolor: t.color, width: 40, height: 40, fontWeight: 800, fontSize: 16 }}>
                        {t.initials}
                      </Avatar>
                      <Box>
                        <Typography color="#fff" fontWeight={700} fontSize={14}>{t.name}</Typography>
                        <Typography color="#888" fontSize={12}>{t.role}</Typography>
                      </Box>
                      {t.verified && (
                        <Chip label="✓ Verificado" size="small"
                          sx={{ ml: 'auto', bgcolor: '#4caf5011', color: '#4caf50', border: '1px solid #4caf5033', fontSize: 10, height: 20 }} />
                      )}
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Stats strip */}
          <Grid container spacing={2} mt={5}>
            {STATS.map((s, i) => (
              <Grid item xs={6} sm={3} key={i}>
                <Box textAlign="center">
                  <Typography variant="h4" fontWeight={900}
                    sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {s.value}
                  </Typography>
                  <Typography color="#888" variant="body2">{s.label}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

    </Box>
  )
}
