import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { authService } from '@/services/authService'
import { toast } from 'react-toastify'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    try {
      setLoading(true)
      await authService.forgotPassword(email)
      setSent(true)
      toast.success('Revisa tu correo si la cuenta existe.')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo enviar el correo')
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
        <Typography variant="h4" fontWeight={950} mb={1}>Recuperar contraseña</Typography>
        <Typography color="rgba(255,255,255,.62)" mb={3}>
          Indica tu correo y te enviaremos un enlace para cambiar la contraseña.
        </Typography>
        {sent && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Si existe una cuenta con ese correo, recibirás instrucciones en unos minutos.
          </Alert>
        )}
        <TextField
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          label="Email"
          type="email"
          fullWidth
          required
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.58)' } }}
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ py: 1.4, borderRadius: 2.5, fontWeight: 900 }}>
          Enviar enlace
        </Button>
        <Typography textAlign="center" mt={3} variant="body2">
          <Link to="/login" style={{ color: '#c4b5fd', fontWeight: 700 }}>Volver al login</Link>
        </Typography>
      </Paper>
    </Box>
  )
}
