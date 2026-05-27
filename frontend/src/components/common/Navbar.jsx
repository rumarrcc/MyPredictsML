import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useDispatch, useSelector } from 'react-redux'
import { toggleTheme } from '@/store/slices/themeSlice'
import { getMeThunk } from '@/store/slices/authSlice'
import {
  AppBar, Toolbar, Typography, Button, IconButton, Avatar,
  Menu, MenuItem, Divider, InputBase, Box, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, useMediaQuery, useTheme, Chip,
} from '@mui/material'
import {
  Search, Menu as MenuIcon, Dashboard, TrendingUp,
  NotificationsActive, AccountBalance, Logout, Person,
  ShowChart, Newspaper, AdminPanelSettings, LightMode, DarkMode, Refresh,
  Storefront, Casino, LocalMall, CreditCard,
  Settings,
} from '@mui/icons-material'
import PlanBadge from '@/components/common/PlanBadge'
import CoinBalanceBadge from '@/components/coins/CoinBalanceBadge'

const NAV_LINKS = [
  { to: '/dashboard',   label: 'Dashboard',    icon: <Dashboard />,              auth: true  },
  { to: '/prediction',  label: 'Predicciones ML', icon: <TrendingUp />,          auth: false },
  { to: '/stocks',      label: 'Mercado',      icon: <Storefront />,             auth: false },
  { to: '/marketplace', label: 'Marketplace',  icon: <LocalMall />,              auth: false },
  { to: '/wheel',       label: 'Ruleta',       icon: <Casino />,                 auth: true  },
  { to: '/news',        label: 'Noticias',     icon: <Newspaper />,              auth: false },
  { to: '/backtest',    label: 'Backtesting',  icon: <ShowChart />,              auth: true  },
  { to: '/investments', label: 'Cartera virtual', icon: <AccountBalance />,      auth: true  },
  { to: '/admin',       label: 'Admin',        icon: <AdminPanelSettings />,     auth: true, adminOnly: true },
]

