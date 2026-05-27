import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Chip, Slider, TextField,
  InputAdornment, CircularProgress, Divider, Paper,
} from '@mui/material'
import { TrendingUp, AttachMoney, CalendarToday, Search } from '@mui/icons-material'
import { useDispatch } from 'react-redux'
import { addPosition, fetchPortfolio } from '@/store/slices/portfolioSlice'
import { stockService } from '@/services/stockService'
import { toast } from 'react-toastify'
import { format } from 'date-fns'

const POPULAR = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'NFLX']

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff', bgcolor: 'background.default',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: '#7c3aed' },
    '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
  },
  '& label': { color: '#888' },
  '& .MuiFormHelperText-root': { color: '#f44336' },
}

export default function AddPositionModal({ open, onClose, portfolioId }) {
  const dispatch = useDispatch()

  const [ticker,     setTicker]     = useState('')
  const [tickerInput, setTickerInput] = useState('')
  const [quantity,   setQuantity]   = useState(10)
  const [buyPrice,   setBuyPrice]   = useState('')
  const [buyDate,    setBuyDate]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [errors,       setErrors]       = useState({})

  // Auto-fetch price cuando se selecciona un ticker
  useEffect(() => {
    if (!ticker) return
    setLoadingPrice(true)
    stockService.getStock(ticker, 5)
      .then(res => {
        if (res?.last_price) setBuyPrice(Number(res.last_price).toFixed(2))
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false))
  }, [ticker])

  const selectTicker = (t) => {
    setTicker(t.toUpperCase())
    setTickerInput(t.toUpperCase())
    setErrors(e => ({ ...e, ticker: '' }))
  }

  const handleTickerSearch = () => {
    const t = tickerInput.trim().toUpperCase()
    if (t.length >= 1 && t.length <= 10) selectTicker(t)
  }

  const validate = () => {
    const e = {}
    if (!ticker)                  e.ticker   = 'Selecciona o escribe un ticker'
    if (!quantity || quantity < 0.001) e.quantity = 'La cantidad debe ser mayor que 0'
    if (!buyPrice || parseFloat(buyPrice) <= 0) e.buyPrice = 'El precio debe ser mayor que 0'
    if (!buyDate)                 e.buyDate  = 'Fecha requerida'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await dispatch(addPosition({
        portfolioId,
        data: {
          ticker,
          quantity: Number(quantity),
          buy_price: parseFloat(buyPrice),
          buy_date: buyDate,   // siempre string "YYYY-MM-DD"
        },
      })).unwrap()
      dispatch(fetchPortfolio(portfolioId))
      toast.success(`✅ ${quantity} × ${ticker} añadido a tu cartera`)
      handleReset()
      onClose()
    } catch (err) {
      toast.error(err || 'Error al añadir posición')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setTicker(''); setTickerInput(''); setQuantity(10)
    setBuyPrice(''); setBuyDate(format(new Date(), 'yyyy-MM-dd'))
    setErrors({})
  }

  const totalInvestment = quantity && buyPrice ? (Number(quantity) * parseFloat(buyPrice)) : 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#fff', borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}>

      <DialogTitle sx={{ pb: 1, fontWeight: 800, fontSize: 20 }}>
        Añadir posición
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>

        {/* ── Selector de ticker ── */}
        <Box mb={3}>
          <Typography variant="caption" color="#888" mb={1} display="block" fontWeight={600}>
            SELECCIONA UNA EMPRESA
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 1.5 }}>
            {POPULAR.map(t => (
              <Chip key={t} label={t} onClick={() => selectTicker(t)}
                sx={{
                  bgcolor: ticker === t ? '#7c3aed' : '#2d2d4e',
                  color: ticker === t ? '#fff' : '#aaa',
                  fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${ticker === t ? '#7c3aed' : 'transparent'}`,
                  '&:hover': { bgcolor: ticker === t ? '#7c3aed' : '#3d3d5e' },
                  transition: 'all .15s',
                }} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleTickerSearch()}
              placeholder="Otro ticker (ej: AMD, INTC...)"
              size="small" fullWidth sx={fieldSx}
              error={!!errors.ticker}
              helperText={errors.ticker}
              InputProps={{
                endAdornment: loadingPrice
                  ? <CircularProgress size={14} sx={{ color: '#7c3aed' }} />
                  : null,
              }}
            />
            <Button onClick={handleTickerSearch} variant="outlined" size="small"
              sx={{ borderColor: 'divider', color: '#aaa', minWidth: 44, px: 1.5, '&:hover': { borderColor: '#7c3aed', color: '#fff' } }}>
              <Search fontSize="small" />
            </Button>
          </Box>
          {ticker && (
            <Chip label={`Analizando: ${ticker}`} size="small"
              sx={{ mt: 1, bgcolor: '#7c3aed22', color: '#b89eff', border: '1px solid #7c3aed44' }} />
          )}
        </Box>

        <Divider sx={{ borderColor: 'divider', mb: 3 }} />

        {/* ── Cantidad con slider ── */}
        <Box mb={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="#888" fontWeight={600}>CANTIDAD DE ACCIONES</Typography>
            <TextField
              value={quantity}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0
                setQuantity(Math.max(0.001, v))
              }}
              size="small" type="number"
              sx={{ width: 110, ...fieldSx }}
              inputProps={{ min: 0.001, step: 1 }}
              error={!!errors.quantity}
            />
          </Box>
          <Slider
            value={Math.min(quantity, 500)}
            onChange={(_, v) => setQuantity(v)}
            min={1} max={500} step={1}
            marks={[
              { value: 1,   label: '1'   },
              { value: 50,  label: '50'  },
              { value: 100, label: '100' },
              { value: 250, label: '250' },
              { value: 500, label: '500' },
            ]}
            sx={{
              color: '#7c3aed',
              '& .MuiSlider-markLabel': { color: '#555', fontSize: 11 },
              '& .MuiSlider-thumb': { bgcolor: '#7c3aed', border: '2px solid #fff' },
              '& .MuiSlider-track': { bgcolor: '#7c3aed' },
              '& .MuiSlider-rail':  { bgcolor: '#2d2d4e' },
            }}
          />
          {errors.quantity && <Typography variant="caption" color="error">{errors.quantity}</Typography>}
        </Box>

        {/* ── Precio y fecha en fila ── */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Box flex={1}>
            <Typography variant="caption" color="#888" mb={1} display="block" fontWeight={600}>
              PRECIO DE COMPRA (USD)
            </Typography>
            <TextField
              value={buyPrice}
              onChange={e => setBuyPrice(e.target.value)}
              placeholder={loadingPrice ? 'Cargando...' : '0.00'}
              type="number" size="small" fullWidth sx={fieldSx}
              error={!!errors.buyPrice} helperText={errors.buyPrice}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AttachMoney sx={{ color: '#888', fontSize: 18 }} /></InputAdornment>,
                endAdornment: loadingPrice ? <CircularProgress size={14} sx={{ color: '#7c3aed' }} /> : null,
              }}
            />
            <Typography variant="caption" color="#555" mt={0.5} display="block">
              {ticker ? 'Auto-rellenado con precio actual' : 'Selecciona un ticker primero'}
            </Typography>
          </Box>
          <Box flex={1}>
            <Typography variant="caption" color="#888" mb={1} display="block" fontWeight={600}>
              FECHA DE COMPRA
            </Typography>
            <TextField
              value={buyDate}
              onChange={e => setBuyDate(e.target.value)}
              type="date" size="small" fullWidth sx={{
                ...fieldSx,
                '& input[type="date"]::-webkit-calendar-picker-indicator': { filter: 'invert(0.5)', cursor: 'pointer' },
              }}
              InputLabelProps={{ shrink: true }}
              error={!!errors.buyDate} helperText={errors.buyDate}
              InputProps={{
                startAdornment: <InputAdornment position="start"><CalendarToday sx={{ color: '#888', fontSize: 16 }} /></InputAdornment>,
              }}
            />
          </Box>
        </Box>

        {/* ── Resumen de inversión ── */}
        {totalInvestment > 0 && (
          <Paper sx={{ bgcolor: 'background.default', border: '1px solid #7c3aed44', borderRadius: 2, p: 2 }}>
            <Typography variant="caption" color="#888" display="block" mb={1} fontWeight={600}>RESUMEN DE LA OPERACIÓN</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography color="#ccc" fontSize={13}>
                  {quantity} × {ticker || '?'} @ ${parseFloat(buyPrice || 0).toFixed(2)}
                </Typography>
                <Typography color="#888" fontSize={11}>{buyDate}</Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="h6" fontWeight={800} sx={{ color: '#b89eff' }}>
                  ${totalInvestment.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
                <Typography variant="caption" color="#555">inversión total</Typography>
              </Box>
            </Box>
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={() => { handleReset(); onClose() }}
          sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <TrendingUp />}
          sx={{ background: 'linear-gradient(135deg, #7c3aed, #2196f3)', fontWeight: 700, px: 3 }}>
          {submitting ? 'Añadiendo...' : 'Añadir posición'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
