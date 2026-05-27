import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingSpinner fullscreen />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (user && user.email_verified === false) return <Navigate to="/login" state={{ from: location, unverifiedEmail: user.email }} replace />
  return children
}
