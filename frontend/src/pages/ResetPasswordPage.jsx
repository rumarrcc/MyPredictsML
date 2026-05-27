import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { authService } from '@/services/authService'
import { toast } from 'react-toastify'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    try {
      setLoading(true)
      await authService.resetPassword({ token, password })
      setDone(true)
      toast.success('Contraseña actualizada')
      setTimeout(() => navigate('/login'), 1200)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      p: 2,
      background: 'radial-gradient(circle at top left, rgba(124,58,237,.28), transparent 34%), #050711',
    }}>
      <Paper component="form" onSubmit={submit} elevation={0} sx={{
        width: '100%',
        maxWidth: 500,
        p: { xs: 3, sm: 4 },
        borderRadius: 4,
        bgcolor: 'rgba(15,23,42,.86)',
        border: '1px solid rgba(255,255,255,.10)',
        color: '#fff',
      }}>
        <Typography variant="h4" fontWeight={950} mb={1}>Nueva contraseña</Typography>
        <Typography color="rgba(255,255,255,.62)" mb={3}>
          Crea una contraseña nueva para tu cuenta.
        </Typography>
        {!token && <Alert severity="warning" sx={{ mb: 2 }}>El enlace no contiene token de recuperación.</Alert>}
        {done && <Alert severity="success" sx={{ mb: 2 }}>Contraseña actualizada. Redirigiendo al login...</Alert>}
        <TextField
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          label="Nueva contraseña"
          type="password"
          fullWidth
          required
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.58)' } }}
        />
        <TextField
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          label="Confirmar contraseña"
          type="password"
          fullWidth
          required
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.58)' } }}
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading || !token} sx={{ py: 1.4, borderRadius: 2.5, fontWeight: 900 }}>
          Guardar contraseña
        </Button>
        <Typography textAlign="center" mt={3} variant="body2">
          <Link to="/login" style={{ color: '#c4b5fd', fontWeight: 700 }}>Volver al login</Link>
        </Typography>
      </Paper>
    </Box>
  )
}
