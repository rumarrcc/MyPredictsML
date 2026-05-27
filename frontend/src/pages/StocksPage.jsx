/**
 * StocksPage — Explorador de tickers y empresas soportadas.
 *
 * Funcionalidades:
 *  - Búsqueda por símbolo / nombre
 *  - Filtros: sector, exchange (bolsa), país
 *  - Indicador de estado activo / no disponible
 *  - Enlace a Predicciones / Noticias por ticker
 *  - Paginación
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, Grid, Paper, Chip, TextField,
  InputAdornment, IconButton, Skeleton, Button,
  Select, MenuItem, FormControl, InputLabel,
  Tooltip, Divider, Avatar, CircularProgress,
} from '@mui/material'
import {
  Search, TrendingUp, Newspaper, FilterList,
  Refresh, CheckCircle, Cancel, Business,
  ArrowUpward, ArrowDownward, Remove,
} from '@mui/icons-material'
import { stockService } from '@/services/stockService'
import { useDebounce } from '@/hooks/useDebounce'
import TickerAutocomplete from '@/components/common/TickerAutocomplete'

// dechever - 12/02/2026: monté la vista de mercado con buscador y filtros para encontrar activos de forma cómoda.

// ── Constantes ────────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  'Tecnología':        '#2196f3',
  'Finanzas':          '#4caf50',
  'Consumo':           '#ff9800',
  'Salud':             '#e91e63',
  'Energía':           '#ff5722',
  'ETF':               '#9c27b0',
  'Industrial':        '#607d8b',
  'Telecomunicaciones':'#00bcd4',
}

const COUNTRY_FLAGS = {
  US: '🇺🇸', ES: '🇪🇸', DE: '🇩🇪', FR: '🇫🇷',
  GB: '🇬🇧', CH: '🇨🇭', NL: '🇳🇱', CA: '🇨🇦',
  SE: '🇸🇪', IE: '🇮🇪',
}

// ── Helper de color por cambio del día ────────────────────────────────────────
function priceChangeColor(pct) {
  if (pct === null || pct === undefined) return '#555'
  return pct > 0 ? '#4caf50' : pct < 0 ? '#f44336' : '#888'
}

function PriceChangeIcon({ pct }) {
  if (pct === null || pct === undefined) return <Remove sx={{ fontSize: 13 }} />
  if (pct > 0) return <ArrowUpward sx={{ fontSize: 13 }} />
  if (pct < 0) return <ArrowDownward sx={{ fontSize: 13 }} />
  return <Remove sx={{ fontSize: 13 }} />
}

// ── Tarjeta de ticker ─────────────────────────────────────────────────────────
function TickerCard({ ticker, onNavigate }) {
  const navigate = useNavigate()
  const sectorColor = SECTOR_COLORS[ticker.sector] || '#7c3aed'
  const pct = ticker.day_change_pct
  const pctColor = priceChangeColor(pct)

  return (
    <Paper sx={{
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: ticker.is_supported && ticker.is_active ? 'divider' : '#f4433622',
      borderRadius: 2.5,
      p: 2,
      cursor: ticker.is_supported ? 'pointer' : 'default',
      transition: 'all .2s',
      position: 'relative',
      opacity: ticker.is_supported && ticker.is_active ? 1 : 0.6,
      '&:hover': ticker.is_supported ? {
        borderColor: sectorColor + '66',
        transform: 'translateY(-2px)',
        boxShadow: `0 4px 20px ${sectorColor}22`,
      } : {},
    }}
      onClick={() => ticker.is_supported && navigate(`/prediction?ticker=${ticker.symbol}`)}
    >
      {/* Cabecera */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
        <Avatar sx={{ bgcolor: sectorColor + '22', width: 40, height: 40, borderRadius: 1.5, flexShrink: 0 }}>
          <Typography fontWeight={900} fontSize={11} sx={{ color: sectorColor }}>
            {ticker.symbol.slice(0, 3)}
          </Typography>
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography fontWeight={800} fontSize={15} color="text.primary">
              {ticker.symbol}
            </Typography>
            <Typography fontSize={11} color="#555">
              {COUNTRY_FLAGS[ticker.country] || ''}
            </Typography>
          </Box>
          <Typography
            color="text.secondary" fontSize={11} lineHeight={1.3}
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {ticker.name || ticker.symbol}
          </Typography>
        </Box>

        {/* Estado */}
        {!ticker.is_active || !ticker.is_supported ? (
          <Tooltip title={!ticker.is_active ? 'Deslistado' : 'No disponible'}>
            <Cancel sx={{ color: '#f44336', fontSize: 16, flexShrink: 0 }} />
          </Tooltip>
        ) : (
          <Tooltip title="Activo">
            <CheckCircle sx={{ color: '#4caf5066', fontSize: 16, flexShrink: 0 }} />
          </Tooltip>
        )}
      </Box>

      {/* Precio */}
      {ticker.last_price ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography fontWeight={700} fontSize={16} color="text.primary">
            {ticker.currency === 'EUR' ? '€' : ticker.currency === 'CHF' ? 'Fr' : '$'}
            {Number(ticker.last_price).toFixed(2)}
          </Typography>
          {pct !== null && pct !== undefined && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: pctColor }}>
              <PriceChangeIcon pct={pct} />
              <Typography fontSize={12} fontWeight={700} sx={{ color: pctColor }}>
                {pct > 0 ? '+' : ''}{Number(pct).toFixed(2)}%
              </Typography>
            </Box>
          )}
        </Box>
      ) : (
        <Typography fontSize={12} color="#555" mb={1}>Sin precio</Typography>
      )}

      {/* Tags */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {ticker.sector && (
          <Chip label={ticker.sector} size="small" sx={{
            bgcolor: sectorColor + '22', color: sectorColor,
            fontWeight: 700, fontSize: 9, height: 18,
          }} />
        )}
        {ticker.exchange && (
          <Chip label={ticker.exchange} size="small" sx={{
            bgcolor: 'action.hover', color: 'text.secondary',
            fontWeight: 700, fontSize: 9, height: 18,
          }} />
        )}
      </Box>

      {/* Acciones rápidas */}
      {ticker.is_supported && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            size="small" startIcon={<TrendingUp sx={{ fontSize: 12 }} />}
            onClick={e => { e.stopPropagation(); navigate(`/prediction?ticker=${ticker.symbol}`) }}
            sx={{ color: '#2196f3', fontSize: 10, textTransform: 'none', p: 0, minWidth: 0 }}
          >
            Predecir
          </Button>
          <Button
            size="small" startIcon={<Newspaper sx={{ fontSize: 12 }} />}
            onClick={e => { e.stopPropagation(); navigate(`/news?ticker=${ticker.symbol}`) }}
            sx={{ color: '#7c3aed', fontSize: 10, textTransform: 'none', p: 0, minWidth: 0 }}
          >
            Noticias
          </Button>
        </Box>
      )}
    </Paper>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TickerSkeleton({ count = 12 }) {
  return (
    <Grid container spacing={2}>
      {[...Array(count)].map((_, i) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
          <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
              <Skeleton variant="rectangular" width={40} height={40} sx={{ borderRadius: 1.5, bgcolor: 'action.hover' }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="50%" height={18} sx={{ bgcolor: 'action.hover' }} />
                <Skeleton width="80%" height={14} sx={{ bgcolor: '#1a1a2e' }} />
              </Box>
            </Box>
            <Skeleton width="40%" height={22} sx={{ bgcolor: 'action.hover', mb: 1 }} />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Skeleton width={60} height={18} sx={{ bgcolor: '#1a1a2e', borderRadius: 1 }} />
              <Skeleton width={50} height={18} sx={{ bgcolor: '#1a1a2e', borderRadius: 1 }} />
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function StocksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search,    setSearch]    = useState(searchParams.get('search') || '')
  const [sector,    setSector]    = useState(searchParams.get('sector') || '')
  const [exchange,  setExchange]  = useState(searchParams.get('exchange') || '')
  const [country,   setCountry]   = useState(searchParams.get('country') || '')
  const [page,      setPage]      = useState(1)
  const [tickers,   setTickers]   = useState([])
  const [meta,      setMeta]      = useState({ sectors: [], exchanges: [], countries: [] })
  const [total,     setTotal]     = useState(0)
  const [pages,     setPages]     = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const debouncedSearch = useDebounce(search, 350)

  // ── Cargar metadatos de filtros al montar ─────────────────────────────────
  useEffect(() => {
    stockService.getTickersMeta()
      .then(data => setMeta(data))
      .catch(() => {})
  }, [])

  // ── Cargar tickers al cambiar filtros ─────────────────────────────────────
  const loadTickers = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = { page: p, per_page: 48 }
      if (debouncedSearch) params.search = debouncedSearch
      if (sector)   params.sector   = sector
      if (exchange) params.exchange = exchange
      if (country)  params.country  = country

      const data = await stockService.getTickers(params)
      setTickers(data.tickers || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setPage(p)
    } catch (e) {
      setError('No se pudieron cargar los tickers.')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sector, exchange, country])

  useEffect(() => {
    loadTickers(1)
  }, [loadTickers])

  // ── Sincronizar URL con filtros ───────────────────────────────────────────
  useEffect(() => {
    const p = {}
    if (search)   p.search   = search
    if (sector)   p.sector   = sector
    if (exchange) p.exchange = exchange
    if (country)  p.country  = country
    setSearchParams(p, { replace: true })
  }, [search, sector, exchange, country]) // eslint-disable-line

  const handleReset = () => {
    setSearch(''); setSector(''); setExchange(''); setCountry('')
    setSearchParams({}, { replace: true })
  }

  const activeFilters = [sector, exchange, country].filter(Boolean).length

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pt: 10, pb: 8 }}>
      <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 } }}>

        {/* ── Cabecera ── */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" fontWeight={900} color="text.primary">
              📈 Mercado
            </Typography>
            {!loading && (
              <Chip
                label={`${total} instrumentos`}
                size="small"
                sx={{ bgcolor: '#2196f322', color: '#2196f3', border: '1px solid #2196f333', fontSize: 11 }}
              />
            )}
          </Box>
          <Typography color="text.secondary">
            Explora acciones, ETFs y empresas de todo el mundo. Busca, filtra y accede a predicciones.
          </Typography>
        </Box>

        {/* ── Buscador y filtros ── */}
        <Paper sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2.5, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Búsqueda */}
            <TickerAutocomplete
              value={search}
              onInputChange={setSearch}
              onChange={(symbol) => setSearch(symbol)}
              placeholder="Buscar por símbolo o nombre..."
              size="small"
              sx={{
                flex: 1, minWidth: 200,
                '& .MuiOutlinedInput-root': {
                  color: '#fff', bgcolor: 'background.default',
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: '#7c3aed' },
                  '&.Mui-focused fieldset': { borderColor: '#7c3aed' },
                },
              }}
            />

            {/* Sector */}
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ color: '#555', '&.Mui-focused': { color: '#7c3aed' } }}>Sector</InputLabel>
              <Select value={sector} onChange={e => setSector(e.target.value)} label="Sector"
                sx={{ color: '#fff', bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}>
                <MenuItem value="">Todos</MenuItem>
                {meta.sectors.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Exchange */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ color: '#555', '&.Mui-focused': { color: '#7c3aed' } }}>Bolsa</InputLabel>
              <Select value={exchange} onChange={e => setExchange(e.target.value)} label="Bolsa"
                sx={{ color: '#fff', bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}>
                <MenuItem value="">Todas</MenuItem>
                {meta.exchanges.map(ex => <MenuItem key={ex} value={ex}>{ex}</MenuItem>)}
              </Select>
            </FormControl>

            {/* País */}
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel sx={{ color: '#555', '&.Mui-focused': { color: '#7c3aed' } }}>País</InputLabel>
              <Select value={country} onChange={e => setCountry(e.target.value)} label="País"
                sx={{ color: '#fff', bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}>
                <MenuItem value="">Todos</MenuItem>
                {meta.countries.map(c => <MenuItem key={c} value={c}>{COUNTRY_FLAGS[c] || ''} {c}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Reset */}
            {(search || activeFilters > 0) && (
              <Button onClick={handleReset} variant="outlined" size="small"
                sx={{ borderColor: 'divider', color: '#888', '&:hover': { borderColor: '#f44336', color: '#f44336' }, whiteSpace: 'nowrap' }}>
                Limpiar
              </Button>
            )}

            <Tooltip title="Recargar">
              <IconButton onClick={() => loadTickers(page)} size="small" sx={{ color: '#555', '&:hover': { color: '#7c3aed' } }}>
                <Refresh />
              </IconButton>
            </Tooltip>

            <Typography color="#555" fontSize={12} ml="auto">
              {loading ? '...' : `${total} resultados`}
            </Typography>
          </Box>

          {/* Chips de filtro activos */}
          {(sector || exchange || country) && (
            <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center' }}>
              <FilterList sx={{ color: '#555', fontSize: 14 }} />
              {sector   && <Chip label={sector}   size="small" onDelete={() => setSector('')}   sx={{ bgcolor: '#7c3aed22', color: '#b89eff', fontSize: 11 }} />}
              {exchange && <Chip label={exchange} size="small" onDelete={() => setExchange('')} sx={{ bgcolor: '#2196f322', color: '#2196f3', fontSize: 11 }} />}
              {country  && <Chip label={`${COUNTRY_FLAGS[country] || ''} ${country}`} size="small" onDelete={() => setCountry('')} sx={{ bgcolor: '#4caf5022', color: '#4caf50', fontSize: 11 }} />}
            </Box>
          )}
        </Paper>

        {/* ── Contenido ── */}
        {loading ? (
          <TickerSkeleton count={12} />
        ) : error ? (
          <Paper sx={{ bgcolor: '#2d1515', border: '1px solid #f4433633', borderRadius: 2, p: 3, textAlign: 'center' }}>
            <Typography color="#f44336" mb={1}>{error}</Typography>
            <Button onClick={() => loadTickers(page)} sx={{ color: '#f44336' }}>Reintentar</Button>
          </Paper>
        ) : tickers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 12 }}>
            <Business sx={{ fontSize: 72, color: '#2d2d4e', mb: 2 }} />
            <Typography color="#555" variant="h6" mb={1}>No se encontraron instrumentos</Typography>
            <Typography color="#444" variant="body2" mb={3}>Prueba con otros filtros o borra la búsqueda</Typography>
            <Button variant="outlined" onClick={handleReset} sx={{ borderColor: '#7c3aed66', color: '#b89eff' }}>
              Ver todos
            </Button>
          </Box>
        ) : (
          <>
            <Grid container spacing={2}>
              {tickers.map(t => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={t.symbol}>
                  <TickerCard ticker={t} />
                </Grid>
              ))}
            </Grid>

            {/* Paginación */}
            {pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 4, flexWrap: 'wrap' }}>
                <Button
                  disabled={page <= 1}
                  onClick={() => loadTickers(page - 1)}
                  variant="outlined"
                  sx={{ borderColor: 'divider', color: 'text.secondary' }}
                >
                  ← Anterior
                </Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {[...Array(Math.min(pages, 7))].map((_, i) => {
                    const p = i + 1
                    return (
                      <Button key={p} onClick={() => loadTickers(p)}
                        variant={p === page ? 'contained' : 'outlined'}
                        size="small"
                        sx={{ minWidth: 36, borderColor: 'divider', color: p === page ? '#fff' : 'text.secondary' }}>
                        {p}
                      </Button>
                    )
                  })}
                  {pages > 7 && <Typography color="#555">... {pages}</Typography>}
                </Box>
                <Button
                  disabled={page >= pages}
                  onClick={() => loadTickers(page + 1)}
                  variant="outlined"
                  sx={{ borderColor: 'divider', color: 'text.secondary' }}
                >
                  Siguiente →
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
