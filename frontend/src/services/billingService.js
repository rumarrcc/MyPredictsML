import api from './api'

export const billingService = {
  // Plan info
  getPlans:            ()       => api.get('/api/billing/plans').then(r => r.data),
  getMySubscription:   ()       => api.get('/api/billing/my-subscription').then(r => r.data),

  // Stripe
  createCheckoutSession: (plan) => api.post('/api/billing/create-checkout-session', { plan }).then(r => r.data),
  createPortalSession:   ()     => api.post('/api/billing/create-portal-session').then(r => r.data),
  syncCheckoutSession:   (sessionId) =>
    api.post('/api/billing/sync-checkout-session', { session_id: sessionId }).then(r => r.data),

  // Admin
  adminStats:          ()          => api.get('/api/billing/admin/stats').then(r => r.data),
  adminPayments:       (params)    => api.get('/api/billing/admin/payments', { params }).then(r => r.data),
  adminSubscriptions:  (params)    => api.get('/api/billing/admin/subscriptions', { params }).then(r => r.data),
  adminOverridePlan:   (userId, plan) =>
    api.post('/api/billing/admin/override-plan', { user_id: userId, plan }).then(r => r.data),
  adminUserBilling:    (userId)    => api.get(`/api/billing/admin/user/${userId}`).then(r => r.data),
  adminRefund:         (paymentId) =>
    api.post(`/api/billing/admin/refund/${paymentId}`).then(r => r.data),
}
