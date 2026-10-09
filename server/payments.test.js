import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { bootDb, addUser, asRole } from '../dev/pg.js'
import { fromPglite } from './db.js'
import { createApp } from './app.js'

const SECRET = 'whsec_test'
let pg, server, base
let orders = [], orderSeq = 0, failOrders = false
const razorpay = {
  keyId: 'rzp_test_unit',
  createOrder: async (o) => { if (failOrders) throw new Error('provider down'); orders.push(o); return { id: 'order_T' + String(++orderSeq).padStart(4, '0'), amount: o.amountPaise, currency: 'INR', status: 'created' } },
}
const q = async (sql, p) => (await pg.query(sql, p)).rows

beforeAll(async () => {
  pg = await bootDb({ seed: true })
  const app = createApp({ db: fromPglite(pg), verifyToken: async (t) => (/^[0-9a-f-]{36}$/.test(t) ? { id: t } : null), razorpay, razorpayWebhookSecret: SECRET })
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r) })
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => { await new Promise((r) => server.close(r)); await pg.close() })
beforeEach(() => { orders = []; failOrders = false })

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex')
let evtSeq = 0
async function webhook(event, payload, { secret = SECRET, id = 'evt_' + ++evtSeq, tamper = false } = {}) {
  const raw = JSON.stringify({ event, payload })
  const res = await fetch(base + '/api/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sign(raw, secret), 'X-Razorpay-Event-Id': id },
    body: tamper ? raw.replace('"amount":10000', '"amount":100') : raw,
  })
  return { status: res.status, json: await res.json() }
}
const captured = (order, payId, amount = 10000) => ({ payment: { entity: { id: payId, order_id: order, amount, currency: 'INR', method: 'upi' } } })

let n = 0
const newUser = async () => addUser(pg, '9196000' + String(10000 + n++))
const testId = async (title = 'Botany Sprint') => (await q('select id from public.tests where title = $1', [title]))[0].id
const unlocks = (uid) => q('select * from public.unlocks where user_id = $1', [uid])

describe('creating an order', () => {
  it('requires sign-in, uses the database price, and records a created payment', async () => {
    expect((await call(null, 'POST', '/api/payments/order', { testId: await testId() })).status).toBe(401)
    const u = await newUser()
    const t = await testId()
    const r = await call(u, 'POST', '/api/payments/order', { testId: t, amount: 1, price: 1 }) // client-supplied amount is ignored
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ amount: 10000, currency: 'INR', keyId: 'rzp_test_unit', testTitle: 'Botany Sprint' })
    expect(orders[0]).toMatchObject({ amountPaise: 10000, notes: { user_id: u, test_id: t } })
    const [p] = await q('select * from public.payments where user_id = $1', [u])
    expect(p).toMatchObject({ status: 'created', amount_paise: 10000, test_id: t, razorpay_order_id: r.json.orderId })
    expect(await unlocks(u)).toHaveLength(0)
  })
  it('refuses unknown or unpublished tests, bad input, provider errors and already-unlocked tests', async () => {
    const u = await newUser()
    const hidden = (await q(`insert into public.tests (title, published) values ('Hidden pay', false) returning id`))[0].id
    expect((await call(u, 'POST', '/api/payments/order', { testId: hidden })).status).toBe(404)
    expect((await call(u, 'POST', '/api/payments/order', { testId: 'nope' })).status).toBe(400)
    failOrders = true
    expect((await call(u, 'POST', '/api/payments/order', { testId: await testId() })).status).toBe(502)
    failOrders = false
    await q('insert into public.unlocks (user_id, test_id) values ($1, $2)', [u, await testId('Zoology Sprint')])
    expect((await call(u, 'POST', '/api/payments/order', { testId: await testId('Zoology Sprint') })).status).toBe(409)
  })
  it('limits order creation per hour', async () => {
    const u = await newUser()
    for (let i = 0; i < 10; i++) expect((await call(u, 'POST', '/api/payments/order', { testId: await testId() })).status).toBe(200)
    expect((await call(u, 'POST', '/api/payments/order', { testId: await testId() })).status).toBe(429)
  })
})

