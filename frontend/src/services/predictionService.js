import api from './api'

export const predictionService = {
  create: (data) =>
    api.post('/api/predictions', data).then(r => r.data),

  getList: (params = {}) =>
    api.get('/api/predictions', { params }).then(r => r.data),

  getById: (id) =>
    api.get(`/api/predictions/${id}`).then(r => r.data),
}
