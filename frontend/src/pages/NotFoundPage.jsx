import { useNavigate } from 'react-router-dom'
import { Box, Typography, Button } from '@mui/material'
import { Home, ArrowBack } from '@mui/icons-material'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Box sx={{
      bgcolor: 'background.default', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      px: 3, textAlign: 'center',
    }}>
      <Typography sx={{
        fontSize: { xs: '6rem', md: '10rem' }, fontWeight: 900, lineHeight: 1,
        background: 'linear-gradient(135deg, #7c3aed 30%, #2196f3 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        mb: 2,
      }}>
        404
      </Typography>
      <Typography variant="h5" fontWeight={700} color="#fff" mb={1}>
        Página no encontrada
      </Typography>
      <Typography color="#888" mb={5} maxWidth={400}>
        La página que buscas no existe o ha sido movida. Vuelve al inicio para continuar.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant="contained" startIcon={<Home />} onClick={() => navigate('/')}
          sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 3 }}>
          Ir al inicio
        </Button>
        <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate(-1)}
          sx={{ borderColor: 'divider', color: '#aaa', px: 3 }}>
          Volver atrás
        </Button>
      </Box>
    </Box>
  )
}
