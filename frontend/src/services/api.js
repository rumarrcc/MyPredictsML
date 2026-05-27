import axios from 'axios'
import { toast } from 'react-toastify'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// dechever - 13/05/2026: hice una pasada final desde la web para comprobar navegación, pagos de prueba y flujos principales.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status

    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')

      const publicPaths = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/reviews', '/news', '/stocks', '/prediction', '/marketplace']
      const isPublicPath = publicPaths.some(path => (
        path === '/' ? window.location.pathname === '/' : window.location.pathname.startsWith(path)
      ))

      if (!isPublicPath) {
        window.location.href = '/login'
      }
    } else if (status === 429) {
      toast.warn('Demasiadas solicitudes. Espera un momento.')
    } else if (status >= 500) {
      toast.error('Error en el servidor. Intenta más tarde.')
    }

    return Promise.reject(error)
  }
)

export default api
