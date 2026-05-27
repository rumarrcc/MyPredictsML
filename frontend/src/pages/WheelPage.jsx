import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogContent,
  Divider, Grid, IconButton, InputBase, LinearProgress, Paper, Stack, Typography,
} from '@mui/material'
import {
  AutoGraphRounded, CasinoRounded, DiamondRounded,
  CreditCardRounded, DashboardRounded,
  HistoryRounded, HomeRounded, InsightsRounded, KeyboardCommandKeyRounded,
  KeyboardDoubleArrowLeftRounded, KeyboardDoubleArrowRightRounded, LockOpenRounded,
  MailOutlineRounded, MonetizationOnRounded, NewspaperRounded,
  NotificationsActiveRounded, NotificationsNoneRounded, PeopleRounded,
  PercentRounded, PersonRounded, PieChartRounded,
  RateReviewRounded, SearchRounded, SettingsRounded, ShowChartRounded,
  StorefrontRounded, TimelineRounded,
  RedeemRounded, StarRounded,
  WalletRounded, WorkspacePremiumRounded,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import { wheelService } from '@/services/wheelService'
import AccountMenu from '@/components/layout/AccountMenu'

// dechever - 16/04/2026: monté la ruleta diaria y la parte visual de recompensas.
const SEGMENTS = [
  { type: 'points', label: '50 MyCoins', short: '50', desc: 'MyCoins', color: '#f7c948', icon: <MonetizationOnRounded /> },
  { type: 'pro_trial', label: '1 mes PRO', short: '1 MES', desc: 'PRO', color: '#9f7aea', icon: <WorkspacePremiumRounded /> },
  { type: 'premium_signals_unlock', label: 'Estrategia PRO', short: 'Estrategia', desc: 'PRO', color: '#6d28d9', icon: <DiamondRounded /> },
  { type: 'extra_alerts', label: '100 MyCoins', short: '100', desc: 'MyCoins', color: '#f7c948', icon: <MonetizationOnRounded /> },
  { type: 'score_boost', label: '5% descuento', short: '5%', desc: 'Descuento', color: '#7e22ce', icon: <PercentRounded /> },
  { type: 'no_prize', label: 'Nada esta vez', short: 'Nada', desc: 'esta vez', color: '#7b8190', icon: <StarRounded /> },
  { type: 'discount_coupon', label: '10% descuento', short: '10%', desc: 'Descuento', color: '#6d28d9', icon: <PercentRounded /> },
  { type: 'badge', label: '25 MyCoins', short: '25', desc: 'MyCoins', color: '#f7c948', icon: <MonetizationOnRounded /> },
  { type: 'extra_alerts', label: 'Acceso exclusivo', short: 'Acceso', desc: 'Exclusivo', color: '#8b5cf6', icon: <LockOpenRounded /> },
]

const REWARD_LABELS = {
  points: 'MyCoins',
  extra_alerts: 'MyCoins extra',
  premium_signals_unlock: 'Estrategia PRO',
  pro_trial: '1 mes PRO',
  discount_coupon: 'Cupón descuento',
  badge: 'Insignia',
  score_boost: 'Descuento temporal',
  no_prize: 'Nada esta vez',
}

const NAV_SECTIONS = [
  [
    { to: '/', label: 'Inicio', icon: <HomeRounded /> },
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardRounded /> },
    { to: '/marketplace', label: 'Mercado', icon: <StorefrontRounded /> },
    { to: '/stocks', label: 'Acciones', icon: <ShowChartRounded /> },
    { to: '/prediction', label: 'Predicción', icon: <InsightsRounded /> },
    { to: '/backtest', label: 'Simulador', icon: <TimelineRounded /> },
  ],
  [
    { to: '/news', label: 'Noticias', icon: <NewspaperRounded /> },
    { to: '/reviews', label: 'Reviews', icon: <RateReviewRounded /> },
    { to: '/investments', label: 'Cartera virtual', icon: <PieChartRounded /> },
    { to: '/billing', label: 'Mi plan', icon: <CreditCardRounded /> },
    { to: '/strategies', label: 'Mis estrategias', icon: <AutoGraphRounded /> },
    { to: '/wheel', label: 'Ruleta diaria', icon: <CasinoRounded /> },
    { to: '/profile', label: 'Perfil', icon: <PersonRounded /> },
  ],
]

