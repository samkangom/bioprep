import crypto from 'node:crypto'
import { expect } from '@playwright/test'

export const API = 'http://127.0.0.1:8799'
export const WEBHOOK_SECRET = 'dev-webhook-secret' // dev/stack.js DEV_WEBHOOK_SECRET
let n = 0
export const newPhone = () => `98${String(Date.now()).slice(-6)}${String(10 + (n++ % 90))}`.slice(0, 10)

// Razorpay Checkout stand-in. Like the real widget it calls `handler` after payment, and that callback proves nothing:
// only the signed webhook (sent by the test, as Razorpay would) unlocks the test.
export const RAZORPAY_STUB = `
  window.Razorpay = function (o) {
    this.on = function () {}
    this.open = function () { window.__order = o.order_id; setTimeout(function () { o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: 'pay_e2e', razorpay_signature: 'not-trusted' }) }, 200) }
  }`

export async function sendWebhook(event, payload) {
  const raw = JSON.stringify({ event, payload })
  const res = await fetch(API + '/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'), 'X-Razorpay-Event-Id': 'evt_' + crypto.randomUUID() },
    body: raw,
  })
  return res.json()
}

export async function signIn(page, { phone = newPhone(), name = 'Asha', dob = '2000-05-20', guardian } = {}) {
  await page.goto('/')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Date of birth').fill(dob)
  if (guardian) {
    await page.getByLabel('Their full name').fill(guardian.name)
    await page.getByLabel('Their mobile number').fill(guardian.phone)
    await page.getByLabel(/I am this student's parent/).check()
  }
  await page.getByLabel(/I have read the/).check()
  await page.getByRole('button', { name: 'Start preparing' }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`Hello, ${name}`) })).toBeVisible()
  return phone
}

export async function takeTest(page, title, answerFirst = true) {
  await page.locator('article', { hasText: title }).getByRole('button', { name: 'Start test' }).click()
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByRole('button', { name: 'Submit' }).first()).toBeVisible()
  if (answerFirst) await page.locator('.opt').nth(1).click()
  await page.getByRole('button', { name: 'Submit' }).first().click()
  await page.getByRole('button', { name: 'Submit now' }).click()
  await expect(page.getByText('Review answers')).toBeVisible()
}

/** Finish the tutor session by tapping the answer option for each guiding question. */
export async function finishWithChoices(page, taps) {
  for (const label of taps) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}
