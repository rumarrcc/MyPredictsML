import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Chip,
} from '@mui/material'
import { useDispatch } from 'react-redux'
import { shareAnalysis } from '@/store/slices/communitySlice'
import { toast } from 'react-toastify'
import { MODEL_LABELS } from '@/utils/constants'

export default function ShareAnalysisModal({ open, onClose, ticker, predictionData, backtestId }) {
  const dispatch = useDispatch()
  const [title,   setTitle]   = useState(`${ticker}: Análisis ${new Date().toLocaleDateString('es')}`)
  const [desc,    setDesc]    = useState('')
  const [loading, setLoading] = useState(false)

  const models = predictionData?.models?.map(m => m.name) || []

  const handleShare = async () => {
    if (!title.trim()) { toast.error('El título es obligatorio'); return }
    setLoading(true)
    try {
      await dispatch(shareAnalysis({
        ticker,
        title:            title.trim(),
        description:      desc.trim(),
        models_compared:  models,
        prediction_summary: predictionData?.consensus
          ? { consensus: predictionData.consensus.average_prediction, range_low: null, range_high: null }
          : null,
        backtest_id: backtestId || null,
      })).unwrap()
      toast.success('¡Análisis compartido exitosamente!')
      onClose()
    } catch (err) {
      toast.error(err || 'Error al compartir')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff' } }}>
      <DialogTitle>Compartir análisis: {ticker}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <TextField
          label="Título" value={title} onChange={e => setTitle(e.target.value)}
          fullWidth variant="outlined" size="small"
          inputProps={{ maxLength: 200 }}
          sx={{ '& .MuiOutlinedInput-root': { color: '#fff' }, '& label': { color: '#888' } }}
        />
        <TextField
          label="Descripción / análisis" value={desc} onChange={e => setDesc(e.target.value)}
          fullWidth multiline rows={4} variant="outlined" size="small"
          sx={{ '& .MuiOutlinedInput-root': { color: '#fff' }, '& label': { color: '#888' } }}
        />
        {models.length > 0 && (
          <Box>
            <Typography variant="caption" color="#888">Modelos comparados:</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              {models.map(m => <Chip key={m} label={MODEL_LABELS[m]} size="small" sx={{ bgcolor: '#2d2d4e', color: '#aaa' }} />)}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#aaa' }}>Cancelar</Button>
        <Button onClick={handleShare} variant="contained" disabled={loading}>
          {loading ? 'Compartiendo…' : 'Publicar análisis'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
