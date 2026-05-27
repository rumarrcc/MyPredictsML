import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export const formatCurrency = (value, currency = 'USD') => {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

export const formatPercent = (value, decimals = 2) => {
  if (value == null) return '—'
  const pct = value * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

export const formatNumber = (value, decimals = 0) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export const formatDate = (dateStr, fmt = 'dd MMM yyyy') => {
  if (!dateStr) return '—'
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return format(d, fmt, { locale: es })
  } catch { return dateStr }
}

export const formatRelativeDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: es })
  } catch { return dateStr }
}

export const formatVolume = (v) => {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return v.toString()
}

export const getPnlColor = (value) =>
  value >= 0 ? '#4caf50' : '#f44336'

export const getPnlSign = (value) =>
  value >= 0 ? '+' : ''
