import { Box, Typography, Link } from '@mui/material'
import { ShowChart } from '@mui/icons-material'

export default function Footer() {
  return (
    <Box component="footer" sx={{
      bgcolor: '#12121f', borderTop: '1px solid #2d2d4e',
      py: 3, px: 4, mt: 'auto',
      display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
      alignItems: 'center', justifyContent: 'space-between', gap: 2,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShowChart sx={{ color: '#2196f3' }} />
        <Typography variant="body2" sx={{ color: '#888' }}>
          MyPredicts © {new Date().getFullYear()}
        </Typography>
      </Box>
      <Typography variant="caption" sx={{ color: '#555', textAlign: 'center', maxWidth: 480 }}>
        ⚠️ Las predicciones tienen ~55-60% de precisión. No constituyen asesoramiento financiero.
        Úsalo como herramienta educativa.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Link href="#" sx={{ color: '#555', fontSize: 12, '&:hover': { color: '#888' } }}>Privacidad</Link>
        <Link href="#" sx={{ color: '#555', fontSize: 12, '&:hover': { color: '#888' } }}>Términos</Link>
      </Box>
    </Box>
  )
}
