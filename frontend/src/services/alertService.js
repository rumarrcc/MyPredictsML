import api from './api'

export const alertService = {
  getAlerts: (params = {}) =>
    api.get('/api/alerts', { params }).then(r => r.data),
  createAlert: (payload) =>
    api.post('/api/alerts', payload).then(r => r.data),
  updateAlert: (id, payload) =>
    api.put(`/api/alerts/${id}`, payload).then(r => r.data),
  deleteAlert: (id) =>
    api.delete(`/api/alerts/${id}`).then(r => r.data),
}

export default alertService
