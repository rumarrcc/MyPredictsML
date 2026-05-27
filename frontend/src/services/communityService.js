import api from './api'

export const communityService = {
  getAnalyses: (params = {}) =>
    api.get('/api/community/analyses', { params }).then(r => r.data),

  getAnalysis: (id) =>
    api.get(`/api/community/analyses/${id}`).then(r => r.data),

  share: (data) =>
    api.post('/api/community/share', data).then(r => r.data),

  delete: (id) =>
    api.delete(`/api/community/analyses/${id}`).then(r => r.data),

  like: (id) =>
    api.post(`/api/community/analyses/${id}/like`).then(r => r.data),

  getComments: (id, params = {}) =>
    api.get(`/api/community/analyses/${id}/comments`, { params }).then(r => r.data),

  addComment: (id, comment) =>
    api.post(`/api/community/analyses/${id}/comments`, { comment }).then(r => r.data),

  getTopAnalyses: () =>
    api.get('/api/community/top-analysis').then(r => r.data),
}