const ADMIN_LINKS = [
  { to: '/admin', label: 'Usuarios', icon: <PeopleRounded />, state: { tab: 0 } },
  { to: '/admin', label: 'Estadísticas', icon: <InsightsRounded />, state: { tab: 2 } },
  { to: '/admin', label: 'Datos', icon: <ShowChartRounded />, state: { tab: 3 } },
  { to: '/admin', label: 'Pagos', icon: <WalletRounded />, state: { tab: 3 } },
]

function segmentFor(type) {
  return SEGMENTS.find(s => s.type === type) || SEGMENTS[0]
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return 'Sin expiración'
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function useCountdown(nextAvailableAt, canSpin) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return useMemo(() => {
    if (canSpin) return 'Disponible ahora'
    const target = nextAvailableAt ? new Date(nextAvailableAt).getTime() : now
    const diff = Math.max(0, target - now)
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [nextAvailableAt, canSpin, now])
}

function GlassPanel({ children, sx }) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(139,92,246,.16)',
        background: 'linear-gradient(145deg, rgba(15,19,32,.92), rgba(7,9,18,.84))',
        boxShadow: '0 24px 80px rgba(0,0,0,.42), inset 0 1px rgba(255,255,255,.045)',
        ...sx,
      }}
    >
      {children}
    </Paper>
  )
}

