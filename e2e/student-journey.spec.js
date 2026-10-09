import { test, expect } from '@playwright/test'
import { signIn, takeTest, finishWithChoices, sendWebhook, RAZORPAY_STUB } from './helpers.js'

// The full student path: sign in, take a test, submit, open an explanation, finish the tutor session,
// hit the paywall, pay in test mode, see the unlocked solution.
test('student journey: sign in to unlocked solution', async ({ page, context }) => {
  await context.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'text/javascript', body: RAZORPAY_STUB }))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  // 1. sign in (first-time: phone, code, about you)
  await signIn(page, { name: 'Asha' })

  // 2-3. take Botany Sprint, answer Q1, submit
  await takeTest(page, 'Botany Sprint')
  await expect(page.getByText('Score', { exact: true })).toBeVisible()

  // 4. open the first explanation. The answer must not be shown before the tutor session ends.
  await page.getByRole('button', { name: 'Explain' }).nth(0).click()
  await expect(page.getByText('Think it through')).toBeVisible()
  await expect(page.getByText('Video unlocks after the tutor session')).toBeVisible()
  await expect(page.getByText('Correct', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/^Answer: /)).toHaveCount(0)

  // 5. finish the tutor session with the tap-to-answer choices
  await finishWithChoices(page, ['The wavelength of light it absorbs best', 'PS II'])
  await expect(page.getByText('Answer: B. 680 nm')).toBeVisible()
  await expect(page.getByText('Correct', { exact: true })).toBeVisible()
  await expect(page.locator('.pill:visible', { hasText: 'Free explanations left: 1' }).first()).toBeVisible()

  // the second free explanation (skip straight to the answer)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Show me the answer' }).click()
  await expect(page.getByText(/Answer: B\. Phosphoenolpyruvate/)).toBeVisible()

  // 6. the third hits the paywall
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('You have used your free explanations')).toBeVisible()
  await page.getByRole('button', { name: /Unlock for/ }).click()
  await expect(page.getByRole('dialog', { name: 'Unlock full solutions' })).toBeVisible()

  // 7. pay in test mode. The browser callback alone must not unlock anything.
  await page.getByRole('button', { name: /Pay ₹100 with UPI or card/ }).click()
  await expect(page.getByText('Confirming your payment…')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Payment successful' })).toHaveCount(0)
  const order = await page.evaluate(() => window.__order)
  expect(order).toMatch(/^order_/)
  const payId = 'pay_e2e_' + order
  expect(await sendWebhook('payment.captured', { payment: { entity: { id: payId, order_id: order, amount: 10000, currency: 'INR', method: 'upi' } } })).toMatchObject({ outcome: 'unlocked' })
  await expect(page.getByText('Payment successful')).toBeVisible()
  await expect(page.getByText('(test mode)')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 8. the unlocked solution: the tutor opens, and a paid student can skip to the video
  await expect(page.getByText('Think it through')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip to video' })).toBeVisible()
  await page.getByRole('button', { name: 'Show me the answer' }).click()
  await expect(page.getByText(/^Answer: /)).toBeVisible()

  // payment history shows the payment
  await page.getByRole('button', { name: 'Asha' }).click()
  await page.getByRole('button', { name: 'Payment history' }).click()
  await expect(page.getByRole('row', { name: new RegExp(`Botany Sprint ₹100 Paid ${payId}`) })).toBeVisible()
  expect(errors).toEqual([])
})
