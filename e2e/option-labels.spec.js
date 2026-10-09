import { test, expect } from '@playwright/test'
import { signIn, takeTest, newPhone } from './helpers.js'

test('admin changes option labels to i, ii, iii, iv and students see them everywhere', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage()
  await admin.goto('/')
  await admin.getByLabel('Mobile number').fill('9999999999')
  await admin.getByRole('button', { name: 'Send code' }).click()
  await admin.getByLabel('6-digit code').fill('123456')
  await admin.getByRole('button', { name: 'Verify and continue' }).click()
  await admin.getByRole('button', { name: 'Question bank' }).click()
  await admin.getByRole('row', { name: /pacemaker of the human heart/ }).getByRole('button', { name: 'Edit' }).click()
  await admin.getByLabel('Option labels').selectOption('roman')
  await expect(admin.getByLabel('Option iii is correct')).toBeVisible()
  await admin.getByRole('button', { name: 'Publish' }).click()
  await admin.getByText('Question published.').waitFor()

  const st = await (await browser.newContext()).newPage()
  await signIn(st, { phone: newPhone(), name: 'Lab' })
  await st.locator('article', { hasText: 'Zoology Sprint' }).getByRole('button', { name: 'Start test' }).click()
  await st.getByRole('button', { name: 'Start test' }).click()
  await st.getByRole('button', { name: /^Question 5$/ }).click()
  const letters = await st.locator('.opt .letter').allInnerTexts()
  expect(letters).toEqual(['i', 'ii', 'iii', 'iv'])
  await st.locator('.opt').nth(1).click()
  await st.getByRole('button', { name: 'Submit' }).first().click()
  await st.getByRole('button', { name: 'Submit now' }).click()
  await expect(st.getByText('ii. SA node')).toBeVisible() // the review table uses the same labels
  await st.getByRole('button', { name: 'Explain' }).nth(4).click()
  await st.getByRole('button', { name: 'Show me the answer' }).click()
  await expect(st.getByText('Answer: ii. SA node')).toBeVisible()
  await expect(st.locator('.opt .letter').allInnerTexts()).resolves.toEqual(['i', 'ii', 'iii', 'iv'])
})
