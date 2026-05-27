import api from './api'

export const reviewService = {
  list:     (params = {}) => api.get('/api/reviews', { params }).then(r => r.data),
  mine:     ()             => api.get('/api/reviews/mine').then(r => r.data),
  publish:  (data)         => api.post('/api/reviews', data).then(r => r.data),
  delete:   ()             => api.delete('/api/reviews/mine').then(r => r.data),
}

export default reviewService
