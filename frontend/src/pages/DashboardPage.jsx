import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box, Typography, Grid, Paper, Chip, Button, Skeleton, Avatar,
  Card, CardContent, CardActionArea, Divider, CircularProgress,
  LinearProgress,
} from '@mui/material'
import {
  TrendingUp, ShowChart, Notifications, AccountBalance, Star,
  ArrowForward, People, AdminPanelSettings, Storage, BarChart,
  Block, CheckCircle, NotificationsActive, Warning,
  FiberManualRecord, Refresh, ArrowUpward,
} from '@mui/icons-material'
import { fetchPortfolios } from '@/store/slices/portfolioSlice'
import { fetchPredictions } from '@/store/slices/predictionSlice'
import { formatCurrency, formatDate, getPnlColor } from '@/utils/formatters'
import api from '@/services/api'
import { toast } from 'react-toastify'

// Shared components

function StatCard({ label, value, sub, color = 'text.primary', icon }) {
  return (
    <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="caption" color="text.disabled">{label}</Typography>
          <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
        </Box>
        {icon && <Box sx={{ color: 'text.disabled', opacity: 0.5 }}>{icon}</Box>}
      </Box>
    </Paper>
  )
}

// ADMIN DASHBOARD

function AdminDashboard({ user }) {
  const navigate = useNavigate()
  const [stats,    setStats]    = useState(null)
  const [monitor,  setMonitor]  = useState(null)
  const [loading,  setLoading]  = useState(true)

  const loadStats = useCallback(async () => {
    try {
      const [statsRes, monitorRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/data-status'),
      ])
      setStats(statsRes.data)
      setMonitor(monitorRes.data)
    } catch {
      toast.error('Error cargando estadísticas admin')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const adminCards = [
    {
      label: 'Gestión de usuarios',
      desc:  'Bloquear, promover y gestionar todos los usuarios de la plataforma.',
      icon:  <People sx={{ fontSize: 32, color: '#7c3aed' }} />,
      color: '#7c3aed',
      path:  '/admin',
      tab:   0,
    },
    {
      label: 'Alertas globales',
      desc:  'Ver y eliminar alertas de precio de todos los usuarios.',
      icon:  <NotificationsActive sx={{ fontSize: 32, color: '#ff9800' }} />,
      color: '#ff9800',
      path:  '/admin',
      tab:   1,
    },
    {
      label: 'Estadísticas y gráficas',
      desc:  'Actividad global: predicciones, registros, top tickers y top usuarios.',
      icon:  <BarChart sx={{ fontSize: 32, color: '#2196f3' }} />,
      color: '#2196f3',
      path:  '/admin',
      tab:   2,
    },
    {
      label: 'Monitor de datos',
      desc:  'Estado en tiempo real de los datos de cada ticker en la base de datos.',
      icon:  <Storage sx={{ fontSize: 32, color: '#4caf50' }} />,
      color: '#4caf50',
      path:  '/admin',
      tab:   3,
    },
  ]

  const u = stats?.users
  const statusMap = { fresh: { label: 'Frescos', color: '#4caf50' }, recent: { label: 'Recientes', color: '#ff9800' }, stale: { label: 'Desactualizados', color: '#f44336' } }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1300, mx: 'auto' }}>

        {/* ── Cabecera admin ── */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: '#7c3aed', width: 52, height: 52, fontWeight: 700, fontSize: 22 }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h5" fontWeight={800} color="text.primary">
                  Panel de Administración
                </Typography>
                <Chip label="Admin" size="small"
                  sx={{ bgcolor: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed55', fontWeight: 700, fontSize: 11 }} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Bienvenido, @{user?.username} · {formatDate(new Date())}
              </Typography>
            </Box>
          </Box>
          <Button
            variant="outlined" startIcon={<Refresh />} onClick={loadStats}
            sx={{ borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: '#7c3aed', color: '#7c3aed' } }}>
            Actualizar
          </Button>
        </Box>

        {/* ── Stats globales ── */}
        {loading ? (
          <Grid container spacing={2} mb={4}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Grid item xs={6} sm={4} md={3} key={i}>
                <Skeleton variant="rounded" height={90} sx={{ bgcolor: 'action.hover' }} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Grid container spacing={2} mb={4}>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Usuarios totales" value={u?.total ?? '—'} icon={<People fontSize="large" />} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Usuarios activos" value={u?.active ?? '—'} color="#4caf50" icon={<CheckCircle fontSize="large" />} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Bloqueados" value={u?.blocked ?? '—'} color="#f44336" icon={<Block fontSize="large" />} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Nuevos esta semana" value={u?.new_this_week ?? '—'} color="#2196f3" icon={<ArrowUpward fontSize="large" />} sub="últimos 7 días" />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Predicciones totales" value={stats?.predictions?.total ?? '—'} icon={<ShowChart fontSize="large" />} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Predicciones hoy" value={stats?.predictions?.today ?? '—'} color="#ff9800" icon={<Notifications fontSize="large" />}
                sub={`${stats?.predictions?.total ?? 0} en total`} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Análisis compartidos" value={stats?.analyses?.total ?? '—'} icon={<BarChart fontSize="large" />} />
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <StatCard label="Backtests realizados" value={stats?.backtests?.total ?? '—'} icon={<TrendingUp fontSize="large" />} />
            </Grid>
          </Grid>
        )}

        {/* ── Accesos directos al panel ── */}
        <Typography variant="h6" fontWeight={800} color="text.primary" mb={2}>
          Panel de administración
        </Typography>
        <Grid container spacing={2.5} mb={4}>
          {adminCards.map(card => (
            <Grid item xs={12} sm={6} md={3} key={card.label}>
              <Card
                sx={{
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                  height: '100%', transition: 'border-color .2s, transform .2s',
                  '&:hover': { borderColor: card.color, transform: 'translateY(-3px)' },
                }}
              >
                <CardActionArea
                  sx={{ height: '100%', p: 2.5 }}
                  onClick={() => navigate('/admin', { state: { tab: card.tab } })}
                >
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ bgcolor: `${card.color}18`, width: 52, height: 52, borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
                      {card.icon}
                    </Box>
                    <Typography fontWeight={700} color="text.primary" fontSize={15}>{card.label}</Typography>
                  </Box>
                  <Typography color="text.secondary" fontSize={12} lineHeight={1.5}>{card.desc}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 2 }}>
                    <Typography fontSize={12} fontWeight={600} sx={{ color: card.color }}>Ir al apartado</Typography>
                    <ArrowForward sx={{ fontSize: 14, color: card.color }} />
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* ── Monitor de datos + acceso rápido admin ── */}
        <Grid container spacing={3}>
          {/* Monitor resumen */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Storage sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography fontWeight={700} color="text.primary">Estado de datos de mercado</Typography>
                </Box>
                <Button size="small" endIcon={<ArrowForward />}
                  onClick={() => navigate('/admin', { state: { tab: 3 } })}
                  sx={{ color: '#4caf50', fontSize: 12 }}>
                  Monitor completo
                </Button>
              </Box>

              {loading || !monitor ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1, bgcolor: 'action.hover' }} />
                ))
              ) : (
                <>
                  {/* Resumen de estado */}
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    {Object.entries(statusMap).map(([key, { label, color }]) => (
                      <Chip key={key} size="small"
                        icon={<FiberManualRecord sx={{ color: `${color} !important`, fontSize: 10 }} />}
                        label={`${label}: ${monitor.summary?.[key] ?? 0}`}
                        sx={{ bgcolor: `${color}18`, color, border: `1px solid ${color}44`, fontWeight: 700, fontSize: 11 }} />
                    ))}
                  </Box>

                  {/* Top 6 tickers con barra de edad */}
                  {(monitor.tickers || []).slice(0, 6).map(t => {
                    const pct = Math.min((t.age_hours / 24) * 100, 100)
                    const barColor = t.status === 'fresh' ? '#4caf50' : t.status === 'recent' ? '#ff9800' : '#f44336'
                    return (
                      <Box key={t.ticker} sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.4 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FiberManualRecord sx={{ color: barColor, fontSize: 10 }} />
                            <Typography fontSize={13} fontWeight={600} color="text.primary">{t.ticker}</Typography>
                          </Box>
                          <Typography fontSize={11} color="text.disabled">
                            {t.age_hours < 1
                              ? `${Math.round(t.age_hours * 60)}m`
                              : `${t.age_hours.toFixed(1)}h`} · {t.total_rows.toLocaleString()} filas
                          </Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={pct}
                          sx={{ height: 4, borderRadius: 2, bgcolor: `${barColor}22`,
                            '& .MuiLinearProgress-bar': { bgcolor: barColor, borderRadius: 2 } }} />
                      </Box>
                    )
                  })}
                </>
              )}
            </Paper>
          </Grid>

          {/* Acciones rápidas de admin */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AdminPanelSettings sx={{ color: '#7c3aed', fontSize: 20 }} />
                <Typography fontWeight={700} color="text.primary">Acciones rápidas</Typography>
              </Box>
              {[
                { label: 'Ver todos los usuarios',    sub: 'Gestionar roles y accesos',    icon: <People />,              color: '#7c3aed', tab: 0 },
                { label: 'Gestionar alertas',         sub: 'Eliminar alertas de usuarios', icon: <Warning />,             color: '#ff9800', tab: 1 },
                { label: 'Ver estadísticas globales', sub: 'Gráficas de uso y actividad',  icon: <BarChart />,            color: '#2196f3', tab: 2 },
                { label: 'Monitor en tiempo real',    sub: 'Datos frescos vs desactualiz.', icon: <Storage />,            color: '#4caf50', tab: 3 },
              ].map(a => (
                <Box key={a.label}
                  onClick={() => navigate('/admin', { state: { tab: a.tab } })}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 1.5,
                    borderRadius: 1.5, cursor: 'pointer', mb: 0.5,
                    transition: 'background .15s',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                  <Box sx={{ bgcolor: `${a.color}18`, p: 1, borderRadius: 1.5, color: a.color, display: 'flex' }}>
                    {a.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontSize={13} fontWeight={700} color="text.primary">{a.label}</Typography>
                    <Typography fontSize={11} color="text.secondary">{a.sub}</Typography>
                  </Box>
                  <ArrowForward sx={{ fontSize: 16, color: 'text.disabled' }} />
                </Box>
              ))}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}

// USER DASHBOARD (normal)


function UserDashboard({ user }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { list: portfolios, isLoading: pLoading }   = useSelector(s => s.portfolio)
  const { list: predictions, isLoading: predLoading } = useSelector(s => s.prediction)

  useEffect(() => {
    dispatch(fetchPortfolios())
    dispatch(fetchPredictions({ limit: 5 }))
  }, []) // eslint-disable-line

  const totalValue    = portfolios.reduce((acc, p) => acc + (p.current_value   || 0), 0)
  const totalInvested = portfolios.reduce((acc, p) => acc + (p.total_invested  || 0), 0)
  const totalPnl      = totalValue - totalInvested
  const pnlColor      = getPnlColor(totalPnl)

  const recentPreds = Array.isArray(predictions) ? predictions.slice(0, 5) : []
  const favorites   = user?.favorites || []

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: '#7c3aed', width: 48, height: 48, fontWeight: 700, fontSize: 20 }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={700} color="text.primary">
                Hola, {user?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">{formatDate(new Date())}</Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<ShowChart />} onClick={() => navigate('/prediction')}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}>
            Nueva predicción
          </Button>
        </Box>

        {/* Stats */}
        <Grid container spacing={2} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard label="Valor total cartera" value={pLoading ? '...' : formatCurrency(totalValue)}
              icon={<AccountBalance fontSize="large" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard label="Ganancias / Pérdidas" value={pLoading ? '...' : formatCurrency(totalPnl)}
              color={pnlColor} icon={<TrendingUp fontSize="large" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard label="Carteras activas" value={portfolios.length}
              sub={`${portfolios.reduce((a, p) => a + (p.positions_count || 0), 0)} posiciones`}
              icon={<AccountBalance fontSize="large" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard label="Predicciones" value={recentPreds.length}
              sub="recientes" icon={<ShowChart fontSize="large" />} />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Recent predictions */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography fontWeight={700} color="text.primary">Predicciones recientes</Typography>
                <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/prediction')}
                  sx={{ color: '#7c3aed' }}>Ver todas</Button>
              </Box>
              {predLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 1, bgcolor: 'action.hover' }} />
                ))
              ) : recentPreds.length ? recentPreds.map(pred => (
                <Box key={pred.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  py: 1.5, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer',
                  '&:hover': { opacity: 0.8 } }}
                  onClick={() => navigate(`/prediction?ticker=${pred.ticker}&group=${pred.group_id}`)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Chip label={pred.ticker} size="small" sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700 }} />
                    <Typography variant="body2" color="text.secondary">{pred.model} · {pred.horizon}d</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" fontWeight={600} color={pred.trend === 'up' ? '#4caf50' : '#f44336'}>
                      {pred.trend === 'up' ? '▲' : '▼'} {pred.first_prediction ? formatCurrency(pred.first_prediction) : '—'}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">{formatDate(pred.created_at)}</Typography>
                  </Box>
                </Box>
              )) : (
                <Box py={3} textAlign="center">
                  <Typography color="text.disabled" variant="body2">Sin predicciones aún.</Typography>
                  <Button size="small" onClick={() => navigate('/prediction')} sx={{ color: '#7c3aed', mt: 1 }}>
                    Hacer mi primera predicción
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Favorites + Portfolios */}
          <Grid item xs={12} md={5}>
            {/* Favorites */}
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Star sx={{ color: '#ff9800', fontSize: 18 }} />
                  <Typography fontWeight={700} color="text.primary">Tickers favoritos</Typography>
                </Box>
                <Button size="small" onClick={() => navigate('/prediction')} sx={{ color: '#7c3aed' }}>Analizar</Button>
              </Box>
              {favorites.length ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {favorites.map(t => (
                    <Chip key={t} label={t} onClick={() => navigate(`/prediction?ticker=${t}`)}
                      size="small" sx={{ bgcolor: '#7c3aed22', color: '#b89eff', cursor: 'pointer', fontWeight: 700 }} />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.disabled">
                  No tienes tickers favoritos aún. Añádelos desde el perfil.
                </Typography>
              )}
            </Paper>

            {/* Portfolios */}
            <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography fontWeight={700} color="text.primary">Mis carteras</Typography>
                <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/portfolio')}
                  sx={{ color: '#7c3aed' }}>Ver todas</Button>
              </Box>
              {pLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 1, bgcolor: 'action.hover' }} />
                ))
              ) : portfolios.length ? portfolios.slice(0, 4).map(p => (
                <Box key={p.id}
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    py: 1.5, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer',
                    '&:hover': { opacity: 0.8 } }}
                  onClick={() => navigate('/portfolio')}>
                  <Box>
                    <Typography variant="body2" fontWeight={600} color="text.primary">{p.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.positions_count || 0} posiciones
                    </Typography>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="body2" fontWeight={700} color="text.primary">
                      {formatCurrency(p.current_value || 0)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: getPnlColor((p.current_value || 0) - (p.total_invested || 0)) }}>
                      {((p.current_value || 0) - (p.total_invested || 0)) >= 0 ? '+' : ''}
                      {formatCurrency((p.current_value || 0) - (p.total_invested || 0))}
                    </Typography>
                  </Box>
                </Box>
              )) : (
                <Box py={3} textAlign="center">
                  <Typography color="text.disabled" variant="body2">Sin carteras aún.</Typography>
                  <Button size="small" onClick={() => navigate('/portfolio')} sx={{ color: '#7c3aed', mt: 1 }}>
                    Crear mi primera cartera
                  </Button>
                </Box>
              )}
            </Paper>

          </Grid>
        </Grid>

        {/* Quick actions row */}
        <Grid container spacing={2} mt={3}>
          {[
            { label: 'Nueva predicción', icon: <ShowChart />, color: '#7c3aed', path: '/prediction' },
            { label: 'Portfolio',        icon: <Notifications />, color: '#ff9800', path: '/portfolio' },
            { label: 'Backtest',         icon: <BarChart />,   color: '#2196f3', path: '/backtest' },
            { label: 'Marketplace',      icon: <TrendingUp />, color: '#4caf50', path: '/marketplace' },
          ].map(a => (
            <Grid item xs={6} sm={3} key={a.label}>
              <Paper
                onClick={() => navigate(a.path)}
                sx={{
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                  borderRadius: 2, p: 2, textAlign: 'center', cursor: 'pointer',
                  transition: 'border-color .2s, transform .2s',
                  '&:hover': { borderColor: a.color, transform: 'translateY(-2px)' },
                }}
              >
                <Box sx={{ color: a.color, mb: 0.5 }}>{a.icon}</Box>
                <Typography fontSize={12} fontWeight={700} color="text.primary">{a.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

      </Box>
    </Box>
  )
}

// rumarrcc: export principal del dashboard.

export default function DashboardPage() {
  const { user } = useSelector(s => s.auth)

  if (!user) return null

  return user.role === 'admin'
    ? <AdminDashboard user={user} />
    : <UserDashboard  user={user} />
}
