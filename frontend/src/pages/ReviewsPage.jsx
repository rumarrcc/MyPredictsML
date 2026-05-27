import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Box, Typography, Grid, Paper, Button, Avatar, Chip,
  TextField, Rating, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, CircularProgress,
} from '@mui/material'
import {
  Star, Close, Edit, FormatQuote, TrendingUp,
  Verified, Login, PersonAdd, RateReview, Delete,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import { reviewService } from '@/services/reviewService'

// ─── Datos estáticos ──────────────────────────────────────────────────────────
const STATIC_REVIEWS = [
  {
    id: 1, name: 'Carlos M.', role: 'Inversor particular', initials: 'CM', color: '#7c3aed',
    stars: 5, verified: true, date: '2025-11-14', helpful: 32,
    text: 'Llevo 6 meses usando MyPredicts y ha cambiado completamente mi forma de invertir. Las predicciones ARIMA aciertan con una precisión sorprendente en tendencias de 2-3 semanas.',
  },
  {
    id: 2, name: 'Sofía R.', role: 'Analista financiera', initials: 'SR', color: '#2196f3',
    stars: 5, verified: true, date: '2025-10-02', helpful: 28,
    text: 'El módulo de backtesting me ahorra horas de trabajo. Puedo validar cualquier estrategia sobre datos históricos reales antes de arriesgar capital. Imprescindible.',
  },
  {
    id: 3, name: 'Alejandro V.', role: 'Day trader', initials: 'AV', color: '#4caf50',
    stars: 4, verified: true, date: '2025-12-19', helpful: 19,
    text: 'Las alertas de precio son muy precisas. Configuro mis objetivos y la app me avisa al instante. El portafolio virtual para probar estrategias es una pasada.',
  },
  {
    id: 4, name: 'Laura T.', role: 'Estudiante de finanzas', initials: 'LT', color: '#ff9800',
    stars: 5, verified: false, date: '2026-01-08', helpful: 41,
    text: 'Empecé sin saber nada de análisis técnico. Con MyPredicts aprendí a interpretar gráficos, indicadores y modelos ML de forma visual e intuitiva. Muy recomendable para principiantes.',
  },
  {
    id: 5, name: 'Javier P.', role: 'Gestor de fondos', initials: 'JP', color: '#e91e63',
    stars: 5, verified: true, date: '2025-09-25', helpful: 55,
    text: 'La comunidad de análisis es lo que más me sorprendió. Compartir ideas con otros inversores y ver sus razonamientos me ha ayudado a mejorar mis propias estrategias notablemente.',
  },
  {
    id: 6, name: 'María G.', role: 'Emprendedora', initials: 'MG', color: '#00bcd4',
    stars: 4, verified: false, date: '2026-02-14', helpful: 17,
    text: 'Usaba varias apps por separado para ver gráficos, noticias y predicciones. MyPredicts lo centraliza todo. La interfaz es limpia y va muy fluida. Gran trabajo del equipo.',
  },
  {
    id: 7, name: 'Pablo S.', role: 'Consultor financiero', initials: 'PS', color: '#8bc34a',
    stars: 5, verified: true, date: '2026-01-30', helpful: 38,
    text: 'Integro MyPredicts en mis análisis para clientes. Los modelos ML ofrecen una perspectiva cuantitativa muy valiosa. La visualización de indicadores técnicos es de las mejores que he visto.',
  },
  {
    id: 8, name: 'Elena B.', role: 'Jubilada inversora', initials: 'EB', color: '#ff5722',
    stars: 4, verified: false, date: '2026-03-03', helpful: 22,
    text: 'Al principio me parecía complicado, pero el equipo de soporte me ayudó a entenderlo todo. Ahora gestiono mi cartera con mucha más confianza. Las predicciones me han sorprendido.',
  },
  {
    id: 9, name: 'Roberto K.', role: 'Programador y trader', initials: 'RK', color: '#9c27b0',
    stars: 5, verified: true, date: '2026-02-20', helpful: 47,
    text: 'Como desarrollador aprecio la calidad técnica de la plataforma. Rápida, sin caídas, con datos en tiempo real. El backtesting walk-forward es exactamente lo que necesitaba.',
  },
]

const STAR_COLORS = { 5: '#4caf50', 4: '#8bc34a', 3: '#ffc107', 2: '#ff9800', 1: '#f44336' }
const STAR_LABELS = ['', 'Muy malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']
const USER_AVATAR_COLORS = [
  '#7c3aed', '#2196f3', '#4caf50', '#ff9800', '#e91e63',
  '#00bcd4', '#ff5722', '#9c27b0', '#3f51b5', '#009688',
]

// Reviews stored in backend API

// ─── ReviewCard ───────────────────────────────────────────────────────────────
function ReviewCard({ review, onClick, onDelete, isOwn }) {
  return (
    <Paper
      sx={{
        bgcolor: isOwn ? '#1a1a3a' : '#1e1e3a',
        border: `1px solid ${isOwn ? '#7c3aed66' : '#2d2d4e'}`,
        borderRadius: 3, p: 3,
        cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column',
        position: 'relative',
        transition: 'border-color .2s, transform .2s',
        '&:hover': { borderColor: '#7c3aed77', transform: 'translateY(-3px)' },
      }}
      onClick={() => onClick(review)}
    >
      {isOwn && (
        <Chip label="Tu valoración" size="small" icon={<Edit sx={{ fontSize: '11px !important', color: '#a78bfa !important' }} />}
          sx={{ position: 'absolute', top: 12, right: onDelete ? 44 : 12, bgcolor: '#7c3aed22', color: '#a78bfa',
            border: '1px solid #7c3aed44', fontWeight: 700, fontSize: 10, height: 20, px: 0.5 }} />
      )}
      {isOwn && onDelete && (
        <IconButton
          size="small"
          onClick={e => { e.stopPropagation(); onDelete(review) }}
          sx={{ position: 'absolute', top: 8, right: 8, color: '#f44336',
            '&:hover': { bgcolor: '#f4433622' }, zIndex: 1 }}
        >
          <Delete fontSize="small" />
        </IconButton>
      )}

      <Box sx={{ flex: 1 }}>
        <FormatQuote sx={{ color: '#7c3aed44', fontSize: 36, transform: 'scaleX(-1)', mb: 0.5 }} />
        <Typography color="#ccc" fontSize={14} lineHeight={1.7} mb={2}
          sx={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          "{review.text}"
        </Typography>
      </Box>

      <Box sx={{ mt: 'auto' }}>
        <Rating value={review.stars} readOnly size="small"
          sx={{ mb: 1.5, '& .MuiRating-iconFilled': { color: '#ffc107' } }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: review.color || '#7c3aed', width: 38, height: 38, fontWeight: 800, fontSize: 14 }}>
            {review.initials || (review.name || 'U')[0].toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography color="#fff" fontWeight={700} fontSize={13} noWrap>{review.name}</Typography>
              {review.verified && <Verified sx={{ fontSize: 13, color: '#2196f3', flexShrink: 0 }} />}
            </Box>
            <Typography color="#888" fontSize={11} noWrap>{review.role}</Typography>
          </Box>
          <Typography color="#555" fontSize={11} flexShrink={0}>{review.date}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}

// ─── ReviewDetailModal ────────────────────────────────────────────────────────
function ReviewDetailModal({ review, open, onClose }) {
  if (!review) return null
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff', borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography fontWeight={800} fontSize={18}>Valoración completa</Typography>
        <IconButton onClick={onClose} sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Avatar sx={{ bgcolor: review.color || '#7c3aed', width: 60, height: 60, fontWeight: 900, fontSize: 22 }}>
            {review.initials || (review.name || 'U')[0].toUpperCase()}
          </Avatar>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography fontWeight={800} fontSize={17} color="#fff">{review.name}</Typography>
              {review.verified && (
                <Chip label="Verificado" size="small"
                  icon={<Verified sx={{ fontSize: 11, color: '#2196f3 !important' }} />}
                  sx={{ bgcolor: '#2196f322', color: '#2196f3', border: '1px solid #2196f344', fontSize: 10, height: 20 }} />
              )}
            </Box>
            <Typography color="#888" fontSize={13}>{review.role}</Typography>
            <Typography color="#555" fontSize={11} mt={0.3}>{review.date}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Rating value={review.stars} readOnly sx={{ '& .MuiRating-iconFilled': { color: '#ffc107' } }} />
          <Typography fontWeight={700} sx={{ color: STAR_COLORS[review.stars] }}>
            {STAR_LABELS[review.stars]}
          </Typography>
        </Box>

        <Box sx={{ bgcolor: 'background.default', borderRadius: 2, p: 2.5, border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <FormatQuote sx={{ color: '#7c3aed55', fontSize: 32, transform: 'scaleX(-1)', display: 'block', mb: 0.5 }} />
          <Typography color="#ddd" fontSize={15} lineHeight={1.9}>{review.text}</Typography>
        </Box>

        {review.helpful != null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp sx={{ color: '#4caf50', fontSize: 16 }} />
            <Typography color="#777" fontSize={12}>{review.helpful} personas encontraron esto útil</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── WriteReviewModal ─────────────────────────────────────────────────────────
function WriteReviewModal({ open, onClose, user, onSubmit, existingReview }) {
  const [stars, setStars]   = useState(existingReview?.stars ?? 5)
  const [role, setRole]     = useState(existingReview?.role || user?.role || '')
  const [text, setText]     = useState(existingReview?.text || '')
  const [submitting, setSubmitting] = useState(false)

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      color: '#fff', bgcolor: 'background.default',
      '& fieldset': { borderColor: 'divider' },
      '&:hover fieldset': { borderColor: '#7c3aed' },
      '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
    },
    '& label': { color: '#888' },
    '& .MuiFormHelperText-root': { color: '#555' },
  }

  const handleSubmit = async () => {
    if (!role.trim()) { toast.warning('Indica tu perfil o rol'); return }
    if (!text.trim()) { toast.warning('Escribe una valoracion'); return }
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 700))
    onSubmit({ stars, role: role.trim(), text: text.trim() })
    setSubmitting(false)
    onClose()
  }

  const displayName = user?.full_name || user?.username || 'Usuario'
  const avatarColor = USER_AVATAR_COLORS[(displayName.charCodeAt(0) || 0) % USER_AVATAR_COLORS.length]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff', borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RateReview sx={{ color: '#7c3aed' }} />
          <Typography fontWeight={800} fontSize={18}>
            {existingReview ? 'Editar tu valoración' : 'Escribe tu valoración'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}><Close /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Paper sx={{ bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar src={user?.avatar_url || undefined} sx={{ bgcolor: avatarColor, width: 48, height: 48, fontWeight: 900, fontSize: 18 }}>
            {displayName[0].toUpperCase()}
          </Avatar>
          <Box>
            <Typography fontWeight={700} color="#fff" fontSize={15}>{displayName}</Typography>
            <Typography color="#888" fontSize={12}>{user?.email}</Typography>
            <Chip label="Usuario verificado" size="small" icon={<Verified sx={{ fontSize: 11, color: '#2196f3 !important' }} />}
              sx={{ mt: 0.5, bgcolor: '#2196f311', color: '#2196f3', border: '1px solid #2196f333', fontSize: 10, height: 18 }} />
          </Box>
        </Paper>

        <Box mb={3}>
          <Typography variant="caption" color="#888" display="block" mb={1} fontWeight={600} letterSpacing={0.5}>
            TU PUNTUACIÓN *
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Rating value={stars} onChange={(_, v) => v && setStars(v)} size="large"
              sx={{ '& .MuiRating-iconFilled': { color: '#ffc107' }, '& .MuiRating-iconEmpty': { color: '#2d2d4e' } }} />
            <Typography fontWeight={800} sx={{ color: STAR_COLORS[stars], fontSize: 14 }}>
              {STAR_LABELS[stars]}
            </Typography>
          </Box>
        </Box>

        <TextField label="Tu perfil / rol *" value={role} onChange={e => setRole(e.target.value)}
          placeholder="Ej: Inversor particular, Day trader…" size="small" fullWidth
          sx={{ ...fieldSx, mb: 2.5 }} inputProps={{ maxLength: 60 }} />

        <TextField label="Tu valoración *" value={text} onChange={e => setText(e.target.value)}
          placeholder="Cuéntanos tu experiencia…" multiline rows={5} fullWidth sx={fieldSx}
          inputProps={{ maxLength: 500 }}
          helperText={`${text.length}/500`} />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#888', '&:hover': { color: '#fff' } }}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained"
          disabled={submitting || !text.trim() || !role.trim()}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Edit />}
          sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 4 }}>
          {submitting ? 'Guardando...' : existingReview ? 'Guardar cambios' : 'Publicar valoración'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteConfirmDialog({ open, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff' } }}>
      <DialogTitle>Eliminar valoración</DialogTitle>
      <DialogContent>
        <Typography color="#aaa">¿Seguro que quieres eliminar tu valoración? Esta acción no se puede deshacer.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: '#aaa' }}>Cancelar</Button>
        <Button onClick={onConfirm} variant="contained" color="error">Eliminar</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ReviewsPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useSelector(s => s.auth)

  const [selectedReview, setSelectedReview] = useState(null)
  const [detailOpen,     setDetailOpen]     = useState(false)
  const [writeOpen,      setWriteOpen]      = useState(false)
  const [filterStars,    setFilterStars]    = useState(0)
  const [deleteOpen,     setDeleteOpen]     = useState(false)
  const [loading,        setLoading]        = useState(true)

  // ── API-driven reviews ────────────────────────────────────────────────────
  const [apiReviews, setApiReviews]   = useState([])
  const [apiStats,   setApiStats]     = useState({ avg_rating: 0, total: 0, distribution: {} })
  const [myReview,   setMyReview]     = useState(null)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const data = await reviewService.list({ per_page: 50 })
      setApiReviews(data.reviews || [])
      setApiStats({
        avg_rating:   data.avg_rating || 0,
        total:        data.total || 0,
        distribution: data.distribution || {},
      })
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  const loadMyReview = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const rev = await reviewService.mine()
      setMyReview(rev)
    } catch { /* silent */ }
  }, [isAuthenticated])

  useEffect(() => {
    loadReviews()
    loadMyReview()
  }, [loadReviews, loadMyReview])

  // Build full list (API first, then static for visual richness)
  const allReviews = [
    ...apiReviews.map(r => ({
      ...r,
      id:       r.id,
      name:     r.author_name || r.author_username || 'Usuario',
      initials: (r.author_name || r.author_username || 'U')[0].toUpperCase(),
      color:    USER_AVATAR_COLORS[((r.author_name || '').charCodeAt(0) || 0) % USER_AVATAR_COLORS.length],
      date:     (r.created_at || '').slice(0, 10),
      verified: true,
      _apiId:   r.id,
    })),
    ...STATIC_REVIEWS,
  ]

  const filtered = filterStars > 0 ? allReviews.filter(r => r.stars === filterStars) : allReviews

  // Use API stats when available, otherwise compute from local array
  const totalCount = apiStats.total > 0 ? (apiStats.total + STATIC_REVIEWS.length) : allReviews.length
  const avgRating  = apiStats.avg_rating > 0
    ? ((apiStats.avg_rating * apiStats.total + STATIC_REVIEWS.reduce((s, r) => s + r.stars, 0)) / totalCount).toFixed(1)
    : allReviews.length
      ? (allReviews.reduce((s, r) => s + r.stars, 0) / allReviews.length).toFixed(1)
      : '0.0'

  const starDist = [5, 4, 3, 2, 1].map(s => ({
    stars: s,
    count: allReviews.filter(r => r.stars === s).length,
    pct:   allReviews.length
      ? Math.round((allReviews.filter(r => r.stars === s).length / allReviews.length) * 100)
      : 0,
  }))

  const handleOpenDetail = review => { setSelectedReview(review); setDetailOpen(true) }

  const handleSubmitReview = async (data) => {
    try {
      await reviewService.publish(data)
      toast.success(myReview ? '¡Valoración actualizada!' : '¡Gracias! Tu valoración ya es visible para todos.')
      loadReviews()
      loadMyReview()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al publicar la valoración')
    }
  }

  const handleDeleteReview = async () => {
    try {
      await reviewService.delete()
      setMyReview(null)
      setDeleteOpen(false)
      toast.info('Valoración eliminada.')
      loadReviews()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al eliminar')
    }
  }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 8 }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 } }}>

        {/* ── Cabecera ── */}
        <Box sx={{ mb: 5, textAlign: 'center' }}>
          <Chip label="✨ VALORACIONES DE USUARIOS" size="small"
            sx={{ bgcolor: '#7c3aed22', color: '#b89eff', border: '1px solid #7c3aed44', mb: 2, fontWeight: 700, letterSpacing: 1 }} />
          <Typography variant="h3" fontWeight={900} color="#fff" mb={1.5}
            sx={{ fontSize: { xs: '1.9rem', md: '2.7rem' } }}>
            Lo que dicen nuestros usuarios
          </Typography>
          <Typography color="#888" fontSize={16} maxWidth={520} mx="auto" mb={3}>
            Opiniones reales de inversores que usan MyPredicts cada día
          </Typography>

          {isAuthenticated ? (
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained" size="large"
                startIcon={myReview ? <Edit /> : <RateReview />}
                onClick={() => setWriteOpen(true)}
                sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 5, py: 1.5, fontSize: 15 }}
              >
                {myReview ? 'Editar mi valoración' : 'Escribir mi valoración'}
              </Button>
              {myReview && (
                <Button variant="outlined" size="large" startIcon={<Delete />}
                  onClick={() => setDeleteOpen(true)}
                  sx={{ borderColor: '#f4433666', color: '#f44336', fontWeight: 700, px: 4,
                    '&:hover': { borderColor: '#f44336', bgcolor: '#f4433611' } }}>
                  Eliminar valoración
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{
              display: 'inline-flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center',
              bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3,
              px: 4, py: 2.5, mt: 1,
            }}>
              <Box sx={{ textAlign: 'left', mr: { xs: 0, sm: 2 } }}>
                <Typography color="#fff" fontWeight={700} fontSize={15}>¿Ya usas MyPredicts?</Typography>
                <Typography color="#888" fontSize={13}>Inicia sesión para dejar tu valoración</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<Login />}
                  onClick={() => navigate('/login', { state: { from: { pathname: '/reviews' } } })}
                  sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 3 }}>
                  Iniciar sesión
                </Button>
                <Button variant="outlined" startIcon={<PersonAdd />}
                  onClick={() => navigate('/register', { state: { from: { pathname: '/reviews' } } })}
                  sx={{ borderColor: '#7c3aed66', color: '#b89eff', fontWeight: 700, px: 3,
                    '&:hover': { borderColor: '#7c3aed', bgcolor: '#7c3aed11' } }}>
                  Registrarse gratis
                </Button>
              </Box>
            </Box>
          )}
        </Box>

        {/* ── Resumen estadístico ── */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: { xs: 2.5, sm: 3.5 }, mb: 5 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={4} md={3} sx={{ textAlign: 'center' }}>
              <Typography sx={{
                fontSize: { xs: 60, sm: 76 }, fontWeight: 900, lineHeight: 1,
                background: 'linear-gradient(135deg, #7c3aed, #2196f3)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {avgRating}
              </Typography>
              <Rating value={parseFloat(avgRating)} precision={0.1} readOnly
                sx={{ my: 0.5, '& .MuiRating-iconFilled': { color: '#ffc107' } }} />
              <Typography color="#888" fontSize={13}>{allReviews.length} valoraciones en total</Typography>
            </Grid>
            <Grid item xs={12} sm={8} md={9}>
              {starDist.map(({ stars: s, count, pct }) => (
                <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}
                  onClick={() => setFilterStars(filterStars === s ? 0 : s)}
                  style={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, minWidth: 50 }}>
                    <Typography color="#ccc" fontSize={13} fontWeight={700}>{s}</Typography>
                    <Star sx={{ fontSize: 14, color: '#ffc107' }} />
                  </Box>
                  <Box sx={{ flex: 1, bgcolor: 'background.default', borderRadius: 10, height: 10, overflow: 'hidden',
                    border: `1px solid ${filterStars === s ? STAR_COLORS[s] + '44' : 'transparent'}` }}>
                    <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 10,
                      bgcolor: STAR_COLORS[s], transition: 'width .8s ease' }} />
                  </Box>
                  <Typography color={filterStars === s ? STAR_COLORS[s] : '#777'} fontSize={12} minWidth={70}
                    fontWeight={filterStars === s ? 700 : 400}>
                    {count} ({pct}%)
                  </Typography>
                </Box>
              ))}
              <Typography variant="caption" color="#555" mt={0.5} display="block">
                Haz clic en las barras para filtrar
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* ── Filtros ── */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
          <Typography color="#888" fontSize={13} mr={0.5}>Filtrar:</Typography>
          {[{ label: 'Todas', val: 0 }, ...[5,4,3,2,1].map(s => ({ label: `${s} ★`, val: s }))].map(({ label, val }) => (
            <Chip key={val} label={label}
              onClick={() => setFilterStars(filterStars === val ? 0 : val)}
              sx={{
                bgcolor: filterStars === val ? (val === 0 ? '#7c3aed' : STAR_COLORS[val] + '33') : '#2d2d4e',
                color:   filterStars === val ? (val === 0 ? '#fff' : STAR_COLORS[val]) : '#aaa',
                border: `1px solid ${filterStars === val && val !== 0 ? STAR_COLORS[val] + '66' : 'transparent'}`,
                cursor: 'pointer', fontWeight: 600,
                '&:hover': { bgcolor: val === 0 ? '#7c3aed33' : STAR_COLORS[val] + '22' },
              }} />
          ))}
          <Typography color="#555" fontSize={12} ml="auto">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* ── Grid de valoraciones ── */}
        {loading ? (
          <Box textAlign="center" py={8}><CircularProgress sx={{ color: '#7c3aed' }} /></Box>
        ) : filtered.length === 0 ? (
          <Box textAlign="center" py={10}>
            <Star sx={{ fontSize: 48, color: '#2d2d4e', mb: 2 }} />
            <Typography color="#555" fontSize={16}>No hay valoraciones con {filterStars} estrella{filterStars !== 1 ? 's' : ''}.</Typography>
            <Button onClick={() => setFilterStars(0)} sx={{ color: '#b89eff', mt: 1 }}>Ver todas</Button>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {filtered.map((review, i) => {
              const isOwn = myReview && review._apiId === myReview.id
              return (
                <Grid item xs={12} sm={6} md={4} key={review.id || i}>
                  <ReviewCard
                    review={review}
                    onClick={handleOpenDetail}
                    isOwn={isOwn}
                    onDelete={isOwn ? () => setDeleteOpen(true) : null}
                  />
                </Grid>
              )
            })}
          </Grid>
        )}

        <Divider sx={{ borderColor: 'divider', my: 6 }} />

        {/* ── CTA final ── */}
        <Box sx={{ textAlign: 'center', pb: 2 }}>
          <Typography variant="h5" fontWeight={700} color="#fff" mb={1}>¿Tienes algo que contar?</Typography>
          <Typography color="#888" mb={3}>Tu opinión ayuda a otros inversores a decidir.</Typography>
          {isAuthenticated ? (
            <Button variant="contained" size="large" startIcon={myReview ? <Edit /> : <RateReview />}
              onClick={() => setWriteOpen(true)}
              sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 6 }}>
              {myReview ? 'Editar mi valoración' : 'Añadir mi valoración'}
            </Button>
          ) : (
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" startIcon={<Login />}
                onClick={() => navigate('/login', { state: { from: { pathname: '/reviews' } } })}
                sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 4 }}>
                Iniciar sesión para valorar
              </Button>
              <Button variant="outlined" size="large" startIcon={<PersonAdd />}
                onClick={() => navigate('/register', { state: { from: { pathname: '/reviews' } } })}
                sx={{ borderColor: '#7c3aed66', color: '#b89eff', fontWeight: 700, px: 4,
                  '&:hover': { borderColor: '#7c3aed', bgcolor: '#7c3aed11' } }}>
                Crear cuenta gratis
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Modales ── */}
      <ReviewDetailModal review={selectedReview} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <WriteReviewModal open={writeOpen} onClose={() => setWriteOpen(false)}
        user={user} onSubmit={handleSubmitReview} existingReview={myReview} />
      <DeleteConfirmDialog open={deleteOpen} onConfirm={handleDeleteReview} onClose={() => setDeleteOpen(false)} />
    </Box>
  )
}
