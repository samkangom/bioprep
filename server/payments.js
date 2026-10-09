import express from 'express'
import crypto from 'node:crypto'
import { HttpError } from './tutor.js'
import { verifyWebhookSignature } from './razorpay.js'

/**
 * Payments.
 *  POST /api/payments/order   create a Razorpay order for a test (price comes from the database, never the client)
 *  POST /api/payments/webhook verified Razorpay webhook: the ONLY thing that inserts into `unlocks`
 *  GET  /api/payments/status/:orderId  poll after Checkout closes (read-only)
 * The Checkout success callback in the browser proves nothing and never unlocks anything.
 */
export function registerWebhook(app, ctx) {
  app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '256kb' }), async (req, res, next) => {
    try {
      const secret = ctx.opts.razorpayWebhookSecret
      if (!secret) return res.status(503).json({ error: 'payments_not_configured' })
      if (!verifyWebhookSignature(req.body, req.headers['x-razorpay-signature'], secret)) return res.status(400).json({ error: 'bad_signature' })
      let evt
      try { evt = JSON.parse(req.body.toString('utf8')) } catch { return res.status(400).json({ error: 'bad_json' }) }
      const eventId = String(req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(req.body).digest('hex'))
      const p = evt.payload || {}
      const pay = p.payment?.entity
      let outcome = 'ignored'
      if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
        if (!pay?.order_id || !pay?.id) return res.status(400).json({ error: 'bad_payload' })
        outcome = (await ctx.db.query('select private.apply_payment_captured($1, $2, $3, $4, $5, $6) as r',
          [eventId, pay.order_id, pay.id, Number(pay.amount), String(pay.currency || 'INR'), pay.method || null])).rows[0].r
      } else if (evt.event === 'payment.failed') {
        if (pay?.order_id) outcome = (await ctx.db.query('select private.apply_payment_failed($1, $2) as r', [eventId, pay.order_id])).rows[0].r
      } else if (evt.event === 'refund.processed') {
        const ref = p.refund?.entity
        if (ref?.payment_id) outcome = (await ctx.db.query('select private.apply_refund_processed($1, $2, $3) as r', [eventId, ref.payment_id, ref.id || null])).rows[0].r
      }
      console.log(`[payments] ${evt.event} ${eventId} -> ${outcome}`)
      res.json({ ok: true, outcome })
    } catch (e) {
      next(e) // 500 makes Razorpay retry the delivery
    }
  })
}

export function registerPayments(app, ctx, { auth, limited, wrap, must, isUuid }) {
  const { db } = ctx

  app.post('/api/payments/order', auth, limited, wrap(async (req, res) => {
    const rz = ctx.opts.razorpay
    if (!rz) throw new HttpError(503, 'payments_not_configured')
    const { testId } = req.body || {}
    must(isUuid(testId))
    const { rows: [t] } = await db.query('select id, title, price_inr from public.tests where id = $1 and published', [testId])
    if (!t) throw new HttpError(404, 'test_not_found')
    if (t.price_inr <= 0) throw new HttpError(400, 'free_test')
    const { rows: [u] } = await db.query('select 1 as x from public.unlocks where user_id = $1 and test_id = $2 and revoked_at is null', [req.user.id, testId])
    if (u) throw new HttpError(409, 'already_unlocked')
    const { rows: [recent] } = await db.query(
      `select count(*)::int as n from public.payments where user_id = $1 and created_at > now() - interval '1 hour'`, [req.user.id])
    if (recent.n >= 10) throw new HttpError(429, 'rate_limited')

    const amountPaise = t.price_inr * 100
    const receipt = 'bp_' + crypto.randomBytes(9).toString('hex')
    let order
    try {
      order = await rz.createOrder({ amountPaise, receipt, notes: { user_id: req.user.id, test_id: t.id } })
    } catch (e) {
      console.error('[payments] createOrder failed:', e?.status || '', e?.message)
      throw new HttpError(502, 'payment_provider_error')
    }
    await db.query(
      `insert into public.payments (user_id, test_id, amount_paise, currency, razorpay_order_id) values ($1, $2, $3, $4, $5)`,
      [req.user.id, t.id, order.amount, order.currency || 'INR', order.id])
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency || 'INR', keyId: rz.keyId, testTitle: t.title })
  }))

  app.get('/api/payments/status/:orderId', auth, limited, wrap(async (req, res) => {
    const id = String(req.params.orderId || '')
    must(/^[A-Za-z0-9_]{6,40}$/.test(id))
    const { rows: [p] } = await db.query('select status, test_id from public.payments where razorpay_order_id = $1 and user_id = $2', [id, req.user.id])
    if (!p) throw new HttpError(404, 'order_not_found')
    res.set('Cache-Control', 'no-store').json({ status: p.status, testId: p.test_id })
  }))
}
