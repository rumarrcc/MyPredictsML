import { Box, Typography, Button, Stack, Chip } from '@mui/material'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import { useNavigate } from 'react-router-dom'

export default function UpgradeCTA({ plan = 'free', variant = 'banner', feature, onUpgrade }) {
  const navigate = useNavigate()
  const normalizedPlan = plan === 'premium' ? 'pro' : plan
  const handleUpgrade = onUpgrade || (() => navigate('/billing'))

  if (normalizedPlan === 'pro') return null

  const btnColor = '#2196f3'
  const title = 'Activa PRO'
  const subtitle = 'Predicciones avanzadas, venta de estrategias, backtesting ilimitado, exportacion y 2 giros diarios.'

  if (variant === 'card') {
    return (
      <Box sx={{
        borderRadius: 2, p: 3, border: `1px solid ${btnColor}40`,
        background: `linear-gradient(135deg, rgba(0,0,0,0.6) 0%, ${btnColor}18 100%)`,
        display: 'flex', flexDirection: 'column', gap: 1.5,
      }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <RocketLaunchIcon sx={{ fontSize: 28, color: btnColor }} />
          <Typography variant="h6" fontWeight={700} color="text.primary">{title}</Typography>
        </Stack>
        {feature && (
          <Chip label={`Para: ${feature}`} size="small" sx={{ width: 'fit-content', bgcolor: `${btnColor}20`, color: btnColor }} />
        )}
        <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        <Button
          variant="contained"
          size="small"
          onClick={handleUpgrade}
          sx={{ alignSelf: 'flex-start', bgcolor: btnColor, color: '#fff', fontWeight: 700, '&:hover': { filter: 'brightness(1.1)' } }}
        >
          Ver PRO
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{
      borderRadius: 2, px: 3, py: 1.5,
      background: `linear-gradient(90deg, ${btnColor}22 0%, transparent 100%)`,
      border: `1px solid ${btnColor}30`,
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
    }}>
      <RocketLaunchIcon sx={{ fontSize: 28, color: btnColor }} />
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" fontWeight={700} color="text.primary">{title}</Typography>
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      </Box>
      <Button
        variant="outlined"
        size="small"
        onClick={handleUpgrade}
        sx={{ borderColor: btnColor, color: btnColor, fontWeight: 700, flexShrink: 0, '&:hover': { bgcolor: `${btnColor}15` } }}
      >
        Ver PRO
      </Button>
    </Box>
  )
}
