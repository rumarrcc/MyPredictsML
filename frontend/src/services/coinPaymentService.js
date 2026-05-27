import api from './api'

export const coinPaymentService = {
  balance: () => api.get('/api/coins/balance').then(r => r.data),
  transactions: () => api.get('/api/coins/transactions').then(r => r.data),
  packages: () => api.get('/api/coin-packages').then(r => r.data),
  createCheckoutSession: (packageId) =>
    api.post('/api/payments/stripe/coin-checkout', { package_id: packageId }).then(r => r.data),
  purchases: () => api.get('/api/payments/purchases').then(r => r.data),
  purchase: (id, sessionId = null) =>
    api.get(`/api/payments/purchases/${id}`, { params: sessionId ? { session_id: sessionId } : {} }).then(r => r.data),
}

export default coinPaymentService
