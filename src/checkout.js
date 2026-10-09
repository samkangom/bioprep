// Razorpay Checkout. The browser callback is NOT proof of payment: after Checkout closes we only poll the API,
// and the API reports "paid" once the verified webhook has arrived.
import { api } from './api'

const SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let loading
export const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve()
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error('checkout_script')) }
    document.head.appendChild(s)
  })
  return loading
}

/** Creates an order on the server and opens Checkout. Resolves { orderId, testMode, outcome: 'completed' | 'dismissed' | 'failed', reason? }. */
export async function openCheckout({ testId, user }) {
  const order = await api('/api/payments/order', { method: 'POST', body: { testId } })
  await loadCheckout()
  const testMode = String(order.keyId || '').startsWith('rzp_test_')
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: 'BioPrep', description: order.testTitle, theme: { color: '#1F5C45' },
      prefill: user?.phone ? { contact: '+' + String(user.phone).replace(/^\+/, '') } : undefined,
      handler: () => resolve({ orderId: order.orderId, testMode, outcome: 'completed' }),
      modal: { ondismiss: () => resolve({ orderId: order.orderId, testMode, outcome: 'dismissed' }) },
    })
    rzp.on?.('payment.failed', (r) => resolve({ orderId: order.orderId, testMode, outcome: 'failed', reason: r?.error?.description }))
    rzp.open()
  })
}

/** Polls the order until the webhook has marked it paid (or failed). */
export async function waitForPaid(orderId, { timeoutMs = 60000, intervalMs = 1500, signal } = {}) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (signal?.aborted) return 'aborted'
    const { status } = await api(`/api/payments/status/${orderId}`)
    if (status === 'paid' || status === 'failed' || status === 'refunded') return status
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return 'pending'
}
