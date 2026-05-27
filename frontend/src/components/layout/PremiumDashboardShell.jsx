import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useState } from 'react'
import {
  Avatar, Box, Button, Divider, Paper,
  Drawer, IconButton, Stack, Typography,
} from '@mui/material'
import {
  AutoGraphRounded, CasinoRounded, CreditCardRounded,
  DashboardRounded, HomeRounded, InsightsRounded,
  KeyboardDoubleArrowLeftRounded,
  KeyboardDoubleArrowRightRounded, MenuRounded, CloseRounded, NewspaperRounded,
  PeopleRounded, PersonAddRounded, PersonRounded, PieChartRounded,
  RateReviewRounded,
  SettingsRounded, ShowChartRounded, StorefrontRounded,
  TimelineRounded, WalletRounded, LoginRounded,
} from '@mui/icons-material'
import AccountMenu from '@/components/layout/AccountMenu'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'
import CoinBalanceBadge from '@/components/coins/CoinBalanceBadge'

const navSections = [
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
    { to: '/coins/buy', label: 'Comprar monedas', icon: <WalletRounded /> },
    { to: '/billing', label: 'Mi plan', icon: <CreditCardRounded /> },
    { to: '/strategies', label: 'Mis estrategias', icon: <AutoGraphRounded /> },
    { to: '/wheel', label: 'Ruleta diaria', icon: <CasinoRounded /> },
    { to: '/profile', label: 'Perfil', icon: <PersonRounded /> },
  ],
]

const adminLinks = [
  { to: '/admin', label: 'Usuarios', icon: <PeopleRounded />, state: { tab: 0 } },
  { to: '/admin', label: 'Estadísticas', icon: <InsightsRounded />, state: { tab: 1 } },
  { to: '/admin', label: 'Datos', icon: <ShowChartRounded />, state: { tab: 2 } },
  { to: '/admin', label: 'Pagos', icon: <WalletRounded />, state: { tab: 3 } },
]

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
        gap: collapsed ? 0 : 1.35,
        px: collapsed ? 0 : 1.65,
        py: 1.12,
        borderRadius: 1.7,
        color: active ? '#fff' : 'rgba(245,245,247,.68)',
        textDecoration: 'none',
        border: active ? '1px solid rgba(139,92,246,.46)' : '1px solid transparent',
        background: active ? 'linear-gradient(90deg, rgba(124,58,237,.38), rgba(124,58,237,.12))' : 'transparent',
        boxShadow: active ? '0 18px 44px rgba(124,58,237,.22)' : 'none',
        transition: 'all .18s ease',
        '& svg': { fontSize: 18 },
        '&:hover': { color: '#fff', background: 'rgba(255,255,255,.055)' },
      }}
    >
      {item.icon}
      {!collapsed && <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{item.label}</Typography>}
    </Box>
  )
}

