import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box, Typography, Paper, Chip, Button, CircularProgress,
  Avatar, Divider, IconButton, Tooltip
} from '@mui/material'
import { ArrowBack, Favorite, FavoriteBorder, Visibility, Comment, Share } from '@mui/icons-material'
import { fetchAnalysis, likeAnalysis } from '@/store/slices/communitySlice'
import CommentSection from '@/components/community/CommentSection'
import PredictionCard from '@/components/analysis/PredictionCard'
import { formatDate, formatRelativeDate } from '@/utils/formatters'
import { toast } from 'react-toastify'

export default function AnalysisDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { currentAnalysis: analysis, isLoading: loading } = useSelector(s => s.community)
  const { user, isAuthenticated } = useSelector(s => s.auth)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    if (id) dispatch(fetchAnalysis(id))
  }, [id])

  useEffect(() => {
    if (analysis && user) {
      setLiked(analysis.user_liked || false)
    }
  }, [analysis, user])

  const handleLike = async () => {
    if (!isAuthenticated) { toast.info('Inicia sesión para dar like'); return }
    try {
      await dispatch(likeAnalysis(id)).unwrap()
      setLiked(l => !l)
    } catch { toast.error('Error') }
  }

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href)
    toast.success('Enlace copiado')
  }

  if (loading) {
    return (
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!analysis) {
    return (
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, px: 4 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/community')} sx={{ color: '#aaa', mb: 3 }}>
          Volver
        </Button>
        <Typography color="#555" textAlign="center" mt={8}>Análisis no encontrado.</Typography>
      </Box>
    )
  }

  const predictions = analysis.prediction_data?.predictions || []

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 8, px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>

        {/* Back */}
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/community')}
          sx={{ color: '#888', mb: 3, '&:hover': { color: '#fff' } }}>
          Volver a la comunidad
        </Button>

        {/* Header */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Chip label={analysis.ticker} sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 800, fontSize: 16, height: 32 }} />
              <Box>
                <Typography variant="h5" fontWeight={700} color="#fff">{analysis.title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Avatar sx={{ width: 22, height: 22, fontSize: 12, bgcolor: '#7c3aed' }}>
                    {analysis.author?.username?.[0]?.toUpperCase() || 'U'}
                  </Avatar>
                  <Typography variant="caption" color="#888">{analysis.author?.username}</Typography>
                  <Typography variant="caption" color="#555">·</Typography>
                  <Tooltip title={formatDate(analysis.created_at)}>
                    <Typography variant="caption" color="#555">{formatRelativeDate(analysis.created_at)}</Typography>
                  </Tooltip>
                </Box>
              </Box>
            </Box>

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#555' }}>
                <Visibility fontSize="small" />
                <Typography variant="caption">{analysis.views_count || 0}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={handleLike}
                  sx={{ color: liked ? '#f44336' : '#555' }}>
                  {liked ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
                </IconButton>
                <Typography variant="caption" color="#888">{analysis.likes_count || 0}</Typography>
              </Box>
              <IconButton size="small" onClick={handleShare} sx={{ color: '#888' }}>
                <Share fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Models chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {(analysis.models_used || []).map(m => (
              <Chip key={m} label={m.toUpperCase()} size="small"
                sx={{ bgcolor: '#7c3aed22', color: '#b89eff', fontSize: 11 }} />
            ))}
            {analysis.horizon && (
              <Chip label={`${analysis.horizon}d`} size="small"
                sx={{ bgcolor: '#2196f322', color: '#64b5f6', fontSize: 11 }} />
            )}
          </Box>

          {/* Description */}
          {analysis.description && (
            <Typography color="#ccc" sx={{ lineHeight: 1.7 }}>{analysis.description}</Typography>
          )}
        </Paper>

        {/* Prediction cards */}
        {predictions.length > 0 && (
          <Box mb={3}>
            <Typography fontWeight={700} color="#fff" mb={2}>Predicciones</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
              {predictions.map(pred => (
                <PredictionCard key={pred.model || pred.id} prediction={pred} readOnly />
              ))}
            </Box>
          </Box>
        )}

        <Divider sx={{ borderColor: 'divider', mb: 3 }} />

        {/* Comments */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
            <Comment sx={{ color: '#888', fontSize: 20 }} />
            <Typography fontWeight={700} color="#fff">
              Comentarios ({analysis.comments_count || analysis.comments?.length || 0})
            </Typography>
          </Box>
          <CommentSection analysisId={id} comments={analysis.comments || []} />
        </Paper>
      </Box>
    </Box>
  )
}
