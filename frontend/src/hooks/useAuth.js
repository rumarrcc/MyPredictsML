import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { logout } from '@/store/slices/authSlice'

export const useAuth = () => {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const { user, token, isLoading, error } = useSelector(s => s.auth)

  const isAuthenticated = !!token

  const signOut = () => {
    dispatch(logout())
    navigate('/login')
  }

  return { user, token, isAuthenticated, isLoading, error, signOut }
}