export default function Navbar() {
  const { user, isAuthenticated, signOut } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const theme      = useTheme()
  const isMobile   = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch   = useDispatch()
  const themeMode  = useSelector(s => s.theme?.mode || 'dark')
  const isDark     = themeMode === 'dark'
  const isAdmin    = user?.role === 'admin'

  const [anchorEl,    setAnchorEl]    = useState(null)
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [searchVal,   setSearchVal]   = useState('')
  const [refreshing,  setRefreshing]  = useState(false)

  const handleRefreshSession = async () => {
    setRefreshing(true)
    try {
      await dispatch(getMeThunk()).unwrap()
    } catch (_) {}
    finally { setRefreshing(false) }
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchVal.trim()) {
      navigate(`/prediction?ticker=${searchVal.trim().toUpperCase()}`)
      setSearchVal('')
    }
  }

  return (
    <>
      <AppBar position="sticky" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', color: 'text.primary' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <ShowChart sx={{ color: '#2196f3', fontSize: 28 }} />
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>
              My<span style={{ color: '#2196f3' }}>Predicts</span>
            </Typography>
          </Link>

          <Box sx={{ flex: 1 }} />

          <Box sx={{
            display: 'flex', alignItems: 'center', bgcolor: 'action.hover',
            borderRadius: 2, px: 1.5, py: 0.5, mr: 1,
            width: { xs: 120, sm: 200, md: 240 },
          }}>
            <Search sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />
            <InputBase
              placeholder="Buscar ticker…"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value.toUpperCase())}
              onKeyDown={handleSearch}
              sx={{ color: 'text.primary', fontSize: 14, flex: 1 }}
              inputProps={{ maxLength: 10 }}
            />
          </Box>

          {!isMobile && NAV_LINKS.filter(l => (!l.auth || isAuthenticated) && (!l.adminOnly || user?.role === 'admin')).map(l => (
            <Button
              key={l.to}
              component={Link}
              to={l.to}
              size="small"
              sx={{
                color: location.pathname === l.to ? '#2196f3' : '#aaa',
                textTransform: 'none',
                fontWeight: location.pathname === l.to ? 700 : 400,
                '&:hover': { color: '#fff' },
              }}
            >
              {l.label}
            </Button>
          ))}

          <IconButton onClick={() => dispatch(toggleTheme())} size="small"
            sx={{ color: isDark ? '#ffc107' : '#7c3aed', mx: 0.5 }}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>

          {isAuthenticated ? (
            <>
              <CoinBalanceBadge compact={isMobile} />
              <IconButton onClick={e => setAnchorEl(e.currentTarget)} size="small" sx={{ ml: 1 }}>
                <Avatar src={user?.avatar_url || undefined} sx={{ width: 32, height: 32, bgcolor: '#2196f3', fontSize: 14 }}>
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
                PaperProps={{ sx: { bgcolor: 'background.paper', color: 'text.primary', mt: 1, border: '1px solid', borderColor: 'divider', minWidth: 200 } }}>
                <MenuItem disabled sx={{ opacity: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                  <Typography variant="body2" fontWeight={700} color="text.primary">@{user?.username}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip
                      label={isAdmin ? 'Admin' : 'Usuario'}
                      size="small"
                      sx={{
                        bgcolor: isAdmin ? '#7c3aed22' : '#2196f322',
                        color:   isAdmin ? '#b89eff'   : '#2196f3',
                        border: `1px solid ${isAdmin ? '#7c3aed44' : '#2196f344'}`,
                        fontSize: 10, fontWeight: 700, height: 20,
                      }}
                    />
                    <PlanBadge plan={user?.subscription || 'free'} size="small" />
                  </Box>
                </MenuItem>
                <Divider sx={{ borderColor: 'divider' }} />

                <MenuItem onClick={() => { setAnchorEl(null); navigate('/profile') }}>
                  <Person fontSize="small" sx={{ mr: 1 }} /> Mi perfil
                </MenuItem>

                <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings') }}>
                  <Settings fontSize="small" sx={{ mr: 1 }} /> Ajustes
                </MenuItem>

                <MenuItem onClick={() => { setAnchorEl(null); navigate('/strategies') }}>
                  <LocalMall fontSize="small" sx={{ mr: 1 }} /> Mis Estrategias
                </MenuItem>

                <MenuItem onClick={() => { setAnchorEl(null); navigate('/billing') }}>
                  <CreditCard fontSize="small" sx={{ mr: 1 }} /> Mi plan
                </MenuItem>

                {isAdmin && (
                  <MenuItem onClick={() => { setAnchorEl(null); navigate('/admin') }}
                    sx={{ bgcolor: '#7c3aed11', '&:hover': { bgcolor: '#7c3aed22' } }}>
                    <AdminPanelSettings fontSize="small" sx={{ mr: 1, color: '#b89eff' }} />
                    <Typography sx={{ color: '#b89eff', fontWeight: 700 }}>Panel Admin</Typography>
                  </MenuItem>
                )}

                <MenuItem onClick={() => { handleRefreshSession() }}
                  disabled={refreshing}
                  sx={{ color: 'text.secondary', fontSize: 13 }}>
                  <Refresh fontSize="small" sx={{ mr: 1, fontSize: 16, animation: refreshing ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
                  {refreshing ? 'Actualizando...' : 'Actualizar sesión'}
                </MenuItem>

                <Divider sx={{ borderColor: 'divider' }} />
                <MenuItem onClick={() => { setAnchorEl(null); signOut() }} sx={{ color: '#f44336' }}>
                  <Logout fontSize="small" sx={{ mr: 1 }} /> Cerrar sesión
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button component={Link} to="/login" size="small"
                sx={{ color: '#aaa', textTransform: 'none', '&:hover': { color: '#fff' } }}>
                Entrar
              </Button>
              <Button component={Link} to="/register" variant="contained" size="small"
                sx={{ textTransform: 'none', borderRadius: 2 }}>
                Registrarse
              </Button>
            </Box>
          )}

          {isMobile && (
            <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }}>
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { bgcolor: 'background.paper', color: 'text.primary', width: 240 } }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" color="text.secondary">@{user?.username}</Typography>
        </Box>
        <List>
          {NAV_LINKS.filter(l => (!l.auth || isAuthenticated) && (!l.adminOnly || user?.role === 'admin')).map(l => (
            <ListItemButton key={l.to} onClick={() => { navigate(l.to); setDrawerOpen(false) }}
              selected={location.pathname === l.to}
              sx={{ '&.Mui-selected': { bgcolor: '#2d2d4e' } }}>
              <ListItemIcon sx={{ color: '#2196f3', minWidth: 36 }}>{l.icon}</ListItemIcon>
              <ListItemText primary={l.label} />
            </ListItemButton>
          ))}
          {isAuthenticated && (
            <>
              <ListItemButton onClick={() => { navigate('/strategies'); setDrawerOpen(false) }}
                selected={location.pathname === '/strategies'}
                sx={{ '&.Mui-selected': { bgcolor: '#2d2d4e' } }}>
                <ListItemIcon sx={{ color: '#2196f3', minWidth: 36 }}><LocalMall /></ListItemIcon>
                <ListItemText primary="Mis Estrategias" />
              </ListItemButton>
              <ListItemButton onClick={() => { navigate('/settings'); setDrawerOpen(false) }}
                selected={location.pathname === '/settings'}
                sx={{ '&.Mui-selected': { bgcolor: '#2d2d4e' } }}>
                <ListItemIcon sx={{ color: '#b89eff', minWidth: 36 }}><Settings /></ListItemIcon>
                <ListItemText primary="Ajustes" />
              </ListItemButton>
              <ListItemButton onClick={() => { navigate('/billing'); setDrawerOpen(false) }}
                selected={location.pathname === '/billing'}
                sx={{ '&.Mui-selected': { bgcolor: '#2d2d4e' } }}>
                <ListItemIcon sx={{ color: '#ffd700', minWidth: 36 }}><CreditCard /></ListItemIcon>
                <ListItemText primary="Mi plan" secondary={<PlanBadge plan={user?.subscription || 'free'} />} />
              </ListItemButton>
            </>
          )}
          <Divider sx={{ borderColor: 'divider', my: 1 }} />
          <ListItemButton onClick={signOut} sx={{ color: '#f44336' }}>
            <ListItemIcon sx={{ color: '#f44336', minWidth: 36 }}><Logout /></ListItemIcon>
            <ListItemText primary="Cerrar sesión" />
          </ListItemButton>
        </List>
      </Drawer>
    </>
  )
}
