import { Box, CircularProgress, Typography } from '@mui/material'

export default function LoadingSpinner({ fullscreen, message = 'Cargando…', size = 40 }) {
  if (fullscreen) {
    return (
      <Box sx={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        bgcolor: '#12121f', zIndex: 9999, gap: 2,
      }}>
        <CircularProgress size={size} sx={{ color: '#2196f3' }} />
        <Typography color="#aaa" variant="body2">{message}</Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
      <CircularProgress size={size} sx={{ color: '#2196f3' }} />
      <Typography color="#aaa" variant="body2">{message}</Typography>
    </Box>
  )
}
