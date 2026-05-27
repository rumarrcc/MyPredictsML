import { useState } from 'react'
import { Box, Typography, TextField, Button, Avatar, Divider } from '@mui/material'
import { useDispatch } from 'react-redux'
import { addComment } from '@/store/slices/communitySlice'
import { useAuth } from '@/hooks/useAuth'
import { formatRelativeDate } from '@/utils/formatters'
import { toast } from 'react-toastify'

export default function CommentSection({ analysisId, comments = [] }) {
  const dispatch         = useDispatch()
  const { isAuthenticated } = useAuth()
  const [text, setText]  = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      await dispatch(addComment({ id: analysisId, comment: text.trim() })).unwrap()
      setText('')
    } catch (err) {
      toast.error(err || 'Error al comentar')
    } finally { setLoading(false) }
  }

  return (
    <Box>
      <Typography variant="subtitle2" color="#aaa" mb={2}>
        Comentarios ({comments.length})
      </Typography>

      {isAuthenticated && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            multiline rows={2} fullWidth size="small"
            placeholder="Añade un comentario…"
            value={text} onChange={e => setText(e.target.value)}
            inputProps={{ maxLength: 2000 }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'background.paper' } }}
          />
          <Button variant="contained" onClick={handleSubmit} disabled={loading || !text.trim()}
            sx={{ alignSelf: 'flex-end', minWidth: 90 }}>
            Enviar
          </Button>
        </Box>
      )}

      {comments.length === 0 && (
        <Typography variant="body2" color="#555" textAlign="center" py={3}>
          Sin comentarios aún. ¡Sé el primero!
        </Typography>
      )}

      {comments.map((c, i) => (
        <Box key={c.id || i}>
          <Box sx={{ display: 'flex', gap: 1.5, py: 1.5 }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 12, bgcolor: '#2196f3', flexShrink: 0 }}>
              {c.user?.username?.[0]?.toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={600} color="#ccc">@{c.user?.username}</Typography>
                <Typography variant="caption" color="#555">{formatRelativeDate(c.created_at)}</Typography>
              </Box>
              <Typography variant="body2" color="#bbb">{c.comment}</Typography>
            </Box>
          </Box>
          {i < comments.length - 1 && <Divider sx={{ borderColor: 'divider' }} />}
        </Box>
      ))}
    </Box>
  )
}