function Sidebar({ user, location, collapsed, onToggle, navigate }) {
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
        zIndex: 30,
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,.10)',
        background: 'linear-gradient(180deg, rgba(7,9,18,.985), rgba(4,6,12,.985))',
        transition: 'width .22s ease',
      }}
    >
      <Box component={Link} to="/" sx={{ height: 66, px: collapsed ? 0 : 2, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 1.1, textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #6d28d9, #a855f7)', boxShadow: '0 0 26px rgba(124,58,237,.48)' }}>
          <AutoGraphRounded sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
        {!collapsed && <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: 18, letterSpacing: '-.03em' }}>MyPredicts</Typography>}
      </Box>

      {user ? (
        <Box component={Link} to="/profile" title={collapsed ? user.username : undefined} sx={{ m: collapsed ? 1.1 : 1.6, p: collapsed ? .6 : 1.1, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 1.25, border: '1px solid rgba(255,255,255,.10)', borderRadius: 2, textDecoration: 'none', background: 'rgba(255,255,255,.025)' }}>
          <Avatar src={user.avatar_url || undefined} sx={{ width: 42, height: 42, bgcolor: '#1d122f', border: '1px solid rgba(168,85,247,.28)', fontWeight: 900 }}>
            {user.username?.slice(0, 2).toUpperCase() || 'U'}
          </Avatar>
          {!collapsed && <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#fff', fontWeight: 850, fontSize: 13 }} noWrap>{user.username}</Typography>
            <Typography sx={{ color: '#a855f7', fontWeight: 800, fontSize: 11 }}>
              {user.subscription ? `Plan ${String(user.subscription).toUpperCase()}` : 'Plan gratuito'}
            </Typography>
          </Box>}
        </Box>
      ) : (
        <Box sx={{ m: collapsed ? 1.1 : 1.6, p: collapsed ? .6 : 1.1, border: '1px solid rgba(255,255,255,.10)', borderRadius: 2, background: 'rgba(255,255,255,.025)' }}>
          {collapsed ? (
            <Box onClick={() => navigate('/login')} sx={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
              <Avatar sx={{ width: 42, height: 42, bgcolor: 'rgba(124,58,237,.2)', border: '1px solid rgba(168,85,247,.28)' }}>
                <LoginRounded sx={{ fontSize: 20, color: '#a855f7' }} />
              </Avatar>
            </Box>
          ) : (
            <Stack spacing={.8}>
              <Button onClick={() => navigate('/login')} variant="outlined" fullWidth startIcon={<LoginRounded />} size="small"
                sx={{ py: .75, color: '#fff', borderColor: 'rgba(255,255,255,.18)', fontSize: 12, fontWeight: 800 }}>
                Iniciar sesión
              </Button>
              <Button onClick={() => navigate('/register')} variant="contained" fullWidth startIcon={<PersonAddRounded />} size="small"
                sx={{ py: .75, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', fontSize: 12, fontWeight: 800 }}>
                Registrarse
              </Button>
            </Stack>
          )}
        </Box>
      )}

      <Stack spacing={2.1} sx={{ px: collapsed ? .9 : 1.3, flex: 1, overflowY: 'auto', overflowX: 'hidden', pb: 1, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(139,92,246,.26)', borderRadius: 8 } }}>
        {navSections.map((section, index) => (
          <Box key={index}>
            <Stack spacing={.42}>
              {section.map(item => (
                <ShellLink key={item.label} item={item} active={isActive(item)} collapsed={collapsed} />
              ))}
            </Stack>
            <Divider sx={{ display: index === navSections.length - 1 ? 'none' : 'block', borderColor: 'rgba(255,255,255,.08)', mt: 1.5 }} />
          </Box>
        ))}

        {['admin', 'global_admin'].includes(user?.role) && (
          <Box>
            {!collapsed && <Typography sx={{ px: 1.4, mb: .8, color: 'rgba(245,245,247,.38)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Admin</Typography>}
            <Stack spacing={.42}>{adminLinks.map(item => <ShellLink key={item.label} item={item} active={location.pathname === item.to && location.state?.tab === item.state?.tab} collapsed={collapsed} />)}</Stack>
          </Box>
        )}
      </Stack>

      {user && !collapsed && (
        <Box sx={{ p: 1.6 }}>
          <Paper sx={{ p: 1.8, borderRadius: 2.5, border: '1px solid rgba(139,92,246,.22)', background: 'linear-gradient(145deg, rgba(124,58,237,.18), rgba(255,255,255,.025))' }}>
            <Stack direction="row" spacing={1.15} alignItems="center" mb={1.3}>
              <AutoGraphRounded sx={{ color: '#a855f7' }} />
              <Box>
                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 13 }}>
                  {user.subscription ? `Plan ${String(user.subscription).toUpperCase()}` : 'Plan gratuito'}
                </Typography>
                <Typography sx={{ color: 'rgba(245,245,247,.52)', fontSize: 11 }}>Accede a todas las funciones</Typography>
              </Box>
            </Stack>
            <Button component={Link} to="/billing" variant="outlined" fullWidth sx={{ py: .9, color: '#fff', borderColor: 'rgba(255,255,255,.14)' }}>
              Gestionar plan
            </Button>
          </Paper>
        </Box>
      )}

      <Box
        onClick={onToggle}
        title={collapsed ? 'Expandir menú' : 'Ocultar menú'}
        sx={{
          mx: collapsed ? 1 : 1.4, mb: 1.2, py: 1.25, borderRadius: 1.8,
          borderTop: '1px solid rgba(255,255,255,.08)',
          color: 'rgba(245,245,247,.62)',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          cursor: 'pointer',
          '&:hover': { color: '#fff' },
        }}
      >
        {!collapsed && <Stack direction="row" spacing={1} alignItems="center"><SettingsRounded sx={{ fontSize: 17 }} /><Typography sx={{ fontSize: 12, fontWeight: 800 }}>Colapsar</Typography></Stack>}
        {collapsed ? <KeyboardDoubleArrowRightRounded sx={{ fontSize: 17 }} /> : <KeyboardDoubleArrowLeftRounded sx={{ fontSize: 17 }} />}
      </Box>
    </Box>
  )
}

// rumarrcc: el menú móvil queda fijo para no perder navegación en pantallas estrechas.
function MobileDrawer({ open, onClose, user, location, navigate }) {
  const isActive = item => (
    location.pathname === item.to ||
    (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)) ||
    (item.to === '/admin' && location.pathname === '/admin')
  )
  const go = (to, state) => {
    navigate(to, { state })
    onClose()
  }

  return (
    <Drawer anchor="left" open={open} onClose={onClose} PaperProps={{ sx: { width: 'min(88vw, 340px)', bgcolor: '#070a14', color: '#fff', borderRight: '1px solid rgba(255,255,255,.10)' } }}>
      <Box sx={{ height: 66, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #6d28d9, #a855f7)' }}>
            <AutoGraphRounded sx={{ fontSize: 20 }} />
          </Box>
          <Typography sx={{ fontWeight: 950, fontSize: 18 }} noWrap>MyPredicts</Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseRounded /></IconButton>
      </Box>

      {user ? (
        <Box sx={{ m: 1.6, p: 1.2, border: '1px solid rgba(255,255,255,.10)', borderRadius: 2, background: 'rgba(255,255,255,.025)' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar src={user.avatar_url || undefined} sx={{ bgcolor: '#1d122f', border: '1px solid rgba(168,85,247,.28)', fontWeight: 900 }}>
              {user.username?.slice(0, 2).toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 850 }}>{user.username}</Typography>
              <Typography sx={{ color: '#a855f7', fontWeight: 800, fontSize: 12 }}>
                {user.subscription ? `Plan ${String(user.subscription).toUpperCase()}` : 'Plan gratuito'}
              </Typography>
            </Box>
          </Stack>
        </Box>
      ) : (
        <Stack direction="row" spacing={1} sx={{ p: 1.6 }}>
          <Button fullWidth variant="outlined" onClick={() => go('/login')}>Login</Button>
          <Button fullWidth variant="contained" onClick={() => go('/register')}>Registro</Button>
        </Stack>
      )}

      <Stack spacing={2} sx={{ px: 1.4, pb: 2, overflowY: 'auto' }}>
        {navSections.map((section, index) => (
          <Box key={index}>
            <Stack spacing={.45}>
              {section.map(item => (
                <Button
                  key={item.label}
                  fullWidth
                  startIcon={item.icon}
                  onClick={() => go(item.to, item.state)}
                  sx={{
                    justifyContent: 'flex-start',
                    minHeight: 44,
                    px: 1.4,
                    color: isActive(item) ? '#fff' : 'rgba(245,245,247,.72)',
                    bgcolor: isActive(item) ? 'rgba(124,58,237,.28)' : 'transparent',
                    border: isActive(item) ? '1px solid rgba(139,92,246,.38)' : '1px solid transparent',
                    '& .MuiButton-startIcon': { minWidth: 22 },
                  }}
                >
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 850 }}>{item.label}</Typography>
                </Button>
              ))}
            </Stack>
            {index < navSections.length - 1 && <Divider sx={{ borderColor: 'rgba(255,255,255,.08)', mt: 1.4 }} />}
          </Box>
        ))}

        {['admin', 'global_admin'].includes(user?.role) && (
          <Box>
            <Typography sx={{ px: 1.2, mb: .7, color: 'rgba(245,245,247,.42)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Admin</Typography>
            <Stack spacing={.45}>
              {adminLinks.map(item => (
                <Button key={item.label} fullWidth startIcon={item.icon} onClick={() => go(item.to, item.state)} sx={{ justifyContent: 'flex-start', color: 'rgba(245,245,247,.74)' }}>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 850 }}>{item.label}</Typography>
                </Button>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Drawer>
  )
}

function Topbar({ user, onMenu }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const submitSearch = () => {
    const clean = query.trim()
    navigate(clean ? `/prediction?ticker=${encodeURIComponent(clean.toUpperCase())}` : '/stocks')
  }

  return (
    <Box sx={{ minHeight: 74, px: { xs: 1.2, sm: 2.4 }, py: { xs: 1, sm: 0 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, borderBottom: '1px solid rgba(255,255,255,.10)', background: 'rgba(5,7,17,.78)', backdropFilter: 'blur(18px)', position: 'sticky', top: 0, zIndex: 20 }}>
      <IconButton onClick={onMenu} sx={{ display: { xs: 'inline-flex', lg: 'none' }, color: '#fff', flexShrink: 0 }}>
        <MenuRounded />
      </IconButton>
      <Box sx={{ width: { xs: '100%', md: 500 }, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <TickerAutocomplete
          placeholder="Buscar ticker, activo o empresa..."
          value={query}
          onInputChange={setQuery}
          onChange={(symbol) => navigate(`/prediction?ticker=${symbol}`)}
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,.04)', borderRadius: 1.8 } }}
          textFieldProps={{ onKeyDown: e => { if (e.key === 'Enter') submitSearch() } }}
        />
      </Box>
      <Box sx={{ flex: 1 }} />
      {user ? (
        <Stack direction="row" spacing={{ xs: .75, sm: 1 }} alignItems="center" sx={{ flexShrink: 0 }}>
          <CoinBalanceBadge />
          <AccountMenu user={user} size={38} />
        </Stack>
      ) : (
        <>
          <Box
            onClick={() => navigate('/login')}
            sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: 'rgba(245,245,247,.78)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,.08)' } }}
          >
            <LoginRounded />
          </Box>
          <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            <Button onClick={() => navigate('/login')} variant="outlined" startIcon={<LoginRounded />} sx={{ py: .8 }}>
              Iniciar sesión
            </Button>
            <Button onClick={() => navigate('/register')} variant="contained" startIcon={<PersonAddRounded />} sx={{ py: .8 }}>
              Registrarse
            </Button>
          </Stack>
        </>
      )}
    </Box>
  )
}

export default function PremiumDashboardShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useSelector(s => s.auth?.user)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('mp_sidebar_collapsed') === '1' } catch { return false }
  })
  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev
      try { window.localStorage.setItem('mp_sidebar_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#050711', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 28% 0%, rgba(124,58,237,.16), transparent 26%), radial-gradient(circle at 80% 20%, rgba(59,130,246,.06), transparent 24%), #050711' }} />
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: .13, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <Sidebar user={user} location={location} collapsed={collapsed} onToggle={toggleSidebar} navigate={navigate} />
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} location={location} navigate={navigate} />
      <Box sx={{ pl: { lg: collapsed ? '78px' : '238px' }, position: 'relative', zIndex: 1, transition: 'padding-left .22s ease' }}>
        <Topbar user={user} onMenu={() => setMobileOpen(true)} />
        <Box sx={{ width: '100%', maxWidth: 1500, mx: 'auto', p: { xs: 1.25, sm: 1.6, md: 2.6 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
