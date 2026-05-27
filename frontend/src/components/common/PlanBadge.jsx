/**
 * PlanBadge — chip pequeño que muestra el plan del usuario (FREE / PRO / PREMIUM).
 * Props:
 *   plan: 'free' | 'pro' | 'premium'   (default: 'free')
 *   size: 'small' | 'medium'           (default: 'small')
 */
import { Chip } from '@mui/material'
import StarIcon             from '@mui/icons-material/Star'

const PLAN_CONFIG = {
  free:    { label: 'FREE',    color: '#888',    bg: 'rgba(136,136,136,0.12)', icon: null },
  pro:     { label: 'PRO',     color: '#2196f3', bg: 'rgba(33,150,243,0.12)',  icon: <StarIcon sx={{ fontSize: 13 }} /> },
  premium: { label: 'PRO', color: '#2196f3', bg: 'rgba(33,150,243,0.12)',  icon: <StarIcon sx={{ fontSize: 13 }} /> },
}

export default function PlanBadge({ plan = 'free', size = 'small' }) {
  const cfg = PLAN_CONFIG[plan] || PLAN_CONFIG.free
  return (
    <Chip
      size={size}
      label={cfg.label}
      icon={cfg.icon}
      sx={{
        fontWeight: 700,
        fontSize: size === 'small' ? 10 : 12,
        letterSpacing: 0.5,
        color: cfg.color,
        bgcolor: cfg.bg,
        border: `1px solid ${cfg.color}40`,
        '& .MuiChip-icon': { color: cfg.color },
        height: size === 'small' ? 20 : 24,
      }}
    />
  )
}
