import api from './api'

export const wheelService = {
  getStatus: () => api.get('/api/wheel/status').then(r => r.data),
  spin: () => api.post('/api/wheel/spin').then(r => r.data),

  getRewards: () => api.get('/api/rewards/me').then(r => r.data),
  getHistory: (limit = 50) => api.get('/api/rewards/history', { params: { limit } }).then(r => r.data),

  adminGrant: (payload) => api.post('/api/admin/wheel/grant', payload).then(r => r.data),
  adminStats: () => api.get('/api/admin/wheel/stats').then(r => r.data),
}

export default wheelService