function PrizeWheel({ rotation, spinning, onSpin, disabled, spinsRemaining }) {
  const segmentDeg = 360 / SEGMENTS.length
  const segmentBackgrounds = [
    '#0b1020', '#26104d', '#080c18', '#10162a', '#080b16',
    '#0d1222', '#080d1b', '#12182b', '#0a1020',
  ]

  return (
    <Box sx={{ position: 'relative', width: { xs: 320, sm: 460, md: 540 }, height: { xs: 320, sm: 460, md: 540 }, mx: 'auto', my: 'auto' }}>
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: { xs: -6, sm: -10 },
          zIndex: 6,
          transform: 'translateX(-50%)',
          width: 46,
          height: 38,
          borderRadius: '14px 14px 18px 18px',
          background: 'linear-gradient(180deg, #a855f7, #6d28d9)',
          boxShadow: '0 0 30px rgba(168,85,247,.8)',
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          inset: { xs: 8, sm: 12 },
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,.18), rgba(12,15,29,.04) 50%, transparent 70%)',
          filter: 'blur(6px)',
          boxShadow: '0 0 70px rgba(124,58,237,.55), 0 0 0 2px rgba(168,85,247,.50)',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          inset: { xs: 18, sm: 24 },
          borderRadius: '50%',
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 3.4s cubic-bezier(.11,.72,.14,1)' : 'none',
          background: `conic-gradient(${SEGMENTS.map((s, i) => `${segmentBackgrounds[i]} ${i * segmentDeg}deg ${(i + 1) * segmentDeg}deg`).join(',')})`,
          border: '3px solid rgba(168,85,247,.75)',
          boxShadow: 'inset 0 0 0 1px rgba(139,92,246,.30), inset 0 0 80px rgba(48,20,90,.26), 0 0 45px rgba(76,29,149,.48)',
          overflow: 'hidden',
        }}
      >
        {SEGMENTS.map((segment, i) => {
          const mid = (i * segmentDeg + segmentDeg / 2) - 90
          const angle = mid * Math.PI / 180
          const radius = { xs: 104, sm: 158, md: 188 }
          return (
            <Box key={`${segment.type}-${i}`}>
              <Box
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '50%',
                  height: 1,
                  transformOrigin: 'left center',
                  transform: `rotate(${i * segmentDeg}deg)`,
                  background: 'linear-gradient(90deg, rgba(139,92,246,.42), transparent)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  left: {
                    xs: `calc(50% + ${Math.cos(angle) * radius.xs}px)`,
                    sm: `calc(50% + ${Math.cos(angle) * radius.sm}px)`,
                    md: `calc(50% + ${Math.cos(angle) * radius.md}px)`,
                  },
                  top: {
                    xs: `calc(50% + ${Math.sin(angle) * radius.xs}px)`,
                    sm: `calc(50% + ${Math.sin(angle) * radius.sm}px)`,
                    md: `calc(50% + ${Math.sin(angle) * radius.md}px)`,
                  },
                  transform: `translate(-50%, -50%) rotate(${mid + 90}deg)`,
                  width: { xs: 64, sm: 86 },
                  textAlign: 'center',
                  color: '#f8fafc',
                  pointerEvents: 'none',
                }}
              >
                <Box sx={{ color: segment.color, display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 0 5px rgba(0,0,0,.65))', '& svg': { fontSize: { xs: 18, sm: 25 } } }}>
                  {segment.icon}
                </Box>
                <Typography sx={{ fontSize: { xs: 9, sm: 12 }, fontWeight: 950, lineHeight: 1.05, textTransform: 'uppercase', mt: .5, textShadow: '0 2px 8px rgba(0,0,0,.75)' }}>
                  {segment.short}
                </Typography>
                <Typography sx={{ fontSize: { xs: 8, sm: 10 }, color: 'rgba(255,255,255,.78)', lineHeight: 1.05, textShadow: '0 2px 8px rgba(0,0,0,.85)' }}>
                  {segment.desc}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          inset: { xs: '35%', sm: '36%' },
          zIndex: 5,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'radial-gradient(circle at 35% 25%, #5b21b6, #250a52 70%)',
          border: '4px solid rgba(168,85,247,.75)',
          boxShadow: '0 0 0 8px rgba(124,58,237,.18), 0 0 35px rgba(168,85,247,.60), inset 0 10px 24px rgba(255,255,255,.08)',
        }}
      >
        <Button
          onClick={onSpin}
          disabled={disabled}
          sx={{
            minWidth: 0,
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: .3,
            '&:disabled': { color: 'rgba(255,255,255,.42)' },
          }}
        >
          {spinning ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : (
            <>
              <Typography sx={{ fontSize: { xs: 18, sm: 24 }, fontWeight: 950, lineHeight: 1 }}>GIRAR</Typography>
              <Typography sx={{ fontSize: { xs: 9, sm: 11 }, color: 'rgba(255,255,255,.62)', textTransform: 'none' }}>
                {spinsRemaining || 0} giro disponible
              </Typography>
            </>
          )}
        </Button>
      </Box>
    </Box>
  )
}

function StatMini({ icon, value, label, color = '#a855f7', divider = false }) {
  return (
    <Box sx={{ flex: 1, textAlign: 'center', py: 1.2, borderLeft: divider ? '1px solid rgba(139,92,246,.16)' : 'none' }}>
      <Box sx={{ color, mb: .6, '& svg': { fontSize: 22 } }}>{icon}</Box>
      <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{value}</Typography>
      <Typography sx={{ color: 'rgba(245,245,247,.58)', fontSize: 11 }}>{label}</Typography>
    </Box>
  )
}

function HistoryItem({ spin }) {
  const seg = segmentFor(spin.reward_type)
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'center', gap: 1, py: .95, borderBottom: '1px solid rgba(255,255,255,.065)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ color: seg.color, display: 'grid', placeItems: 'center', '& svg': { fontSize: 17 } }}>{seg.icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 800 }} noWrap>{REWARD_LABELS[spin.reward_type] || spin.reward_type}</Typography>
        <Chip label="Premio" size="small" sx={{ mt: .35, height: 16, fontSize: 8, color: '#c4b5fd', bgcolor: 'rgba(124,58,237,.16)', border: '1px solid rgba(168,85,247,.20)' }} />
      </Box>
      <Typography sx={{ color: 'rgba(245,245,247,.48)', fontSize: 10 }}>{formatDate(spin.created_at)}</Typography>
    </Box>
  )
}

