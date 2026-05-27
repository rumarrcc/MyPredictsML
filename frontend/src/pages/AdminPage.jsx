import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import api from '@/services/api'
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, Tooltip,
  TextField, InputAdornment, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Grid, Card, CardContent, Divider, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, Tabs, Tab, Switch,
  LinearProgress, Badge,
} from '@mui/material'
import {
  Search, Block, CheckCircle, AdminPanelSettings,
  People, TrendingUp, Refresh,
  ArrowUpward, ArrowDownward, Delete, BarChart,
  Storage, FiberManualRecord, Warning, Circle, Wallet,
} from '@mui/icons-material'
import { billingService } from '@/services/billingService'
import {
  AreaChart, Area, BarChart as ReBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts'
import { toast } from 'react-toastify'

// ─── Paleta de colores ──────────────────────────────────────────────────────
// dechever - 23/04/2026: organicé el panel de administración para revisar usuarios, actividad y datos generales.
const COLORS = ['#7c3aed','#2196f3','#4caf50','#ff9800','#e91e63','#00bcd4','#ff5722','#9c27b0']

// ─── Componentes pequeños ───────────────────────────────────────────────────

function StatCard({ icon, label, value, color = '#2196f3', sub }) {
  return (
    <Card sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', py: '12px !important' }}>
        <Box sx={{ bgcolor: `${color}22`, borderRadius: 2, p: 1.2, display: 'flex' }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800} color={color}>{value ?? '—'}</Typography>
          <Typography variant="body2" color="text.secondary" fontSize={12}>{label}</Typography>
          {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
        </Box>
      </CardContent>
    </Card>
  )
}

function RoleChip({ role }) {
  return (
    <Chip label={role === 'admin' ? 'Admin' : 'Usuario'} size="small"
      sx={{
        bgcolor: role === 'admin' ? '#7c3aed22' : '#2196f322',
        color:   role === 'admin' ? '#a78bfa'   : '#64b5f6',
        fontWeight: 700, fontSize: 11,
        border: `1px solid ${role === 'admin' ? '#7c3aed55' : '#2196f355'}`,
      }} />
  )
}

function StatusDot({ status }) {
  const map = { fresh: '#4caf50', recent: '#ff9800', stale: '#f44336' }
  return <FiberManualRecord sx={{ color: map[status] || '#888', fontSize: 12, mr: 0.5 }} />
}

function ConfirmDialog({ open, title, message, onConfirm, onClose, confirmColor = 'error' }) {
  return (
    <Dialog open={open} onClose={onClose}
      PaperProps={{ sx: { bgcolor: 'background.paper', color: 'text.primary' } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography color="text.secondary">{message}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancelar</Button>
        <Button onClick={onConfirm} variant="contained" color={confirmColor}>Confirmar</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Tab panel helper ───────────────────────────────────────────────────────
function TabPanel({ value, index, children }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 0 — USUARIOS
// ═══════════════════════════════════════════════════════════════════════════
function UsersTab({ stats, onRefreshStats }) {
  const [users,      setUsers]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(0)
  const [rowsPerPage,setRowsPerPage]= useState(20)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading,    setLoading]    = useState(true)
  const [confirm,    setConfirm]    = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page: page + 1, per_page: rowsPerPage,
        ...(search     && { search }),
        ...(roleFilter && { role: roleFilter }),
      }
      const { data } = await api.get('/api/admin/users', { params })
      setUsers(data.users); setTotal(data.total)
    } catch { toast.error('Error cargando usuarios') }
    finally { setLoading(false) }
  }, [page, rowsPerPage, search, roleFilter])

  useEffect(() => { loadUsers() }, [loadUsers])

  const execAction = async () => {
    if (!confirm) return
    const { action, target } = confirm; setConfirm(null)
    try {
      const endpoints = {
        block:   `/api/admin/users/${target.id}/block`,
        unblock: `/api/admin/users/${target.id}/unblock`,
        promote: `/api/admin/users/${target.id}/promote`,
        demote:  `/api/admin/users/${target.id}/demote`,
      }
      await api.post(endpoints[action])
      toast.success(`Acción ejecutada para @${target.username}`)
      loadUsers(); onRefreshStats()
    } catch (err) { toast.error(err?.response?.data?.message || 'Error') }
  }

  return (
    <>
      {/* Filtros */}
      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Buscar usuario, email…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            size="small" sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.disabled', fontSize: 18 }} /></InputAdornment> }} />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Rol</InputLabel>
            <Select value={roleFilter} label="Rol" onChange={e => { setRoleFilter(e.target.value); setPage(0) }}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="user">Usuario</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={loadUsers}><Refresh /></IconButton>
        </Box>
      </Paper>

      {/* Tabla */}
      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress sx={{ color: '#7c3aed' }} />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { borderColor: 'divider', fontWeight: 700, fontSize: 12 } }}>
                  <TableCell>ID</TableCell><TableCell>Usuario</TableCell><TableCell>Email</TableCell>
                  <TableCell>Rol</TableCell><TableCell>Estado</TableCell>
                  <TableCell>Último acceso</TableCell><TableCell>Registro</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} sx={{ opacity: u.is_blocked ? 0.6 : 1, '& td': { borderColor: 'divider' }, '&:hover': { bgcolor: 'action.hover' } }}>
                    <TableCell sx={{ color: 'text.disabled', fontSize: 11 }}>#{u.id}</TableCell>
                    <TableCell>
                      <Typography fontWeight={700} fontSize={13}>@{u.username}</Typography>
                      {u.full_name && <Typography fontSize={11} color="text.secondary">{u.full_name}</Typography>}
                    </TableCell>
                    <TableCell fontSize={13}>{u.email}</TableCell>
                    <TableCell><RoleChip role={u.role} /></TableCell>
                    <TableCell>
                      <Chip size="small" label={u.is_blocked ? 'Bloqueado' : 'Activo'}
                        sx={{ bgcolor: u.is_blocked ? '#f4433622' : '#4caf5022',
                          color: u.is_blocked ? '#f44336' : '#4caf50', fontWeight: 700, fontSize: 11 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('es-ES') : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                      {u.joined_at ? new Date(u.joined_at).toLocaleDateString('es-ES') : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {u.is_blocked
                          ? <Tooltip title="Desbloquear"><IconButton size="small" sx={{ color: '#4caf50' }} onClick={() => setConfirm({ action: 'unblock', target: u })}><CheckCircle fontSize="small" /></IconButton></Tooltip>
                          : <Tooltip title="Bloquear"><IconButton size="small" sx={{ color: '#f44336' }} onClick={() => setConfirm({ action: 'block', target: u })}><Block fontSize="small" /></IconButton></Tooltip>
                        }
                        {u.role === 'user'
                          ? <Tooltip title="Promover a admin"><IconButton size="small" sx={{ color: '#7c3aed' }} onClick={() => setConfirm({ action: 'promote', target: u })}><ArrowUpward fontSize="small" /></IconButton></Tooltip>
                          : <Tooltip title="Degradar a usuario"><IconButton size="small" sx={{ color: '#ff9800' }} onClick={() => setConfirm({ action: 'demote', target: u })}><ArrowDownward fontSize="small" /></IconButton></Tooltip>
                        }
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>Sin resultados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination component="div" count={total} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0) }}
          rowsPerPageOptions={[10, 20, 50]} sx={{ borderTop: '1px solid', borderColor: 'divider', color: 'text.secondary' }} />
      </Paper>

      {confirm && (
        <ConfirmDialog open title={{
          block: `Bloquear @${confirm.target.username}`,
          unblock: `Desbloquear @${confirm.target.username}`,
          promote: `Promover @${confirm.target.username} a admin`,
          demote: `Degradar @${confirm.target.username}`,
        }[confirm.action]}
        message={{
          block: 'El usuario no podrá iniciar sesión.',
          unblock: 'El usuario recuperará acceso completo.',
          promote: 'Tendrá acceso al panel de administración.',
          demote: 'Perderá acceso al panel de administración.',
        }[confirm.action]}
        onConfirm={execAction} onClose={() => setConfirm(null)}
        confirmColor={['block','demote'].includes(confirm.action) ? 'error' : 'primary'} />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════
function StatsTab() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [days,       setDays]       = useState(30)
  const [selectedUser, setSelectedUser] = useState(null)  // { id, username }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { days, ...(selectedUser && { user_id: selectedUser.id }) }
      const { data: d } = await api.get('/api/admin/analytics', { params })
      setData(d)
    } catch { toast.error('Error cargando estadísticas') }
    finally { setLoading(false) }
  }, [days, selectedUser])

  useEffect(() => { load() }, [load])

  const chartPaper = { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5 }

  return (
    <Box>
      {/* Controles */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Período</InputLabel>
          <Select value={days} label="Período" onChange={e => setDays(e.target.value)}>
            <MenuItem value={7}>7 días</MenuItem>
            <MenuItem value={30}>30 días</MenuItem>
            <MenuItem value={90}>90 días</MenuItem>
          </Select>
        </FormControl>

        {selectedUser && (
          <Chip label={`👤 @${selectedUser.username}`} onDelete={() => setSelectedUser(null)}
            sx={{ bgcolor: '#7c3aed22', color: '#a78bfa', fontWeight: 700 }} />
        )}
        <Button size="small" onClick={load} startIcon={<Refresh />} sx={{ color: 'text.secondary' }}>
          Actualizar
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress sx={{ color: '#7c3aed' }} /></Box>
      ) : data && (
        <Grid container spacing={3}>
          {/* Resumen individual si hay usuario seleccionado */}
          {data.user_summary && (
            <Grid item xs={12}>
              <Paper sx={{ ...chartPaper, background: 'linear-gradient(135deg, #7c3aed22, #2196f322)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="h6" fontWeight={800}>@{data.user_summary.username}</Typography>
                    <Typography color="text.secondary" fontSize={13}>{data.user_summary.email}</Typography>
                  </Box>
                  {[
                    { label: 'Predicciones', val: data.user_summary.total_predictions, color: '#7c3aed' },
                    { label: 'Backtests',    val: data.user_summary.total_backtests,   color: '#ff9800' },
                    { label: 'Último acceso', val: data.user_summary.last_login
                        ? new Date(data.user_summary.last_login).toLocaleDateString('es-ES') : '—', color: '#2196f3' },
                  ].map(item => (
                    <Box key={item.label} sx={{ textAlign: 'center', minWidth: 100 }}>
                      <Typography variant="h5" fontWeight={800} color={item.color}>{item.val}</Typography>
                      <Typography fontSize={12} color="text.secondary">{item.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Predicciones por día */}
          <Grid item xs={12} md={8}>
            <Paper sx={chartPaper}>
              <Typography fontWeight={700} mb={2}>
                {selectedUser ? `Predicciones de @${selectedUser.username}` : 'Predicciones globales por día'}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.predictions_by_day}>
                  <defs>
                    <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#888' }} width={30} />
                  <ReTooltip contentStyle={{ background: '#1e1e3a', border: '1px solid #2d2d4e', borderRadius: 8 }}
                    labelStyle={{ color: '#aaa', fontSize: 11 }} itemStyle={{ color: '#a78bfa' }} />
                  <Area type="monotone" dataKey="count" name="Predicciones" stroke="#7c3aed" fill="url(#predGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Top tickers */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ ...chartPaper, height: '100%' }}>
              <Typography fontWeight={700} mb={2}>Top tickers analizados</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <ReBarChart data={data.top_tickers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} />
                  <YAxis dataKey="ticker" type="category" tick={{ fontSize: 11, fill: '#ccc' }} width={50} />
                  <ReTooltip contentStyle={{ background: '#1e1e3a', border: '1px solid #2d2d4e', borderRadius: 8 }}
                    labelStyle={{ color: '#aaa', fontSize: 11 }} />
                  <Bar dataKey="count" name="Predicciones" radius={[0, 4, 4, 0]}>
                    {data.top_tickers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Registros por día (solo vista global) */}
          {!selectedUser && data.registrations.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper sx={chartPaper}>
                <Typography fontWeight={700} mb={2}>Nuevos registros por día</Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.registrations}>
                    <defs>
                      <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2196f3" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2196f3" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} width={30} />
                    <ReTooltip contentStyle={{ background: '#1e1e3a', border: '1px solid #2d2d4e', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="count" name="Registros" stroke="#2196f3" fill="url(#regGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* Top usuarios (solo vista global) */}
          {!selectedUser && data.top_users.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper sx={chartPaper}>
                <Typography fontWeight={700} mb={2}>Usuarios más activos</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.top_users.slice(0, 8).map((u, i) => (
                    <Box key={u.user_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ color: COLORS[i % COLORS.length], fontWeight: 800, minWidth: 20, fontSize: 13 }}>
                        {i + 1}.
                      </Typography>
                      <Button size="small" onClick={() => setSelectedUser({ id: u.user_id, username: u.username })}
                        sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13, p: 0, textTransform: 'none',
                          '&:hover': { color: '#7c3aed', bgcolor: 'transparent' } }}>
                        @{u.username}
                      </Button>
                      <Box sx={{ flex: 1, bgcolor: 'action.hover', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                        <Box sx={{
                          width: `${data.top_users[0]?.predictions ? (u.predictions / data.top_users[0].predictions) * 100 : 0}%`,
                          height: '100%', bgcolor: COLORS[i % COLORS.length], borderRadius: 10,
                        }} />
                      </Box>
                      <Typography fontSize={12} color="text.secondary" minWidth={30}>{u.predictions}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — MONITOR DE DATOS
// ═══════════════════════════════════════════════════════════════════════════
function DataMonitorTab() {
  const [status,   setStatus]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastPoll, setLastPoll] = useState(null)
  const intervalRef = useRef(null)

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/data-status')
      setStatus(data)
      setLastPoll(new Date())
    } catch {/* silent */}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    poll()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [poll])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(poll, 5000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, poll])

  const STATUS_CONFIG = {
    fresh:  { label: 'Fresco',   color: '#4caf50', bg: '#4caf5022' },
    recent: { label: 'Reciente', color: '#ff9800', bg: '#ff980022' },
    stale:  { label: 'Antiguo',  color: '#f44336', bg: '#f4433622' },
  }

  return (
    <Box>
      {/* Header con auto-refresh */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography fontSize={14} color="text.secondary">Auto-actualizar (5s)</Typography>
          <Switch checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} color="primary" size="small" />
          {autoRefresh && <CircularProgress size={14} sx={{ color: '#4caf50' }} />}
        </Box>
        <Button size="small" onClick={poll} startIcon={<Refresh />} sx={{ color: 'text.secondary' }}>Actualizar ahora</Button>
        {lastPoll && <Typography fontSize={12} color="text.disabled">Última comprobación: {lastPoll.toLocaleTimeString('es-ES')}</Typography>}
      </Box>

      {/* Resumen en chips */}
      {status?.summary && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <Paper key={key} sx={{ bgcolor: cfg.bg, border: `1px solid ${cfg.color}44`, borderRadius: 2, px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <FiberManualRecord sx={{ color: cfg.color, fontSize: 14 }} />
              <Typography fontWeight={700} color={cfg.color} fontSize={20}>{status.summary[key]}</Typography>
              <Typography fontSize={13} color="text.secondary">{cfg.label}{status.summary[key] !== 1 ? 's' : ''}</Typography>
            </Paper>
          ))}
          <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Storage sx={{ color: '#2196f3', fontSize: 18 }} />
            <Typography fontWeight={700} fontSize={20}>{status.summary.total}</Typography>
            <Typography fontSize={13} color="text.secondary">tickers en BD</Typography>
          </Paper>
        </Box>
      )}

      {/* Tabla de tickers */}
      <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress sx={{ color: '#7c3aed' }} /></Box>
        ) : status?.tickers?.length > 0 ? (
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'background.paper' } }}>
                  <TableCell>Ticker</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Último dato</TableCell>
                  <TableCell>Última actualización</TableCell>
                  <TableCell>Antigüedad</TableCell>
                  <TableCell>Registros en BD</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {status.tickers.map(t => {
                  const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.stale
                  return (
                    <TableRow key={t.ticker} sx={{ '& td': { borderColor: 'divider' }, '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell>
                        <Typography fontWeight={800} fontSize={14} sx={{ letterSpacing: 0.5 }}>{t.ticker}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <FiberManualRecord sx={{ color: cfg.color, fontSize: 12 }} />
                          <Chip label={cfg.label} size="small"
                            sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 11, height: 20 }} />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{t.last_date || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {t.last_updated
                          ? new Date(t.last_updated).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Typography color={cfg.color} fontWeight={600} fontSize={12}>
                          {t.age_hours < 1
                            ? `${Math.round(t.age_hours * 60)}m`
                            : t.age_hours < 24
                            ? `${t.age_hours.toFixed(1)}h`
                            : `${(t.age_hours / 24).toFixed(1)}d`}
                        </Typography>
                        {/* Barra de antigüedad */}
                        <LinearProgress variant="determinate"
                          value={Math.min((t.age_hours / 48) * 100, 100)}
                          sx={{
                            height: 3, borderRadius: 2, mt: 0.5, bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': { bgcolor: cfg.color },
                          }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {t.total_rows.toLocaleString('es-ES')}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Storage sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.disabled">No hay datos en la base de datos todavía</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL ADMIN
// ═══════════════════════════════════════════════════════════════════════════
function BillingAdminTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userBilling, setUserBilling] = useState(null)
  const [plan, setPlan] = useState('free')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const money = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await billingService.adminStats())
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error cargando billing admin')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const loadUserBilling = async () => {
    const id = Number(userId)
    if (!id) {
      toast.warn('Introduce un ID de usuario válido')
      return
    }
    try {
      const data = await billingService.adminUserSub(id)
      setUserBilling(data)
      setPlan(data?.effective_plan || data?.subscription?.plan || 'free')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo cargar la suscripción del usuario')
    }
  }

  const savePlan = async () => {
    const id = Number(userId)
    if (!id) return
    setSaving(true)
    try {
      const data = await billingService.adminSetPlan(id, plan, notes)
      setUserBilling(data)
      toast.success('Plan actualizado manualmente')
      await loadStats()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo actualizar el plan')
    } finally {
      setSaving(false)
    }
  }

  const paymentsByPlan = stats?.payments_by_plan || []
  const subscriptionsByPlan = stats?.subscriptions_by_plan || []
  const usersByPlan = stats?.users_by_plan || []
  const paymentsTotal = Number(
    stats?.payment_count ?? stats?.succeeded_payments ??
    paymentsByPlan.reduce((sum, row) => sum + Number(row.count || 0), 0)
  )
  const totalRevenue = stats?.total_revenue_eur ?? stats?.total_revenue_usd ?? stats?.total_revenue ?? 0
  const activeSubscriptions = subscriptionsByPlan
    .filter(row => ['active', 'trialing'].includes(String(row.status || '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.count || 0), 0)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Wallet sx={{ color: '#7c3aed' }} />
        <Box>
          <Typography variant="h6" fontWeight={800}>Pagos y suscripciones</Typography>
          <Typography color="text.secondary" fontSize={13}>Revisión de ingresos, planes y asignaciones manuales del backend de billing.</Typography>
        </Box>
        <Button onClick={loadStats} disabled={loading} startIcon={<Refresh />} sx={{ ml: 'auto' }}>Refrescar</Button>
      </Box>

      {loading ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Ingresos totales', value: money(totalRevenue), color: '#39d98a' },
            { label: 'Pagos totales', value: paymentsTotal, color: '#60a5fa' },
            { label: 'Suscripciones activas', value: stats?.active_subscriptions ?? activeSubscriptions, color: '#a855f7' },
            { label: 'Pagos fallidos', value: stats?.failed_payments ?? 0, color: '#ff5c7a' },
            { label: 'Reembolsos', value: stats?.refunded_payments ?? 0, color: '#f7c948' },
          ].map(({ label, value, color }) => (
            <Grid item xs={6} sm={3} key={label}>
              <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={800} sx={{ color }}>{value}</Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && paymentsByPlan.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography fontWeight={700} mb={1}>Pagos por origen</Typography>
          <Grid container spacing={2}>
            {paymentsByPlan.map(row => (
              <Grid item xs={6} sm={3} key={row.plan || row._sa_instance_state}>
                <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                  <Chip label={String(row.plan || 'desconocido').toUpperCase()} size="small"
                    sx={{ bgcolor: '#7c3aed22', color: '#b89eff', mb: 1, fontWeight: 700 }} />
                  <Typography variant="h6" fontWeight={800}>{row.count}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.total ? money(row.total) : ''}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Suscripciones activas por plan */}
      {!loading && subscriptionsByPlan.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography fontWeight={700} mb={1}>Suscripciones por estado/plan</Typography>
          <Grid container spacing={2}>
            {subscriptionsByPlan.map(row => (
              <Grid item xs={6} sm={3} key={`${row.plan}-${row.status}`}>
                <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                  <Chip label={String(row.plan || 'free').toUpperCase()} size="small"
                    sx={{ bgcolor: '#2196f322', color: '#64b5f6', mb: 0.5, fontWeight: 700 }} />
                  <Chip label={row.status || '—'} size="small"
                    sx={{ bgcolor: row.status === 'active' ? '#4caf5022' : '#ff980022',
                      color: row.status === 'active' ? '#4caf50' : '#ff9800', ml: 0.5, fontWeight: 700 }} />
                  <Typography variant="h6" fontWeight={800} mt={0.5}>{row.count}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Lookup de suscripción de usuario */}
      <Typography fontWeight={700} mb={1.5}>Consultar y modificar plan de usuario</Typography>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          label="ID de usuario"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          size="small"
          sx={{ width: 180,
            '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'divider' } } }}
        />
        <Button variant="outlined" onClick={loadUserBilling}
          sx={{ borderColor: 'divider', color: '#aaa' }}>
          Cargar
        </Button>
      </Box>

      {userBilling && (
        <Paper sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', mb: 2 }}>
          <Typography fontWeight={700} mb={1}>
            Usuario #{userId} — Plan actual: <span style={{ color: '#b89eff' }}>{userBilling.effective_plan || 'free'}</span>
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel sx={{ color: '#888' }}>Nuevo plan</InputLabel>
              <Select
                value={plan}
                onChange={e => setPlan(e.target.value)}
                label="Nuevo plan"
                sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
              >
                {['free', 'pro'].map(p => (
                  <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notas (opcional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              size="small"
              sx={{ flex: 1, minWidth: 220,
                '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'divider' } } }}
            />
            <Button variant="contained" onClick={savePlan} disabled={saving}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700 }}>
              {saving ? <CircularProgress size={18} color="inherit" /> : 'Guardar'}
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// rumarrcc: vista principal del panel admin.
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState(location.state?.tab ?? 0)

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/stats')
      setStats(data.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => {
    if (location.state?.tab != null) setTab(Math.max(0, Math.min(Number(location.state.tab), 3)))
  }, [location.state])

  if (user?.role !== 'admin') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Box textAlign="center">
          <AdminPanelSettings sx={{ fontSize: 64, color: '#7c3aed', mb: 2, opacity: 0.4 }} />
          <Typography variant="h5" color="text.primary" mb={1}>Acceso restringido</Typography>
          <Typography color="text.secondary">Solo los administradores pueden acceder a esta página.</Typography>
        </Box>
      </Box>
    )
  }

  const TABS = [
    { label: 'Usuarios',   icon: <People fontSize="small" /> },
    { label: 'Estadísticas', icon: <BarChart fontSize="small" /> },
    { label: 'Monitor',    icon: <Storage fontSize="small" /> },
    { label: 'Billing',    icon: <Wallet fontSize="small" /> },
  ]

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 6, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1400, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, flexWrap: 'wrap' }}>
          <Box sx={{ bgcolor: '#7c3aed22', p: 1.5, borderRadius: 2, display: 'flex' }}>
            <AdminPanelSettings sx={{ color: '#7c3aed', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={900} color="text.primary">Panel de Administración</Typography>
            <Typography color="text.secondary" fontSize={14}>Gestión completa de la plataforma</Typography>
          </Box>
          <Button onClick={loadStats} startIcon={<Refresh />} sx={{ ml: 'auto', borderColor: 'divider', color: '#aaa' }} variant="outlined">
            Refrescar
          </Button>
        </Box>

        {/* Tabs */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': { color: 'text.secondary', textTransform: 'none', fontWeight: 700, fontSize: 13 },
              '& .Mui-selected': { color: '#b89eff' },
              '& .MuiTabs-indicator': { bgcolor: '#7c3aed' },
            }}
          >
            {TABS.map(t => (
              <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" />
            ))}
          </Tabs>
        </Paper>

        {/* Tab Panels */}
        <TabPanel value={tab} index={0}><UsersTab stats={stats} onRefreshStats={loadStats} /></TabPanel>
        <TabPanel value={tab} index={1}><StatsTab /></TabPanel>
        <TabPanel value={tab} index={2}><DataMonitorTab /></TabPanel>
        <TabPanel value={tab} index={3}><BillingAdminTab /></TabPanel>

      </Box>
    </Box>
  )
}
