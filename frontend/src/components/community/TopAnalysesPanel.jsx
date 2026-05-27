import { Box, Typography, Chip } from '@mui/material'
import { Link } from 'react-router-dom'
import { Favorite } from '@mui/icons-material'

export default function TopAnalysesPanel({ analyses }) {
  const list = Array.isArray(analyses) ? analyses : (analyses?.analyses || [])
  return (
    <Box>
      <Typography variant="subtitle2" color="#888" mb={1.5}>Top esta semana</Typography>
      {list.slice(0, 5).map((a, i) => (
        <Box key={a.id} component={Link} to={`/community/${a.id}`}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, py: 1,
            borderBottom: '1px solid #2d2d4e', textDecoration: 'none',
            '&:hover': { opacity: 0.8 },
          }}>
          <Typography variant="h6" sx={{ color: i < 3 ? '#ff9800' : '#555', fontWeight: 700, width: 24 }}>
            {i + 1}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="#ccc" noWrap>{a.title}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip label={a.ticker} size="small" sx={{ bgcolor: '#2196f322', color: '#2196f3', fontSize: 10 }} />
              <Typography variant="caption" color="#555">@{a.user?.username}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Favorite sx={{ fontSize: 14, color: '#f44336' }} />
            <Typography variant="caption" color="#888">{a.likes_count}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
