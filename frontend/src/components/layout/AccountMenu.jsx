import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar, Box, Button, Chip, Divider, IconButton, Menu, MenuItem,
  Stack, Typography,
} from '@mui/material'
import {
  CreditCardRounded, LogoutRounded, ManageAccountsRounded,
  PaymentRounded, PersonRounded, AccountBalanceWalletRounded,
} from '@mui/icons-material'
import { logout } from '@/store/slices/authSlice'

export default function AccountMenu({ user, size = 38 }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [anchorEl, setAnchorEl] = useState(null)
  const open = Boolean(anchorEl)

  const username = user?.username || user?.full_name || 'Usuario'
  const initials = username.slice(0, 2).toUpperCase()
  const email = user?.email || 'Sin email'
  const plan = user?.subscription || user?.plan || 'free'

  useEffect(() => {
    setAnchorEl(null)
  }, [location.pathname])

  const go = (to, state) => {
    setAnchorEl(null)
    window.setTimeout(() => {
      navigate(to, state ? { state } : undefined)
    }, 0)
  }

  const signOut = () => {
    setAnchorEl(null)
    dispatch(logout())
    navigate('/login', { replace: true })
  }

  return (
    <>
      <IconButton
        onClick={event => setAnchorEl(event.currentTarget)}
        aria-label="Abrir menú de cuenta"
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        sx={{ p: 0 }}
      >
        <Avatar
          sx={{
            width: size,
            height: size,
            bgcolor: 'rgba(255,255,255,.08)',
            border: open ? '1px solid rgba(168,85,247,.72)' : '1px solid rgba(255,255,255,.12)',
            boxShadow: open ? '0 0 26px rgba(124,58,237,.38)' : 'none',
            cursor: 'pointer',
            fontSize: size <= 34 ? 12 : 14,
            fontWeight: 900,
          }}
        >
          {initials}
        </Avatar>
      </IconButton>

      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        PaperProps={{
          sx: {
            mt: 1.2,
            width: 310,
            borderRadius: 3,
            p: 1,
            color: '#fff',
            border: '1px solid rgba(139,92,246,.24)',
            background: 'linear-gradient(145deg, rgba(13,17,30,.98), rgba(5,7,14,.98))',
            boxShadow: '0 28px 90px rgba(0,0,0,.55), inset 0 1px rgba(255,255,255,.05)',
          },
        }}
      >
        <Box sx={{ p: 1.4 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Avatar src={user?.avatar_url || undefined} sx={{ width: 46, height: 46, bgcolor: '#1d122f', border: '1px solid rgba(168,85,247,.34)', fontWeight: 950 }}>
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 950, fontSize: 14 }} noWrap>{username}</Typography>
              <Typography sx={{ color: 'rgba(245,245,247,.56)', fontSize: 12 }} noWrap>{email}</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.4 }}>
            <Chip label={`Plan ${String(plan).toUpperCase()}`} size="small" sx={{ height: 24 }} />
            <Typography sx={{ color: 'rgba(245,245,247,.46)', fontSize: 11 }}>Cuenta activa</Typography>
          </Stack>

          <Button
            fullWidth
            variant="contained"
            startIcon={<PersonRounded />}
            onClick={() => go('/profile')}
            sx={{ mt: 1.5, py: 1 }}
          >
            Ver mi perfil
          </Button>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,.08)', my: .5 }} />

        <MenuItem onClick={() => go('/billing')} sx={{ borderRadius: 2, py: 1.1 }}>
          <ManageAccountsRounded sx={{ mr: 1.2, color: '#a855f7', fontSize: 20 }} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 850 }}>Mi plan</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(245,245,247,.48)' }}>Ver límites, uso y suscripción</Typography>
          </Box>
        </MenuItem>

        <MenuItem onClick={() => go('/billing/payment-methods')} sx={{ borderRadius: 2, py: 1.1 }}>
          <PaymentRounded sx={{ mr: 1.2, color: '#60a5fa', fontSize: 20 }} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 850 }}>Métodos de pago</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(245,245,247,.48)' }}>Tarjetas, facturas y portal de Stripe</Typography>
          </Box>
        </MenuItem>

        <MenuItem onClick={() => go('/wallet')} sx={{ borderRadius: 2, py: 1.1 }}>
          <AccountBalanceWalletRounded sx={{ mr: 1.2, color: '#c084fc', fontSize: 20 }} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 850 }}>Wallet</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(245,245,247,.48)' }}>Saldo, recargas y compras</Typography>
          </Box>
        </MenuItem>

        <MenuItem onClick={() => go('/billing/invoices')} sx={{ borderRadius: 2, py: 1.1 }}>
          <CreditCardRounded sx={{ mr: 1.2, color: '#39d98a', fontSize: 20 }} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 850 }}>Facturación</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(245,245,247,.48)' }}>Historial y gestión de suscripción</Typography>
          </Box>
        </MenuItem>

        <Divider sx={{ borderColor: 'rgba(255,255,255,.08)', my: .5 }} />

        <MenuItem onClick={signOut} sx={{ borderRadius: 2, py: 1.1, color: '#ff8aa0' }}>
          <LogoutRounded sx={{ mr: 1.2, fontSize: 20 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 900 }}>Cerrar sesión</Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
