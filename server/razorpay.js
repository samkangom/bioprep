import crypto from 'node:crypto'

/** Minimal Razorpay REST client (orders only). Amounts are in paise. */
export function createRazorpay({ keyId, keySecret, baseUrl = 'https://api.razorpay.com/v1', fetchImpl = fetch }) {
  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  return {
    keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const res = await fetchImpl(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw Object.assign(new Error(json?.error?.description || `Razorpay ${res.status}`), { status: res.status })
      return json // { id, amount, currency, status, ... }
    },
  }
}

/** Razorpay signs the exact raw request body with HMAC-SHA256 using the webhook secret. */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
