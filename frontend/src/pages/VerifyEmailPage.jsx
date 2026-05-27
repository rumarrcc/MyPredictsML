import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead'
import { authService } from '@/services/authService'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, ok: false, message: 'Verificando correo...' })

  useEffect(() => {
    const token = params.get('token') || ''
    if (!token) {
      setState({ loading: false, ok: false, message: 'El enlace de verificación no es válido.' })
      return
    }

    authService.verifyEmail(token)
      .then((data) => {
        if (data.token) localStorage.setItem('token', data.token)
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
        setState({ loading: false, ok: true, message: data.message || 'Correo verificado correctamente.' })
      })
      .catch((err) => {
        setState({
          loading: false,
          ok: false,
          message: err?.response?.data?.message || 'No se pudo verificar el correo.',
        })
      })
  }, [params])

  return (
    <Box sx={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      p: 2,
      background: 'radial-gradient(circle at top left, rgba(124,58,237,.28), transparent 34%), #050711',
    }}>
      <Paper elevation={0} sx={{
        width: '100%',
        maxWidth: 520,
        p: { xs: 3, sm: 4 },
        borderRadius: 4,
        bgcolor: 'rgba(15,23,42,.86)',
        border: '1px solid rgba(255,255,255,.10)',
        color: '#fff',
        textAlign: 'center',
      }}>
        <Stack spacing={2.5} alignItems="center">
          {state.loading ? <CircularProgress color="secondary" /> : <MarkEmailReadIcon sx={{ fontSize: 54, color: state.ok ? '#22c55e' : '#f97316' }} />}
          <Typography variant="h4" fontWeight={950}>Verificación de correo</Typography>
          <Alert severity={state.ok ? 'success' : 'warning'} sx={{ width: '100%', textAlign: 'left' }}>
            {state.message}
          </Alert>
          {state.ok ? (
            <Button variant="contained" onClick={() => navigate('/dashboard')} sx={{ borderRadius: 2.5, fontWeight: 900 }}>
              Entrar al dashboard
            </Button>
          ) : (
            <Button component={Link} to="/login" variant="contained" sx={{ borderRadius: 2.5, fontWeight: 900 }}>
              Volver al login
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  )
}
