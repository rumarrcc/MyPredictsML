import { Box, Typography, Chip, Stack } from '@mui/material'

export default function TechnicalSummary({ consensus, disclaimer }) {
  if (!consensus) return null
  return (
    <Box sx={{ bgcolor: '#12121f', borderRadius: 2, p: 2, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle2" color="#aaa" mb={1}>Consenso de modelos</Typography>
      <Typography variant="h5" fontWeight={700} color="#2196f3" mb={0.5}>
        ${consensus.average_prediction?.toFixed(2) ?? '—'}
      </Typography>
      {consensus.std_dev != null && (
        <Typography variant="caption" color="#666">
          Desv. estándar: ±${consensus.std_dev?.toFixed(2)} · Modelos: {consensus.models_agree}/3
        </Typography>
      )}
      {disclaimer && (
        <Box sx={{ mt: 1.5, p: 1, bgcolor: '#2d1a00', borderRadius: 1 }}>
          <Typography variant="caption" color="#ffb74d">{disclaimer}</Typography>
        </Box>
      )}
    </Box>
  )
}
