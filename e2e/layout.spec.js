import { test, expect } from '@playwright/test'
import { signIn, takeTest } from './helpers.js'

// Layout checks at phone width (390px): no horizontal scrolling, and tap targets of at least 44px.
const overflow = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
async function smallTargets(page) {
  return page.evaluate(() => {
    const out = []
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]') }
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not([type=file]), textarea, [role=button]')) {
      if (!vis(el)) continue
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const lab = el.closest('label')
        if (lab && lab.getBoundingClientRect().height >= 44) continue
      }
      // inline links inside a paragraph are exempt (WCAG 2.5.8 inline exception)
      if (el.tagName === 'A' && el.closest('p, li, span.row, label')) continue
      const r = el.getBoundingClientRect()
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  })
}

test.describe('phone layout', () => {
  test.skip(({ viewport }) => viewport.width > 500, 'phone project only')

  test('sign-in, home, test, result, solution, profile and privacy fit 390px and have 44px tap targets', async ({ page }) => {
    const report = {}
    const check = async (name) => {
      const o = await overflow(page)
      expect(o.scroll, `${name}: horizontal overflow (${o.scroll} > ${o.inner})`).toBeLessThanOrEqual(o.inner)
      report[name] = await smallTargets(page)
    }
    await page.goto('/')
    await check('sign-in')
    await signIn(page, { name: 'Mina' })
    await check('home')
    await takeTest(page, 'Botany Sprint')
    await check('result')
    await page.getByRole('button', { name: 'Explain' }).nth(0).click()
    await expect(page.getByText('Think it through')).toBeVisible()
    await check('solution')
    await page.getByRole('button', { name: 'Mina' }).click()
    await expect(page.getByRole('heading', { name: 'Mina' })).toBeVisible()
    await check('profile')
    await page.locator('.footer').getByRole('button', { name: 'Privacy policy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
    await check('privacy')
    const bad = Object.entries(report).filter(([, v]) => v.length)
    expect(bad, 'controls smaller than 44px:\n' + bad.map(([k, v]) => `${k}: ${v.join('; ')}`).join('\n')).toEqual([])
  })

  test('the running test screen fits 390px', async ({ page }) => {
    await signIn(page, { name: 'Mina' })
    await page.locator('article', { hasText: 'Botany Sprint' }).getByRole('button', { name: 'Start test' }).click()
    await page.getByRole('button', { name: 'Start test' }).click()
    await expect(page.getByRole('timer', { name: 'Time left' })).toBeVisible()
    const o = await overflow(page)
    expect(o.scroll).toBeLessThanOrEqual(o.inner)
    const small = await smallTargets(page)
    expect(small, 'controls smaller than 44px: ' + small.join('; ')).toEqual([])
  })
})
