import { Box, Typography, Button, Alert } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import { useNavigate } from 'react-router-dom'

const PLAN_RANK = { free: 0, pro: 1, premium: 1 }

function normalizePlan(plan) {
  return plan === 'premium' ? 'pro' : (plan || 'free')
}

function hasAccess(currentPlan, requiredPlan) {
  return (PLAN_RANK[normalizePlan(currentPlan)] ?? 0) >= (PLAN_RANK[normalizePlan(requiredPlan)] ?? 0)
}

export default function FeatureGate({ requiredPlan = 'pro', currentPlan = 'free', feature = 'esta función', children, fallback }) {
  const navigate = useNavigate()

  if (hasAccess(currentPlan, requiredPlan)) {
    return children
  }

  if (fallback) return fallback

  const planLabel = 'PRO'

  return (
    <Box
      sx={{
        position: 'relative',
        filter: 'blur(2px)',
        pointerEvents: 'none',
        userSelect: 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 100%)',
          borderRadius: 2,
        }
      }}
    >
      <Box sx={{ opacity: 0.4, pointerEvents: 'none' }}>
        {children}
      </Box>

      <Box sx={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2, p: 3,
        borderRadius: 2, border: '1px solid rgba(255,215,0,0.3)',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        pointerEvents: 'all', filter: 'none',
      }}>
        <LockIcon sx={{ fontSize: 36, color: '#ffd700' }} />
        <Typography variant="body1" color="text.primary" fontWeight={600} textAlign="center">
          {feature} requiere plan {planLabel}
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={() => navigate('/billing')}
          sx={{ bgcolor: '#ffd700', color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#ffec6e' } }}
        >
          Actualizar plan
        </Button>
      </Box>
    </Box>
  )
}

export function FeatureGateAlert({ requiredPlan = 'pro', currentPlan = 'free', feature = 'esta función' }) {
  const navigate = useNavigate()

  if (hasAccess(currentPlan, requiredPlan)) return null

  const planLabel = 'PRO'

  return (
    <Alert
      severity="warning"
      icon={<LockIcon />}
      action={
        <Button color="warning" size="small" onClick={() => navigate('/billing')} sx={{ fontWeight: 700 }}>
          Actualizar
        </Button>
      }
      sx={{ mb: 2 }}
    >
      {feature} está disponible desde el plan <strong>{planLabel}</strong>.
    </Alert>
  )
}
