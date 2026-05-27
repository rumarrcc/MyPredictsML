import api from './api'

export const stockService = {
  // ── Datos históricos (existente) ─────────────────────────────────────────
  getStock: (ticker, days = 365) =>
    api.get(`/api/stock/${ticker}`, { params: { days } }).then(r => r.data),

  getBatch: (tickers, days = 30) =>
    api.get('/api/stock/batch', { params: { tickers: tickers.join(','), days } }).then(r => r.data),

  getIndicators: (ticker, period = 200) =>
    api.get(`/api/indicators/${ticker}`, { params: { period } }).then(r => r.data),

  getIndicatorsHistory: (ticker, days = 90) =>
    api.get(`/api/indicators/${ticker}/history`, { params: { days } }).then(r => r.data),

  search: (q) =>
    api.get('/api/search', { params: { q } }).then(r => r.data),

  // ── Catálogo de tickers (/api/stocks) ─────────────────────────────────────
  /**
   * Lista tickers con filtros opcionales y paginación.
   * @param {Object} params - { sector, exchange, country, search, page, per_page }
   */
  getTickers: (params = {}) =>
    api.get('/api/stocks', { params }).then(r => r.data),

  searchTickers: (q = '', limit = 20) =>
    api.get('/api/stocks/search', { params: { q, limit } }).then(r => r.data),

  /** Detalle completo de un ticker del catálogo. */
  getTickerDetail: (symbol) =>
    api.get(`/api/stocks/${symbol.toUpperCase()}`).then(r => r.data),

  /** Metadatos de filtros: sectores, exchanges y países disponibles. */
  getTickersMeta: () =>
    api.get('/api/stocks/meta').then(r => r.data),

  // ── Admin de tickers ──────────────────────────────────────────────────────
  adminSeedTickers: (overwrite = false) =>
    api.post('/api/stocks/admin/seed', { overwrite }).then(r => r.data),

  adminSyncTickers: (symbols = null) =>
    api.post('/api/stocks/admin/sync', symbols ? { symbols } : {}).then(r => r.data),

  adminPatchTicker: (symbol, data) =>
    api.patch(`/api/stocks/admin/${symbol.toUpperCase()}`, data).then(r => r.data),

  adminListAll: (params = {}) =>
    api.get('/api/stocks/admin/list', { params }).then(r => r.data),
}
