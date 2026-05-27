import { useEffect, useState } from 'react'
import {
  Autocomplete, Box, Chip, CircularProgress, InputAdornment,
  TextField, Typography,
} from '@mui/material'
import { SearchRounded } from '@mui/icons-material'
import { stockService } from '@/services/stockService'

// dechever - 19/02/2026: organicé los componentes comunes para reutilizarlos en varias pantallas sin repetir todo.
const inputSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    bgcolor: 'background.paper',
    borderRadius: 2,
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: '#7c3aed' },
    '&.Mui-focused fieldset': { borderColor: '#8b5cf6' },
  },
  '& label': { color: 'text.secondary' },
}

export default function TickerAutocomplete({
  value = '',
  onChange,
  onInputChange,
  label,
  placeholder = 'Buscar ticker...',
  size = 'small',
  fullWidth = false,
  sx,
  textFieldProps = {},
}) {
  const [input, setInput] = useState(value || '')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setInput(value || '')
  }, [value])

  useEffect(() => {
    const q = (input || '').trim()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await stockService.searchTickers(q, q ? 30 : 18)
        setOptions(data.items || [])
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [input])

  const setSymbol = (next, option = null) => {
    const symbol = typeof next === 'string' ? next.toUpperCase() : (next?.symbol || '').toUpperCase()
    setInput(symbol)
    onInputChange?.(symbol)
    onChange?.(symbol, option || next)
  }

  return (
    <Autocomplete
      freeSolo
      fullWidth={fullWidth}
      options={options}
      value={value || ''}
      inputValue={input}
      loading={loading}
      filterOptions={x => x}
      getOptionLabel={(option) => typeof option === 'string' ? option : option?.symbol || ''}
      isOptionEqualToValue={(option, selected) => option?.symbol === selected?.symbol || option?.symbol === selected}
      onInputChange={(_, next, reason) => {
        if (reason === 'reset') return
        const normalized = (next || '').toUpperCase()
        setInput(normalized)
        onInputChange?.(normalized)
      }}
      onChange={(_, next) => {
        if (!next) return
        setSymbol(next, next)
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.symbol} sx={{ display: 'flex', gap: 1.4, alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={900} fontSize={13}>{option.symbol}</Typography>
            <Typography color="text.secondary" fontSize={12} noWrap>{option.name || option.exchange}</Typography>
          </Box>
          {option.last_price != null && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography fontWeight={800} fontSize={12}>{Number(option.last_price).toFixed(2)}</Typography>
              <Chip
                size="small"
                label={`${Number(option.day_change_pct || 0).toFixed(2)}%`}
                sx={{
                  height: 18,
                  fontSize: 10,
                  bgcolor: Number(option.day_change_pct || 0) >= 0 ? '#22c55e22' : '#ef444422',
                  color: Number(option.day_change_pct || 0) >= 0 ? '#4ade80' : '#f87171',
                }}
              />
            </Box>
          )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          {...textFieldProps}
          label={label}
          placeholder={placeholder}
          size={size}
          sx={{ ...inputSx, ...sx }}
          InputProps={{
            ...params.InputProps,
            ...textFieldProps.InputProps,
            startAdornment: textFieldProps.InputProps?.startAdornment || (
              <InputAdornment position="start"><SearchRounded sx={{ color: '#8b5cf6', fontSize: 18 }} /></InputAdornment>
            ),
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {textFieldProps.InputProps?.endAdornment}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}
