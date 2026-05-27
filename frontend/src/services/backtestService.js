import api from './api'

export const backtestService = {
  run: (data) =>
    api.post('/api/backtest', data).then(r => r.data),

  getById: (id) =>
    api.get(`/api/backtest/${id}`).then(r => r.data),

  getList: (params = {}) =>
    api.get('/api/backtest', { params }).then(r => r.data),
}
