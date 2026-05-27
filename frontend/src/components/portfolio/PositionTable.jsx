import { useEffect, useMemo, useState } from 'react'
import {
  Box, Typography, Chip, IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, CircularProgress, Divider,
} from '@mui/material'
import { Delete, Refresh, Visibility, Sell } from '@mui/icons-material'
import { useDispatch } from 'react-redux'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchPortfolio, sellPosition } from '@/store/slices/portfolioSlice'
import { portfolioService } from '@/services/portfolioService'
import { stockService } from '@/services/stockService'
import { formatCurrency, formatPercent, getPnlColor } from '@/utils/formatters'
import { toast } from 'react-toastify'

export default function PositionTable({ positions = [], portfolioId, onSold, isInvestments = false }) {
  const dispatch = useDispatch()
  const [selected, setSelected] = useState(null)
  const [liveData, setLiveData] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  const loadLiveData = async (pos = selected) => {
    if (!pos?.ticker) return
    setLiveLoading(true)
    setLiveError('')
    try {
      const data = await stockService.getStock(pos.ticker, 90)
      setLiveData(data)
    } catch (err) {
      setLiveError(err?.response?.data?.message || 'No se pudo cargar la cotizacion en directo.')
    } finally {
      setLiveLoading(false)
    }
  }

  useEffect(() => {
    if (!selected) {
      setLiveData(null)
      setLiveError('')
      return
    }
    loadLiveData(selected)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const livePosition = useMemo(() => {
    if (!selected) return null
    const currentPrice = Number(liveData?.last_price ?? selected.current_price ?? selected.buy_price ?? 0)
    const quantity = Number(selected.quantity || 0)
    const buyPrice = Number(selected.buy_price || 0)
    const invested = quantity * buyPrice
    const currentValue = quantity * currentPrice
    const pnl = currentValue - invested
    const pnlPercent = invested ? pnl / invested : 0
    return { currentPrice, invested, currentValue, pnl, pnlPercent }
  }, [selected, liveData])

  const chartData = useMemo(() => {
    const rows = liveData?.data || []
    return rows.map(row => ({
      date: row.date?.slice(5) || row.date,
      price: Number(row.close || 0),
    })).filter(row => row.price > 0)
  }, [liveData])

  const handleDelete = async (positionId) => {
    if (!confirm('Eliminar esta posicion?')) return
    try {
      await portfolioService.deletePosition(portfolioId, positionId)
      dispatch(fetchPortfolio(portfolioId))
      toast.success('Posicion eliminada')
    } catch { toast.error('Error al eliminar') }
  }

  const handleSell = async (pos) => {
    if (!pos) return
    const pnl = Number(livePosition?.pnl ?? pos.gain_loss ?? 0)
    const returnsToWallet = isInvestments && pos.source_type !== 'prediction'
    const msg = returnsToWallet
      ? `Vender ${pos.quantity} ${pos.ticker}? Resultado actual: ${formatCurrency(pnl)}. El capital vuelve a tu wallet.`
      : `Cerrar ${pos.quantity} ${pos.ticker}? Resultado virtual actual: ${formatCurrency(pnl)}.`
    if (!confirm(msg)) return
    try {
      await dispatch(sellPosition({ portfolioId, positionId: pos.id })).unwrap()
      setSelected(null)
      onSold?.()
      toast.success(returnsToWallet ? 'Posicion vendida y saldo devuelto a tu wallet' : 'Posicion virtual cerrada')
    } catch (err) {
      toast.error(err || 'Error al vender la posicion')
    }
  }

  if (!positions.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="#555">Sin posiciones. Anade tu primera inversion.</Typography>
      </Box>
    )
  }

  return (
    <>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { color: '#888', fontSize: 12, borderColor: 'divider' } }}>
              {['Origen', 'Ticker', 'Cantidad', 'Precio compra', 'Precio actual', 'Invertido', 'Valor actual', 'P&L', 'P&L %', ''].map(h => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {positions.map(pos => {
              const pnlColor = getPnlColor(pos.gain_loss || 0)
              return (
                <TableRow
                  key={pos.id}
                  hover
                  onClick={() => setSelected(pos)}
                  sx={{
                    cursor: 'pointer',
                    '& td': { borderColor: 'divider', color: '#ccc' },
                    '&:hover td': { bgcolor: 'rgba(124,58,237,.07)' },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip
                        label={pos.source_type === 'signal' ? 'Senal' : pos.source_type === 'strategy' ? 'Estrategia' : pos.source_type === 'prediction' ? 'Prediccion ML' : 'Manual'}
                        size="small"
                        sx={{
                          bgcolor: pos.source_type === 'signal' ? '#22c55e22' : pos.source_type === 'strategy' ? '#7c3aed22' : pos.source_type === 'prediction' ? '#38bdf822' : '#ffffff10',
                          color: pos.source_type === 'signal' ? '#86efac' : pos.source_type === 'strategy' ? '#c4b5fd' : pos.source_type === 'prediction' ? '#7dd3fc' : '#aaa',
                          fontWeight: 800,
                        }}
                      />
                      {pos.signal_score != null && (
                        <Chip label={`Score ${pos.signal_score}`} size="small" sx={{ bgcolor: '#84cc1622', color: '#bef264', fontWeight: 800 }} />
                      )}
                    </Box>
                    {pos.source_note && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pos.source_note}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell><Chip label={pos.ticker} size="small" sx={{ bgcolor: '#2196f322', color: '#2196f3', fontWeight: 700 }} /></TableCell>
                  <TableCell>{pos.quantity}</TableCell>
                  <TableCell>{formatCurrency(pos.buy_price)}</TableCell>
                  <TableCell>{formatCurrency(pos.current_price)}</TableCell>
                  <TableCell>{formatCurrency(pos.invested)}</TableCell>
                  <TableCell>{formatCurrency(pos.current_value)}</TableCell>
                  <TableCell sx={{ color: pnlColor, fontWeight: 600 }}>{formatCurrency(pos.gain_loss)}</TableCell>
                  <TableCell sx={{ color: pnlColor, fontWeight: 600 }}>{formatPercent(pos.gain_loss_percent)}</TableCell>
                  <TableCell padding="none">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSelected(pos) }} sx={{ color: '#93c5fd' }}>
                      <Visibility fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSell(pos) }} sx={{ color: '#22c55e' }}>
                      <Sell fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(pos.id) }} sx={{ color: '#f44336' }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', borderRadius: 3, border: '1px solid rgba(168,85,247,.22)' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={950}>Inversion en directo</Typography>
            <Typography color="text.secondary" fontSize={12}>
              Precio actualizado desde yfinance/cache y resultado recalculado al abrir.
            </Typography>
          </Box>
          <Button size="small" variant="outlined" startIcon={liveLoading ? <CircularProgress size={14} /> : <Refresh />}
            onClick={() => loadLiveData()} disabled={!selected || liveLoading}>
            Actualizar
          </Button>
        </DialogTitle>
        <DialogContent>
          {selected && livePosition && (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h4" fontWeight={900}>{selected.ticker}</Typography>
                  <Typography color="text.secondary">{selected.source_label || 'Posicion virtual'}</Typography>
                </Box>
                <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                  <Typography color="text.secondary" fontSize={12}>Precio ahora</Typography>
                  <Typography variant="h4" fontWeight={950}>{formatCurrency(livePosition.currentPrice)}</Typography>
                  <Typography color="text.secondary" fontSize={12}>
                    {liveData?.last_update ? `Actualizado: ${new Date(liveData.last_update).toLocaleString('es-ES')}` : 'Usando ultimo precio guardado'}
                  </Typography>
                </Box>
              </Box>

              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip label={`Entrada ${formatCurrency(selected.buy_price)}`} />
                <Chip label={`Actual ${formatCurrency(livePosition.currentPrice)}`} />
                <Chip label={`Cantidad ${selected.quantity}`} />
                <Chip label={`Invertido ${formatCurrency(livePosition.invested)}`} />
                <Chip label={`Valor ${formatCurrency(livePosition.currentValue)}`} />
              </Stack>

              <Box sx={{ p: 2, borderRadius: 2, bgcolor: Number(livePosition.pnl || 0) >= 0 ? '#22c55e12' : '#ef444412', border: '1px solid rgba(255,255,255,.08)' }}>
                <Typography color="text.secondary" fontSize={12}>Resultado ahora mismo</Typography>
                <Typography variant="h4" fontWeight={950} sx={{ color: getPnlColor(livePosition.pnl || 0) }}>
                  {formatCurrency(livePosition.pnl)} ({formatPercent(livePosition.pnlPercent)})
                </Typography>
                <Typography color="text.secondary" fontSize={13}>
                  {isInvestments && selected?.source_type !== 'prediction'
                    ? 'Puedes vender ahora y el valor actual se devuelve a tu wallet, o mantener si crees que la bolsa seguira a favor.'
                    : 'Puedes cerrar esta posicion virtual o mantenerla para seguir simulando el resultado.'}
                </Typography>
              </Box>

              <Box sx={{ height: 280, borderRadius: 3, p: 2, bgcolor: '#050711', border: '1px solid rgba(148,163,184,.14)' }}>
                {liveLoading ? (
                  <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : liveError ? (
                  <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                    <Typography color="error">{liveError}</Typography>
                  </Box>
                ) : chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="investmentLiveGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#8b93a7', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: '#8b93a7', fontSize: 11 }} axisLine={false} tickLine={false} width={56} domain={['dataMin', 'dataMax']} />
                      <Tooltip
                        contentStyle={{ background: '#080b16', border: '1px solid rgba(139,92,246,.28)', borderRadius: 12, color: '#fff' }}
                        formatter={(value) => [formatCurrency(value), 'Precio']}
                      />
                      <ReferenceLine y={Number(selected.buy_price)} stroke="rgba(34,197,94,.65)" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="price" stroke="#a78bfa" strokeWidth={2.4} fill="url(#investmentLiveGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                    <Typography color="text.secondary">Sin historico disponible para este ticker.</Typography>
                  </Box>
                )}
              </Box>

              <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
              {selected.source_note && <Typography color="text.secondary">{selected.source_note}</Typography>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setSelected(null)}>Mantener</Button>
          <Button variant="contained" startIcon={<Sell />} onClick={() => handleSell(selected)}
            sx={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', fontWeight: 900 }}>
            {isInvestments && selected?.source_type !== 'prediction' ? 'Vender ahora' : 'Cerrar posicion'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
