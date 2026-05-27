import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { Component } from 'react'
import { getMeThunk } from '@/store/slices/authSlice'
import { Box, Typography, Button } from '@mui/material'

import PrivateRoute from '@/components/common/PrivateRoute'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import PremiumDashboardShell from '@/components/layout/PremiumDashboardShell'

const LoginPage          = lazy(() => import('@/pages/LoginPage'))
const RegisterPage       = lazy(() => import('@/pages/RegisterPage'))
const VerifyEmailPage    = lazy(() => import('@/pages/VerifyEmailPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage  = lazy(() => import('@/pages/ResetPasswordPage'))
const DashboardPage      = lazy(() => import('@/pages/DashboardPage'))
const PredictionPage     = lazy(() => import('@/pages/PredictionPage'))
const BacktestPage       = lazy(() => import('@/pages/BacktestPage'))
const PortfolioPage      = lazy(() => import('@/pages/PortfolioPage'))
const ReviewsPage        = lazy(() => import('@/pages/ReviewsPage'))
const NewsPage           = lazy(() => import('@/pages/NewsPage'))
const CommunityPage      = lazy(() => import('@/pages/CommunityPage'))
const AnalysisDetailPage = lazy(() => import('@/pages/AnalysisDetailPage'))
const ProfilePage        = lazy(() => import('@/pages/ProfilePage'))
const SettingsPage       = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage       = lazy(() => import('@/pages/NotFoundPage'))
const AdminPage          = lazy(() => import('@/pages/AdminPage'))
const StocksPage         = lazy(() => import('@/pages/StocksPage'))
const WheelPage          = lazy(() => import('@/pages/WheelPage'))
const MarketplacePage    = lazy(() => import('@/pages/MarketplacePage'))
const StrategiesPage     = lazy(() => import('@/pages/StrategiesPage'))
const StrategyDetailPage = lazy(() => import('@/pages/StrategyDetailPage'))
const BillingPage        = lazy(() => import('@/pages/BillingPage'))
const WalletPage         = lazy(() => import('@/pages/WalletPage'))
const PaymentMethodsPage = lazy(() => import('@/pages/PaymentMethodsPage'))
const InvoicesPage       = lazy(() => import('@/pages/InvoicesPage'))
const BuyCoinsPage       = lazy(() => import('@/pages/BuyCoinsPage'))
const CoinPurchaseResultPage = lazy(() => import('@/pages/CoinPurchaseResultPage'))
const HomePage = lazy(() => import('@/pages/HomePage'))

// dechever - 09/01/2026: dejé armada la navegación principal y la estructura visual para poder movernos por la web sin perder el hilo.
class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
    const message = String(error?.message || '')
    const isOldChunk = message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed')
    if (isOldChunk && sessionStorage.getItem('mypredicts-reloaded-after-boundary-error') !== '1') {
      sessionStorage.setItem('mypredicts-reloaded-after-boundary-error', '1')
      window.location.reload()
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center' }}>
          <Typography variant="h5" color="#f44336" mb={1}>Algo salió mal</Typography>
          <Typography color="#888" mb={3} maxWidth={500} sx={{ wordBreak: 'break-word', fontSize: 13 }}>
            {this.state.error?.message || 'Error desconocido'}
          </Typography>
          <Button variant="contained" onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}>
            Volver al inicio
          </Button>
        </Box>
      )
    }
    return this.props.children
  }
}

function PublicLayout({ children }) {
  return <PremiumDashboardShell>{children}</PremiumDashboardShell>
}

function AuthLayout({ children }) {
  return <main>{children}</main>
}

function Page({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner fullscreen message="Cargando página..." />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  const dispatch = useDispatch()
  const { token } = useSelector(s => s.auth)

  useEffect(() => {
    if (token) dispatch(getMeThunk())

    const handleFocus = () => {
      if (localStorage.getItem('token')) dispatch(getMeThunk())
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [dispatch, token])

  return (
    <Routes>
      <Route path="/login"    element={<Page><AuthLayout><LoginPage /></AuthLayout></Page>} />
      <Route path="/register" element={<Page><AuthLayout><RegisterPage /></AuthLayout></Page>} />
      <Route path="/verify-email" element={<Page><AuthLayout><VerifyEmailPage /></AuthLayout></Page>} />
      <Route path="/forgot-password" element={<Page><AuthLayout><ForgotPasswordPage /></AuthLayout></Page>} />
      <Route path="/reset-password" element={<Page><AuthLayout><ResetPasswordPage /></AuthLayout></Page>} />

      <Route path="/" element={<Page><PublicLayout><HomePage /></PublicLayout></Page>} />
      <Route path="/community" element={<Page><PublicLayout><CommunityPage /></PublicLayout></Page>} />
      <Route path="/community/:id" element={<Page><PublicLayout><AnalysisDetailPage /></PublicLayout></Page>} />
      <Route path="/reviews" element={<Page><PublicLayout><ReviewsPage /></PublicLayout></Page>} />
      <Route path="/news"    element={<Page><PublicLayout><NewsPage    /></PublicLayout></Page>} />
      <Route path="/stocks"   element={<Page><PublicLayout><StocksPage  /></PublicLayout></Page>} />
      <Route path="/prediction" element={<Page><PublicLayout><PredictionPage /></PublicLayout></Page>} />
      <Route path="/predictions" element={<Page><PublicLayout><PredictionPage /></PublicLayout></Page>} />
      <Route path="/marketplace" element={<Page><PublicLayout><MarketplacePage /></PublicLayout></Page>} />
      <Route path="/marketplace/:id" element={<Page><PublicLayout><StrategyDetailPage /></PublicLayout></Page>} />
      <Route path="/wheel" element={
        <PrivateRoute><Page><WheelPage /></Page></PrivateRoute>
      } />

      <Route path="/dashboard" element={
        <PrivateRoute><Page><PublicLayout><DashboardPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/backtest" element={
        <PrivateRoute><Page><PublicLayout><BacktestPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/portfolio" element={
        <PrivateRoute><Page><PublicLayout><PortfolioPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/investments" element={
        <PrivateRoute><Page><PublicLayout><PortfolioPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/profile" element={
        <PrivateRoute><Page><PublicLayout><ProfilePage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/settings" element={
        <PrivateRoute><Page><PublicLayout><SettingsPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/admin" element={
        <PrivateRoute><Page><PublicLayout><AdminPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/strategies" element={
        <PrivateRoute><Page><PublicLayout><StrategiesPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/billing" element={
        <PrivateRoute><Page><PublicLayout><BillingPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/wallet" element={
        <PrivateRoute><Page><PublicLayout><WalletPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/coins/buy" element={
        <PrivateRoute><Page><PublicLayout><BuyCoinsPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/coins/success" element={
        <PrivateRoute><Page><PublicLayout><CoinPurchaseResultPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/coins/cancel" element={
        <PrivateRoute><Page><PublicLayout><CoinPurchaseResultPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/billing/payment-methods" element={
        <PrivateRoute><Page><PublicLayout><PaymentMethodsPage /></PublicLayout></Page></PrivateRoute>
      } />
      <Route path="/billing/invoices" element={
        <PrivateRoute><Page><PublicLayout><InvoicesPage /></PublicLayout></Page></PrivateRoute>
      } />

      <Route path="*" element={<Page><NotFoundPage /></Page>} />
    </Routes>
  )
}
