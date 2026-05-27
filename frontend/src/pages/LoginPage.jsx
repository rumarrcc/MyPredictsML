import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import {
  Alert, Box, Button, TextField, Typography, Paper, Divider, CircularProgress,
  Stack, Chip,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import AuthBrandPanel from '@/components/common/AuthBrandPanel'
import { loginThunk } from '@/store/slices/authSlice'
import { authService } from '@/services/authService'
import { loginSchema } from '@/utils/validators'
import { toast } from 'react-toastify'

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    bgcolor: 'rgba(255,255,255,.04)',
    borderRadius: 2.5,
    '& fieldset': { borderColor: 'rgba(255,255,255,.13)' },
    '&:hover fieldset': { borderColor: '#8b5cf6' },
    '&.Mui-focused fieldset': { borderColor: '#a855f7' },
  },
  '& label': { color: 'rgba(255,255,255,.58)' },
  '& .MuiFormHelperText-root': { color: '#f87171' },
}

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, user } = useSelector(s => s.auth)
  const from = location.state?.from?.pathname || '/dashboard'
  const preferredLanding = from === '/dashboard' ? (user?.settings?.landing_after_login || from) : from
  const initialEmail = location.state?.email || location.state?.unverifiedEmail || ''
  const verificationNotice = location.state?.verificationNotice || ''
  const [pendingEmail, setPendingEmail] = useState(location.state?.unverifiedEmail || '')
  const [resending, setResending] = useState(false)

  useEffect(() => { if (isAuthenticated) navigate(preferredLanding, { replace: true }) }, [isAuthenticated]) // eslint-disable-line

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: { email: initialEmail, password: '' },
  })

  const onSubmit = async (data) => {
    try {
      const result = await dispatch(loginThunk(data)).unwrap()
      const landing = from === '/dashboard' ? (result?.user?.settings?.landing_after_login || from) : from
      navigate(landing, { replace: true })
    } catch (err) {
      if (err?.error === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(err.email || data.email)
        toast.warning(err.message)
        return
      }
      toast.error(err?.message || err || 'Credenciales incorrectas')
    }
  }

  const resendVerification = async () => {
    if (!pendingEmail) return
    try {
      setResending(true)
      await authService.resendVerification(pendingEmail)
      toast.success('Si el correo está pendiente, te hemos enviado otro enlace.')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo reenviar el correo')
    } finally {
      setResending(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        p: { xs: 1.5, sm: 2.5, md: 4 },
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(124,58,237,.28), transparent 34%), radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 32%), #050711',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 1120,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.08fr .92fr' },
          borderRadius: { xs: 4, md: 5 },
          overflow: 'hidden',
          bgcolor: 'rgba(15,23,42,.78)',
          border: '1px solid rgba(255,255,255,.10)',
          boxShadow: '0 30px 90px rgba(0,0,0,.46)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <AuthBrandPanel mode="login" />

        <Box sx={{ p: { xs: 3, sm: 4, md: 5 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} mb={4}>
            <Box>
              <Typography variant="h4" fontWeight={950} letterSpacing="-0.04em">
                Iniciar sesión
              </Typography>
              <Typography color="rgba(255,255,255,.58)" mt={0.5}>
                Entra y sigue donde lo dejaste.
              </Typography>
            </Box>
            <Chip
              icon={<QueryStatsIcon />}
              label="Live"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                bgcolor: 'rgba(124,58,237,.18)',
                color: '#d8b4fe',
                border: '1px solid rgba(168,85,247,.32)',
                '& .MuiChip-icon': { color: '#a855f7' },
              }}
            />
          </Stack>

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {verificationNotice && (
              <Alert
                severity="success"
                action={pendingEmail ? (
                  <Button color="inherit" size="small" disabled={resending} onClick={resendVerification}>
                    Reenviar
                  </Button>
                ) : null}
                sx={{ bgcolor: 'rgba(34,197,94,.12)', color: '#bbf7d0', border: '1px solid rgba(34,197,94,.25)' }}
              >
                {verificationNotice}
              </Alert>
            )}
            {pendingEmail && !verificationNotice && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small" disabled={resending} onClick={resendVerification}>
                    Reenviar
                  </Button>
                }
                sx={{ bgcolor: 'rgba(250,204,21,.12)', color: '#fde68a', border: '1px solid rgba(250,204,21,.25)' }}
              >
                Verifica {pendingEmail} antes de iniciar sesión.
              </Alert>
            )}
            <Controller name="email" control={control} render={({ field }) => (
              <TextField {...field} label="Email" type="email" fullWidth sx={fieldSx}
                error={!!errors.email} helperText={errors.email?.message} />
            )} />
            <Controller name="password" control={control} render={({ field }) => (
              <TextField {...field} label="Contraseña" type="password" fullWidth sx={fieldSx}
                error={!!errors.password} helperText={errors.password?.message} />
            )} />

            <Typography textAlign="right" variant="body2">
              <Link to="/forgot-password" style={{ color: '#c4b5fd', fontWeight: 700 }}>¿Olvidaste tu contraseña?</Link>
            </Typography>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={isSubmitting || isLoading}
              startIcon={!isSubmitting && <LoginIcon />}
              sx={{
                mt: 1,
                py: 1.55,
                borderRadius: 2.5,
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                color: '#fff',
                fontWeight: 950,
                fontSize: 16,
                boxShadow: '0 18px 36px rgba(124,58,237,.32)',
              }}
            >
              {isSubmitting ? <CircularProgress size={22} color="inherit" /> : 'Entrar a MyPredicts'}
            </Button>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,.10)', my: 3 }} />

          <Typography color="rgba(255,255,255,.62)" textAlign="center" variant="body2">
            ¿No tienes cuenta?{' '}
            <Link to="/register" style={{ color: '#c4b5fd', fontWeight: 700 }}>Regístrate gratis</Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
