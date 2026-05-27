import { Box, Chip, Stack, Typography } from '@mui/material'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'

const metrics = [
  { label: 'Modelos ML', value: '3' },
  { label: 'Backtesting', value: 'Real' },
  { label: 'Pagos', value: 'Stripe' },
]

export default function AuthBrandPanel({ mode = 'login' }) {
  const isRegister = mode === 'register'

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: { xs: 260, md: 640 },
        p: { xs: 3, sm: 4, md: 5 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        borderRadius: { xs: 4, md: '28px 0 0 28px' },
        color: '#fff',
        background:
          'radial-gradient(circle at 15% 15%, rgba(124,58,237,.42), transparent 28%), radial-gradient(circle at 82% 24%, rgba(168,85,247,.28), transparent 30%), linear-gradient(145deg, #050711 0%, #0d1020 48%, #111827 100%)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.16,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'linear-gradient(135deg, #000, transparent 80%)',
        }}
      />

      <Stack direction="row" alignItems="center" gap={1.5} sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          component="img"
          src="/favicon.svg"
          alt="MyPredicts logo"
          sx={{ width: 48, height: 48, filter: 'drop-shadow(0 12px 22px rgba(124,58,237,.45))' }}
        />
        <Box>
          <Typography fontWeight={900} fontSize={22} lineHeight={1}>MyPredicts</Typography>
          <Typography color="rgba(255,255,255,.62)" fontSize={12}>Trading con datos, no corazonadas</Typography>
        </Box>
      </Stack>

      <Box sx={{ position: 'relative', zIndex: 1, py: { xs: 4, md: 0 } }}>
        <Chip
          icon={<TrendingUpIcon />}
          label={isRegister ? 'Empieza con datos reales' : 'Tu mesa de control financiero'}
          sx={{
            mb: 2,
            bgcolor: 'rgba(124,58,237,.18)',
            color: '#d8b4fe',
            border: '1px solid rgba(168,85,247,.32)',
            '& .MuiChip-icon': { color: '#a855f7' },
          }}
        />
        <Typography
          variant="h3"
          sx={{
            maxWidth: 520,
            fontWeight: 950,
            letterSpacing: '-0.06em',
            fontSize: { xs: 34, sm: 42, md: 54 },
            lineHeight: 0.95,
          }}
        >
          {isRegister ? 'Crea tu ventaja antes de invertir.' : 'Vuelve al cockpit de tus predicciones.'}
        </Typography>
        <Typography sx={{ mt: 2, maxWidth: 450, color: 'rgba(255,255,255,.68)', fontSize: { xs: 14, md: 16 } }}>
          Predicciones, noticias, backtesting y comunidad en una experiencia pensada para decidir mas rapido.
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        gap={1.5}
        sx={{ position: 'relative', zIndex: 1 }}
      >
        {metrics.map(item => (
          <Box
            key={item.label}
            sx={{
              flex: 1,
              p: 2,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.13)',
              backdropFilter: 'blur(14px)',
            }}
          >
            <Stack direction="row" alignItems="center" gap={1}>
              <AutoGraphIcon sx={{ color: '#a855f7', fontSize: 18 }} />
              <Typography fontWeight={900}>{item.value}</Typography>
            </Stack>
            <Typography color="rgba(255,255,255,.58)" fontSize={12}>{item.label}</Typography>
          </Box>
        ))}
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ position: 'absolute', right: 24, top: 24, display: { xs: 'none', md: 'flex' } }}
      >
        <ShieldOutlinedIcon sx={{ color: '#c4b5fd', fontSize: 18 }} />
        <Typography color="rgba(255,255,255,.66)" fontSize={12}>Cuenta protegida</Typography>
      </Stack>
    </Box>
  )
}
