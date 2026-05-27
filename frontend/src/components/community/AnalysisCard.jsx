import { Box, Typography, Chip, IconButton, Avatar } from '@mui/material'
import { Favorite, FavoriteBorder, Comment, Visibility } from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { likeAnalysis } from '@/store/slices/communitySlice'
import { formatRelativeDate } from '@/utils/formatters'
import { MODEL_LABELS, MODEL_COLORS } from '@/utils/constants'

export default function AnalysisCard({ analysis }) {
  const dispatch = useDispatch()

  return (
    <Box sx={{
      bgcolor: 'background.paper', borderRadius: 2, p: 2.5,
      border: '1px solid', borderColor: 'divider', cursor: 'pointer',
      '&:hover': { border: '1px solid #2196f3', transform: 'translateY(-1px)' },
      transition: 'all 0.2s',
    }}
    component={Link}
    to={`/community/${analysis.id}`}
    style={{ textDecoration: 'none', display: 'block' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: '#2196f3' }}>
          {analysis.user?.username?.[0]?.toUpperCase()}
        </Avatar>
        <Typography variant="caption" color="#888">@{analysis.user?.username}</Typography>
        <Chip label={analysis.ticker} size="small"
          sx={{ ml: 'auto', bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700, fontSize: 11 }} />
      </Box>

      <Typography variant="subtitle2" fontWeight={700} color="#fff" mb={0.5} noWrap>
        {analysis.title}
      </Typography>

      {analysis.description && (
        <Typography variant="body2" color="#888" mb={1.5}
          sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {analysis.description}
        </Typography>
      )}

      {/* Models */}
      {analysis.models_compared?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
          {analysis.models_compared.map(m => (
            <Chip key={m} label={MODEL_LABELS[m] || m} size="small"
              sx={{ fontSize: 10, bgcolor: `${MODEL_COLORS[m]}22`, color: MODEL_COLORS[m] }} />
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Favorite sx={{ fontSize: 16, color: '#f44336' }} />
          <Typography variant="caption" color="#888">{analysis.likes_count}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Comment sx={{ fontSize: 16, color: '#888' }} />
          <Typography variant="caption" color="#888">{analysis.comments_count}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Visibility sx={{ fontSize: 16, color: '#888' }} />
          <Typography variant="caption" color="#888">{analysis.views_count}</Typography>
        </Box>
        <Typography variant="caption" color="#555" sx={{ ml: 'auto' }}>
          {formatRelativeDate(analysis.created_at)}
        </Typography>
      </Box>
    </Box>
  )
}