describe('the webhook is the only way to unlock', () => {
  async function order(u, title = 'Botany Sprint') {
    return (await call(u, 'POST', '/api/payments/order', { testId: await testId(title) })).json.orderId
  }

  it('does nothing without a valid signature', async () => {
    const u = await newUser()
    const o = await order(u)
    expect((await webhook('payment.captured', captured(o, 'pay_1'), { secret: 'wrong' })).status).toBe(400)
    const res = await fetch(base + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'payment.captured', payload: captured(o, 'pay_1') }) })
    expect(res.status).toBe(400)
    expect(await unlocks(u)).toHaveLength(0)
    expect((await call(u, 'GET', `/api/payments/status/${o}`)).json.status).toBe('created') // browser callback alone changes nothing
  })

  it('a verified payment.captured unlocks the test and marks the payment paid', async () => {
    const u = await newUser()
    const o = await order(u)
    const r = await webhook('payment.captured', captured(o, 'pay_ok1'))
    expect(r.json).toMatchObject({ ok: true, outcome: 'unlocked' })
    const [ul] = await unlocks(u)
    expect(ul).toMatchObject({ source: 'payment', test_id: await testId() })
    expect(ul.revoked_at).toBeNull()
    const [p] = await q('select * from public.payments where razorpay_order_id = $1', [o])
    expect(p).toMatchObject({ status: 'paid', razorpay_payment_id: 'pay_ok1', method: 'upi' })
    expect(ul.payment_id).toBe(p.id)
    expect((await call(u, 'GET', `/api/payments/status/${o}`)).json).toMatchObject({ status: 'paid' })
  })

  it('is idempotent: replayed events and order.paid after payment.captured change nothing', async () => {
    const u = await newUser()
    const o = await order(u)
    await webhook('payment.captured', captured(o, 'pay_idem'), { id: 'evt_fixed' })
    expect((await webhook('payment.captured', captured(o, 'pay_idem'), { id: 'evt_fixed' })).json.outcome).toBe('duplicate_event')
    expect((await webhook('order.paid', captured(o, 'pay_idem'))).json.outcome).toBe('already_paid')
    expect(await unlocks(u)).toHaveLength(1)
  })

  it('rejects an amount that does not match the order and ignores unknown orders', async () => {
    const u = await newUser()
    const o = await order(u)
    expect((await webhook('payment.captured', captured(o, 'pay_cheap', 100))).json.outcome).toBe('amount_mismatch')
    expect(await unlocks(u)).toHaveLength(0)
    expect((await webhook('payment.captured', captured('order_nope123', 'pay_x'))).json.outcome).toBe('unknown_order')
    // a later correct event for the same order still works (the mismatch did not mark it paid)
    expect((await webhook('payment.captured', captured(o, 'pay_real'))).json.outcome).toBe('unlocked')
  })

  it('payment.failed marks the order failed and unlocks nothing', async () => {
    const u = await newUser()
    const o = await order(u)
    await webhook('payment.failed', { payment: { entity: { id: 'pay_f', order_id: o } } })
    expect((await call(u, 'GET', `/api/payments/status/${o}`)).json.status).toBe('failed')
    expect(await unlocks(u)).toHaveLength(0)
  })

  it('refund.processed refunds the payment and revokes the unlock, so explanations lock again', async () => {
    const u = await newUser()
    const o = await order(u)
    await webhook('payment.captured', captured(o, 'pay_ref'))
    await webhook('refund.processed', { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_ref' } } })
    const [p] = await q('select * from public.payments where razorpay_order_id = $1', [o])
    expect(p).toMatchObject({ status: 'refunded', refund_id: 'rfnd_1' })
    expect((await unlocks(u))[0].revoked_at).not.toBeNull()
    expect((await q('select private.has_paid_access($1, (select question_id from public.test_questions where test_id = $2 limit 1)) b', [u, await testId()]))[0].b).toBe(false)
    // can buy again after a refund
    expect((await call(u, 'POST', '/api/payments/order', { testId: await testId() })).status).toBe(200)
  })

  it("one student cannot read another student's order status", async () => {
    const a = await newUser(), b = await newUser()
    const o = await order(a)
    expect((await call(b, 'GET', `/api/payments/status/${o}`)).status).toBe(404)
  })
})

describe('payment rows and refund flags (RLS)', () => {
  const as = (uid) => (fn) => asRole(pg, { sub: uid }, fn)
  it('students read only their own payments and cannot write; only admins flag refunds', async () => {
    const a = await newUser(), b = await newUser()
    const admin = await addUser(pg, '9196999' + (10000 + n++), 'admin')
    const teacher = await addUser(pg, '9196998' + (10000 + n++), 'teacher')
    const oa = (await call(a, 'POST', '/api/payments/order', { testId: await testId() })).json.orderId
    await call(b, 'POST', '/api/payments/order', { testId: await testId() })
    await webhook('payment.captured', captured(oa, 'pay_rls'))
    const mine = await as(a)((tx) => tx.query('select razorpay_order_id from public.payments').then((r) => r.rows))
    expect(mine).toEqual([{ razorpay_order_id: oa }])
    await expect(as(a)((tx) => tx.query(`update public.payments set status = 'paid'`))).rejects.toThrow(/permission denied/)
    await expect(as(a)((tx) => tx.query(`insert into public.payments (user_id, amount_paise, razorpay_order_id) values ($1, 1, 'x')`, [a]))).rejects.toThrow(/permission denied/)
    await expect(as(a)((tx) => tx.query(`insert into public.unlocks (user_id, test_id) values ($1, $2)`, [a, null]))).rejects.toThrow(/permission denied/)
    const pid = (await q('select id from public.payments where razorpay_order_id = $1', [oa]))[0].id
    await expect(as(a)((tx) => tx.query('select public.admin_flag_refund($1, true, $2)', [pid, 'x']))).rejects.toThrow(/forbidden/)
    await expect(as(teacher)((tx) => tx.query('select public.admin_flag_refund($1, true, $2)', [pid, 'x']))).rejects.toThrow(/forbidden/)
    await as(admin)((tx) => tx.query('select public.admin_flag_refund($1, true, $2)', [pid, 'Duplicate charge']))
    expect((await q('select refund_flag, refund_note, refund_flagged_by from public.payments where id = $1', [pid]))[0]).toMatchObject({ refund_flag: true, refund_note: 'Duplicate charge', refund_flagged_by: admin })
    expect((await as(admin)((tx) => tx.query('select id from public.payments').then((r) => r.rows))).length).toBeGreaterThanOrEqual(2)
    await as(admin)((tx) => tx.query('select public.admin_flag_refund($1, false)', [pid]))
    expect((await q('select refund_flag from public.payments where id = $1', [pid]))[0].refund_flag).toBe(false)
  })
})