function PrizeCard({ segment, text }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(139,92,246,.16)', background: 'rgba(255,255,255,.035)', minHeight: 116 }}>
      <Box sx={{ color: segment.color, mb: 1, '& svg': { fontSize: 28 } }}>{segment.icon}</Box>
      <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1.15 }}>{segment.label}</Typography>
      <Typography sx={{ color: 'rgba(245,245,247,.50)', fontSize: 10, mt: .8 }}>{text}</Typography>
    </Box>
  )
}

function RewardChip({ reward }) {
  const seg = segmentFor(reward.reward_type)
  return (
    <Chip
      icon={seg.icon}
      label={`${REWARD_LABELS[reward.reward_type] || reward.reward_type}: ${reward.reward_value || ''}`}
      sx={{
        bgcolor: `${seg.color}18`,
        color: seg.color,
        border: `1px solid ${seg.color}40`,
        '& .MuiChip-icon': { color: seg.color },
      }}
    />
  )
}

function ShellLink({ item, active, collapsed }) {
  return (
    <Box
      component={Link}
      to={item.to}
      state={item.state}
      title={collapsed ? item.label : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 1.25,
        px: collapsed ? 0 : 1.55,
        py: 1.05,
        borderRadius: 1.6,
        color: active ? '#fff' : 'rgba(245,245,247,.66)',
        textDecoration: 'none',
        fontSize: 12,
        border: active ? '1px solid rgba(139,92,246,.42)' : '1px solid transparent',
        background: active ? 'linear-gradient(90deg, rgba(124,58,237,.30), rgba(124,58,237,.10))' : 'transparent',
        boxShadow: active ? '0 16px 38px rgba(124,58,237,.20)' : 'none',
        transition: 'all .18s ease',
        '& svg': { fontSize: 17 },
        '&:hover': { color: '#fff', background: 'rgba(255,255,255,.055)' },
      }}
    >
      {item.icon}
      {!collapsed && <Typography sx={{ fontSize: 12, fontWeight: 780 }}>{item.label}</Typography>}
    </Box>
  )
}

function WheelSidebar({ user, location, collapsed, onToggle }) {
  const plan = user?.subscription || 'PRO'
  const username = user?.username || 'David Trader'
  const initials = username.slice(0, 2).toUpperCase()
  const isActive = item => (
    location.pathname === item.to ||
    (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)) ||
    (item.to === '/admin' && location.pathname === '/admin')
  )

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: '0 auto 0 0',
        width: collapsed ? 78 : 238,
        zIndex: 20,
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,.10)',
        background: 'linear-gradient(180deg, rgba(7,9,18,.98), rgba(5,7,14,.98))',
        boxShadow: '20px 0 80px rgba(0,0,0,.28)',
        transition: 'width .22s ease',
      }}
    >
      <Box component={Link} to="/" sx={{ height: 64, px: collapsed ? 0 : 2, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 1.1, borderBottom: '1px solid rgba(255,255,255,.08)', textDecoration: 'none' }}>
        <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #6d28d9, #a855f7)', boxShadow: '0 0 24px rgba(124,58,237,.45)' }}>
          <AutoGraphRounded sx={{ fontSize: 16, color: '#fff' }} />
        </Box>
        {!collapsed && <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: 13 }}>MyPredicts</Typography>}
      </Box>

      <Box component={Link} to="/profile" title={collapsed ? username : undefined} sx={{ p: collapsed ? 1.1 : 2, borderBottom: '1px solid rgba(255,255,255,.08)', textDecoration: 'none' }}>
        <Stack direction="row" spacing={1.2} alignItems="center" justifyContent={collapsed ? 'center' : 'flex-start'}>
          <Avatar sx={{ width: 38, height: 38, bgcolor: '#1d122f', border: '1px solid rgba(168,85,247,.28)', fontWeight: 900 }}>{initials}</Avatar>
          {!collapsed && <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#fff', fontWeight: 850, fontSize: 12 }} noWrap>{username}</Typography>
            <Typography sx={{ color: '#8df6b0', fontWeight: 800, fontSize: 10 }}>{String(plan).toUpperCase()}</Typography>
          </Box>}
        </Stack>
      </Box>

      <Stack spacing={2.1} sx={{ p: collapsed ? .9 : 1.3, flex: 1, overflowY: 'auto', overflowX: 'hidden', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(139,92,246,.26)', borderRadius: 8 } }}>
        {NAV_SECTIONS.map((section, index) => (
          <Box key={index}>
            <Stack spacing={.35}>
              {section.map(item => (
                <ShellLink key={item.label} item={item} active={isActive(item)} collapsed={collapsed} />
              ))}
            </Stack>
            <Divider sx={{ display: index === NAV_SECTIONS.length - 1 ? 'none' : 'block', borderColor: 'rgba(255,255,255,.08)', mt: 1.5 }} />
          </Box>
        ))}

        {user?.role === 'admin' && (
          <Box>
            {!collapsed && <Typography sx={{ px: 1.4, mb: .7, color: 'rgba(245,245,247,.38)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em' }}>Admin</Typography>}
            <Stack spacing={.35}>
              {ADMIN_LINKS.map(item => (
                <ShellLink key={item.label} item={item} active={isActive(item)} collapsed={collapsed} />
              ))}
            </Stack>
          </Box>
        )}
      </Stack>

      {/* Bottom: toggle collapse */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,.08)', p: 1, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
        <IconButton onClick={onToggle} size="small"
          sx={{ color: 'rgba(245,245,247,.44)', '&:hover': { color: '#fff' } }}>
          {collapsed
            ? <KeyboardDoubleArrowRightRounded fontSize="small" />
            : <KeyboardDoubleArrowLeftRounded fontSize="small" />}
        </IconButton>
      </Box>
    </Box>
  )
}

