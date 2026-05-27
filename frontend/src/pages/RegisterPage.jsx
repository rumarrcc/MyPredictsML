import { useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import {
  Box, Button, TextField, Typography, Paper, Divider, CircularProgress,
  Stack, Chip,
} from '@mui/material'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AuthBrandPanel from '@/components/common/AuthBrandPanel'
import { registerThunk } from '@/store/slices/authSlice'
import { registerSchema } from '@/utils/validators'
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

export default function RegisterPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useSelector(s => s.auth)
  const from = location.state?.from?.pathname || '/dashboard'

  useEffect(() => { if (isAuthenticated) navigate(from, { replace: true }) }, [isAuthenticated]) // eslint-disable-line

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (data) => {
    try {
      const result = await dispatch(registerThunk(data)).unwrap()
      const emailSent = result?.verification_email_sent !== false
      navigate('/login', {
        replace: true,
        state: {
          unverifiedEmail: data.email,
          email: data.email,
          verificationNotice: emailSent
            ? 'Cuenta creada. Te hemos enviado un enlace al correo para confirmar la cuenta. Cuando la verifiques, inicia sesión.'
            : 'Cuenta creada. Si no recibes el correo, puedes reenviar la verificación desde esta pantalla.',
        },
      })
    } catch (err) {
      toast.error(err?.message || err || 'Error al crear cuenta')
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
          'radial-gradient(circle at top left, rgba(124,58,237,.28), transparent 30%), radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 34%), #050711',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 1120,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.02fr .98fr' },
          borderRadius: { xs: 4, md: 5 },
          overflow: 'hidden',
          bgcolor: 'rgba(15,23,42,.78)',
          border: '1px solid rgba(255,255,255,.10)',
          boxShadow: '0 30px 90px rgba(0,0,0,.46)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <AuthBrandPanel mode="register" />

        <Box sx={{ p: { xs: 3, sm: 4, md: 5 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} mb={3}>
            <Box>
              <Typography variant="h4" fontWeight={950} letterSpacing="-0.04em">
                Crear cuenta
              </Typography>
              <Typography color="rgba(255,255,255,.58)" mt={0.5}>
                Monta tu radar financiero en menos de un minuto.
              </Typography>
            </Box>
            <Chip
              icon={<CheckCircleIcon />}
              label="Gratis"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                bgcolor: 'rgba(124,58,237,.18)',
                color: '#d8b4fe',
                border: '1px solid rgba(168,85,247,.32)',
                '& .MuiChip-icon': { color: '#a855f7' },
              }}
            />
          </Stack>

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Controller name="username" control={control} render={({ field }) => (
              <TextField {...field} label="Nombre de usuario" fullWidth sx={fieldSx}
                error={!!errors.username} helperText={errors.username?.message} />
            )} />
            <Controller name="email" control={control} render={({ field }) => (
              <TextField {...field} label="Email" type="email" fullWidth sx={fieldSx}
                error={!!errors.email} helperText={errors.email?.message} />
            )} />
            <Controller name="password" control={control} render={({ field }) => (
              <TextField {...field} label="Contraseña" type="password" fullWidth sx={fieldSx}
                error={!!errors.password} helperText={errors.password?.message} />
            )} />
            <Controller name="confirmPassword" control={control} render={({ field }) => (
              <TextField {...field} label="Confirmar contraseña" type="password" fullWidth sx={fieldSx}
                error={!!errors.confirmPassword} helperText={errors.confirmPassword?.message} />
            )} />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={isSubmitting}
              startIcon={!isSubmitting && <RocketLaunchIcon />}
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
              {isSubmitting ? <CircularProgress size={22} color="inherit" /> : 'Crear mi cuenta'}
            </Button>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,.10)', my: 3 }} />

          <Typography color="rgba(255,255,255,.62)" textAlign="center" variant="body2">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" style={{ color: '#c4b5fd', fontWeight: 700 }}>Inicia sesión</Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
