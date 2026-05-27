import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, CircularProgress, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import { PaidRounded } from '@mui/icons-material'
import coinPaymentService from '@/services/coinPaymentService'

export default function CoinBalanceBadge({ compact = false }) {
  const navigate = useNavigate()
  const theme = useTheme()
  const verySmall = useMediaQuery(theme.breakpoints.down('sm'))
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadBalance = async () => {
    setLoading(true)
    try {
      const data = await coinPaymentService.balance()
      setBalance(Number(data?.balance || 0))
    } catch (_) {
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBalance()
    const refresh = () => loadBalance()
    window.addEventListener('focus', refresh)
    window.addEventListener('mypredicts:coins-updated', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('mypredicts:coins-updated', refresh)
    }
  }, [])

  if (balance === null && !loading) return null

  const label = loading
    ? '...'
    : compact || verySmall
      ? Number(balance).toLocaleString('es-ES')
      : `${Number(balance).toLocaleString('es-ES')} monedas`

  return (
    <Tooltip title="Tu saldo de monedas internas">
      <Chip
        clickable
        onClick={() => navigate('/wallet')}
        icon={loading ? <CircularProgress size={14} color="inherit" /> : <PaidRounded />}
        label={label}
        variant="outlined"
        sx={{
          maxWidth: { xs: 96, sm: 160 },
          height: { xs: 34, sm: 36 },
          flexShrink: 0,
          borderColor: 'rgba(247,201,72,.38)',
          color: '#ffe08a',
          bgcolor: 'rgba(247,201,72,.08)',
          fontWeight: 950,
          '& .MuiChip-icon': {
            color: '#f7c948',
            ml: 1,
          },
          '&:hover': {
            bgcolor: 'rgba(247,201,72,.14)',
            borderColor: 'rgba(247,201,72,.62)',
          },
        }}
      />
    </Tooltip>
  )
}