// ─── Main WheelPage ───────────────────────────────────────────────────────────
export default function WheelPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useSelector(s => s.auth)
  const [collapsed, setCollapsed] = useState(false)
  const [state, setState] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [angle, setAngle] = useState(0)
  const [result, setResult] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(true)
  const SEG_COUNT = SEGMENTS.length
  const SEG_DEG   = 360 / SEG_COUNT

  const loadState = async () => {
    try {
      const data = await wheelService.getStatus()
      setState(data)
    } catch { /* silent */ }
  }

  const loadHistory = async () => {
    setHistLoading(true)
    try {
      const data = await wheelService.getHistory()
      setHistory(Array.isArray(data) ? data : (data?.spins || data?.history || data?.rewards || []))
    } catch { /* silent */ }
    finally { setHistLoading(false) }
  }

  useEffect(() => {
    loadState()
    loadHistory()
  }, [])

  const canSpin = state?.can_spin ?? state?.canSpin ?? false
  const nextAvailableAt = state?.next_available_at ?? state?.nextAvailableAt
  const balance = state?.points_balance ?? state?.balance ?? 0
  const countdown = useCountdown(nextAvailableAt, canSpin)

  const handleSpin = async () => {
    if (!canSpin || spinning) return
    setSpinning(true)
    try {
      const data = await wheelService.spin()
      const reward = data.reward || data
      const rewardType = reward.reward_type || reward.type || data.reward_type
      const resultPayload = { ...data, ...reward, reward_type: rewardType }
      const segIndex = SEGMENTS.findIndex(s => s.type === rewardType)
      const targetAngle = segIndex >= 0
        ? 360 * 5 + (360 - segIndex * SEG_DEG - SEG_DEG / 2)
        : 360 * 5
      setAngle(prev => prev + targetAngle)
      setTimeout(() => {
        setResult(resultPayload)
        setDialogOpen(true)
        setSpinning(false)
        loadState()
        loadHistory()
      }, 3600)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al girar la ruleta')
      setSpinning(false)
    }
  }

  const handleClose = () => {
    setDialogOpen(false)
    setResult(null)
  }

  const handleUseReward = (reward) => {
    const type = reward?.reward_type
    setDialogOpen(false)
    setResult(null)
    if (type === 'points') return navigate('/wallet')
    if (type === 'extra_alerts') return navigate('/wallet')
    if (type === 'premium_signals_unlock') return navigate('/marketplace')
    if (type === 'pro_trial' || type === 'discount_coupon') return navigate('/billing')
    if (type === 'badge' || type === 'score_boost') return navigate('/profile')
    return navigate('/wheel')
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#060913', color: '#fff', display: 'flex' }}>
      <WheelSidebar user={user} location={location} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      {/* Main content */}
      <Box sx={{ flex: 1, ml: { lg: collapsed ? '78px' : '238px' }, transition: 'margin .22s ease', minHeight: '100vh', px: { xs: 2, md: 4 }, py: 4, pt: { xs: 3, lg: 4 } }}>
        <Box sx={{ maxWidth: 1120, mx: 'auto' }}>

          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 5 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 32px rgba(168,85,247,.38)' }}>
              <CasinoRounded sx={{ fontSize: 26, color: '#fff' }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={900} sx={{
                background: 'linear-gradient(90deg, #fff 0%, #c4b5fd 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                Ruleta Diaria
              </Typography>
              <Typography color="rgba(245,245,247,.5)" fontSize={14}>
                Gira cada 24 horas y gana recompensas exclusivas
              </Typography>
            </Box>
            {balance > 0 && (
              <Chip
                icon={<MonetizationOnRounded sx={{ color: '#f7c948 !important', fontSize: 16 }} />}
                label={`${balance} MyCoins`}
                sx={{ ml: 'auto', bgcolor: 'rgba(247,201,72,.12)', color: '#f7c948', border: '1px solid rgba(247,201,72,.24)', fontWeight: 700 }}
              />
            )}
          </Box>

          <Grid container spacing={4}>
            {/* Wheel */}
            <Grid item xs={12} md={7}>
              <Paper sx={{
                bgcolor: 'rgba(15,15,28,.88)', border: '1px solid rgba(139,92,246,.22)',
                borderRadius: 4, p: { xs: 2, md: 4 }, textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,.38)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                {/* PrizeWheel */}
                <PrizeWheel
                  rotation={angle}
                  spinning={spinning}
                  onSpin={handleSpin}
                  disabled={!canSpin || spinning}
                  spinsRemaining={canSpin ? (state?.spins_remaining ?? 1) : 0}
                />

                {/* Countdown when not available */}
                {!canSpin && !spinning && (
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Typography sx={{ color: 'rgba(245,245,247,.42)', fontSize: 12 }}>Próximo giro en:</Typography>
                    <Typography sx={{ color: '#c4b5fd', fontWeight: 900, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                      {countdown}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Sidebar info */}
            <Grid item xs={12} md={5}>
              {/* Prizes */}
              <Paper sx={{ bgcolor: 'rgba(15,15,28,.88)', border: '1px solid rgba(139,92,246,.22)', borderRadius: 3, p: 3, mb: 3 }}>
                <Typography fontWeight={800} mb={2} fontSize={14}>Posibles premios</Typography>
                <Stack spacing={1}>
                  {SEGMENTS.map((seg, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: seg.color, flexShrink: 0 }} />
                      <Typography fontSize={13} color="rgba(245,245,247,.8)">{seg.label}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>

              {/* History */}
              <Paper sx={{ bgcolor: 'rgba(15,15,28,.88)', border: '1px solid rgba(139,92,246,.22)', borderRadius: 3, p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <HistoryRounded sx={{ color: '#a78bfa', fontSize: 18 }} />
                  <Typography fontWeight={800} fontSize={14}>Historial reciente</Typography>
                </Box>
                {histLoading ? (
                  <Stack spacing={1}>
                    {[1,2,3].map(i => (
                      <Box key={i} sx={{ height: 32, bgcolor: 'rgba(255,255,255,.04)', borderRadius: 1 }} />
                    ))}
                  </Stack>
                ) : history.length === 0 ? (
                  <Typography color="rgba(245,245,247,.4)" fontSize={13}>Sin historial aún. ¡Gira la ruleta!</Typography>
                ) : (
                  <Stack spacing={1}>
                    {history.slice(0, 8).map((h, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <RewardChip reward={h} />
                        <Typography variant="caption" color="rgba(245,245,247,.38)">
                          {formatDate(h.created_at || h.spun_at)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* ── Sistema MyCoins ── */}
          <Paper sx={{ bgcolor: 'rgba(15,15,28,.88)', border: '1px solid rgba(247,201,72,.18)', borderRadius: 3, p: 3, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <MonetizationOnRounded sx={{ color: '#f7c948', fontSize: 24 }} />
              <Box>
                <Typography fontWeight={900} fontSize={16} color='#fff'>Sistema MyCoins</Typography>
                <Typography color='rgba(245,245,247,.48)' fontSize={12}>La economía de recompensas de MyPredicts</Typography>
              </Box>
              {balance > 0 && (
                <Chip
                  icon={<MonetizationOnRounded sx={{ color: '#f7c948 !important', fontSize: 15 }} />}
                  label={`${balance} MyCoins`}
                  sx={{ ml: 'auto', bgcolor: 'rgba(247,201,72,.12)', color: '#f7c948', border: '1px solid rgba(247,201,72,.25)', fontWeight: 700 }}
                />
              )}
            </Box>
            <Grid container spacing={2}>
              {[
                { icon: <CasinoRounded />, title: 'Cómo ganar', desc: 'Gana MyCoins girando la ruleta diaria, completando predicciones, publicando análisis en la comunidad y manteniendo tu racha diaria.', color: '#a855f7' },
                { icon: <RedeemRounded />, title: 'Para qué sirven', desc: 'Canjea MyCoins por alertas extra, estrategias premium, descuentos en suscripciones y acceso PRO temporal.', color: '#f7c948' },
                { icon: <StarRounded />, title: 'Plan de puntos', desc: '1 predicción = 5 pts · 1 análisis compartido = 10 pts · Racha 7 días = 50 pts bonus · 1 giro ruleta = 10-100 pts.', color: '#4caf50' },
                { icon: <WorkspacePremiumRounded />, title: 'PRO tiene mas', desc: 'Los usuarios PRO tienen 2 giros de ruleta diarios y acceden a recompensas mas valiosas.', color: '#c4b5fd' },
              ].map((item, i) => (
                <Grid item xs={12} sm={6} key={i}>
                  <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
                    <Box sx={{ color: item.color, '& svg': { fontSize: 22 }, flexShrink: 0, mt: 0.3 }}>{item.icon}</Box>
                    <Box>
                      <Typography fontSize={13} fontWeight={800} color='#fff' mb={0.5}>{item.title}</Typography>
                      <Typography fontSize={12} color='rgba(245,245,247,.55)'>{item.desc}</Typography>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>

        </Box>
      </Box>

      {/* Result Dialog */}
      {result && (
        <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth
          PaperProps={{ sx: { bgcolor: '#0d0d1f', border: '1px solid rgba(139,92,246,.3)', borderRadius: 3, color: '#fff' } }}>
          <DialogContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
            <Box sx={{ fontSize: 56, mb: 1 }}>
              {segmentFor(result.reward_type)?.icon}
            </Box>
            <Typography variant="h5" fontWeight={900} mb={1}>
              {result.reward_type === 'no_prize' ? '¡Mala suerte!' : '¡Felicidades!'}
            </Typography>
            <RewardChip reward={result} />
            <Typography color="rgba(245,245,247,.6)" fontSize={13} mt={2} mb={3}>
              {result.reward_type !== 'no_prize'
                ? 'Tu recompensa ha sido aplicada a tu cuenta.'
                : 'Vuelve mañana para intentarlo de nuevo.'}
            </Typography>
            <Button variant="contained" onClick={() => handleUseReward(result)} fullWidth
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', fontWeight: 800, borderRadius: 2 }}>
              {result.reward_type === 'no_prize' ? 'Continuar' : 'Usar recompensa'}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  )
}
