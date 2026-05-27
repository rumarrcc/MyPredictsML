import api from './api'

export const authService = {
  login: (credentials) =>
    api.post('/api/auth/login', credentials).then(r => r.data),

  register: (data) =>
    api.post('/api/auth/register', data).then(r => r.data),

  verifyEmail: (token) =>
    api.post('/api/auth/verify-email', { token }).then(r => r.data),

  resendVerification: (email) =>
    api.post('/api/auth/resend-verification', { email }).then(r => r.data),

  forgotPassword: (email) =>
    api.post('/api/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: ({ token, password }) =>
    api.post('/api/auth/reset-password', { token, password }).then(r => r.data),

  getMe: () =>
    api.get('/api/auth/me').then(r => r.data),

  updateProfile: (data) =>
    api.put('/api/auth/profile', data).then(r => r.data),

  getProfilePredictions: (params = {}) =>
    api.get('/api/auth/profile/predictions', { params }).then(r => r.data),

  getSettings: () =>
    api.get('/api/auth/settings').then(r => r.data),

  updateSettings: (data) =>
    api.put('/api/auth/settings', data).then(r => r.data),

  logout: () =>
    api.post('/api/auth/logout').catch(() => null),

  getFavorites: () =>
    api.get('/api/auth/favorites').then(r => r.data),

  addFavorite: (ticker, name) =>
    api.post('/api/auth/favorites', { ticker, name }).then(r => r.data),

  removeFavorite: (ticker) =>
    api.delete(`/api/auth/favorites/${ticker}`).then(r => r.data),
}
