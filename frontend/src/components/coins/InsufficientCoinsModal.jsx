import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Typography,
} from '@mui/material'
import { CasinoRounded, WalletRounded } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

export default function InsufficientCoinsModal({ open, onClose, details = {} }) {
  const navigate = useNavigate()
  const required = details.required_coins ?? details.required ?? 0
  const current = details.current_balance ?? details.balance ?? 0
  const missing = details.missing_coins ?? Math.max(0, required - current)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>No tienes monedas suficientes</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Puedes recargar tu wallet con Stripe o intentar conseguir monedas con la ruleta diaria.
        </Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
          <Stack spacing={1}>
            <Typography>Coste: <strong>{required}</strong> monedas</Typography>
            <Typography>Saldo actual: <strong>{current}</strong> monedas</Typography>
            <Typography>Te faltan: <strong>{missing}</strong> monedas</Typography>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button startIcon={<CasinoRounded />} onClick={() => navigate('/wheel')} variant="outlined">
          Ruleta
        </Button>
        <Button startIcon={<WalletRounded />} onClick={() => navigate('/coins/buy')} variant="contained">
          Recargar wallet
        </Button>
      </DialogActions>
    </Dialog>
  )
}
