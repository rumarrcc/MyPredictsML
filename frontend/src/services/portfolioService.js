import api from './api'

export const portfolioService = {
  getList: () =>
    api.get('/api/portfolio').then(r => r.data),

  create: (data) =>
    api.post('/api/portfolio', data).then(r => r.data),

  getById: (id) =>
    api.get(`/api/portfolio/${id}`).then(r => r.data),

  update: (id, data) =>
    api.put(`/api/portfolio/${id}`, data).then(r => r.data),

  delete: (id) =>
    api.delete(`/api/portfolio/${id}`).then(r => r.data),

  addPosition: (portfolioId, data) =>
    api.post(`/api/portfolio/${portfolioId}/positions`, data).then(r => r.data),

  deletePosition: (portfolioId, positionId) =>
    api.delete(`/api/portfolio/${portfolioId}/positions/${positionId}`).then(r => r.data),

  sellPosition: (portfolioId, positionId) =>
    api.post(`/api/portfolio/${portfolioId}/positions/${positionId}/sell`).then(r => r.data),
}
