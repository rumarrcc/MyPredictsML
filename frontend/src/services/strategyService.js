import api from './api'

export const strategyService = {
  // ── Creador ───────────────────────────────────────────────────────────────
  create:    (data)              => api.post('/api/strategies', data).then(r => r.data),
  update:    (id, data)          => api.patch(`/api/strategies/${id}`, data).then(r => r.data),
  getMine:   (status)            => api.get('/api/strategies/mine', { params: { status } }).then(r => r.data),
  getPurchased: ()               => api.get('/api/strategies/purchased').then(r => r.data),
  publish:   (id)                => api.post(`/api/strategies/${id}/publish`).then(r => r.data),
  archive:   (id)                => api.post(`/api/strategies/${id}/archive`).then(r => r.data),
  upsertMetrics: (id, data)      => api.post(`/api/strategies/${id}/metrics`, data).then(r => r.data),

  // ── Marketplace ───────────────────────────────────────────────────────────
  getMarketplace: (params = {}) => api.get('/api/strategies/marketplace', { params }).then(r => r.data),
  getOne:    (id)               => api.get(`/api/strategies/${id}`).then(r => r.data),
  purchase:  (id)               => api.post(`/api/strategies/${id}/purchase`).then(r => r.data),
  copyToPredictions: (id, params) =>
    api.post(`/api/strategies/${id}/copy-to-predictions`, params).then(r => r.data),
  copyToInvestments: (id, params = {}) =>
    api.post(`/api/strategies/${id}/copy-to-investments`, params).then(r => r.data),

  // ── Reviews ───────────────────────────────────────────────────────────────
  getReviews:   (id)                        => api.get(`/api/strategies/${id}/reviews`).then(r => r.data),
  addReview:    (id, rating, comment)       => api.post(`/api/strategies/${id}/reviews`, { rating, comment }).then(r => r.data),
  updateReview: (id, rid, rating, comment)  => api.patch(`/api/strategies/${id}/reviews/${rid}`, { rating, comment }).then(r => r.data),
  deleteReview: (id, rid)                   => api.delete(`/api/strategies/${id}/reviews/${rid}`).then(r => r.data),

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminList:          (params = {})             => api.get('/api/strategies/admin/list', { params }).then(r => r.data),
  adminStats:         ()                        => api.get('/api/strategies/admin/stats').then(r => r.data),
  adminFeature:       (id, featured)            => api.patch(`/api/strategies/${id}/admin/feature`, { featured }).then(r => r.data),
  adminModerate:      (id, action)              => api.patch(`/api/strategies/${id}/admin/moderate`, { action }).then(r => r.data),
  // Confirmación manual de pago (solo admin)
  // buyer_id: ID del comprador cuyo pago se quiere confirmar
  adminConfirmPayment: (id, buyerId, extId, provider = 'manual') =>
    api.post(`/api/strategies/${id}/payment/admin-confirm`, {
      buyer_id: buyerId,
      external_payment_id: extId,
      provider,
    }).then(r => r.data),
}

export default strategyService
