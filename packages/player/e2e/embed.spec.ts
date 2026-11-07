/**
 * <frotz-play> under a strict Content-Security-Policy (docs/15 §1, design §2): script-src 'self',
 * style-src 'self'. It plays, its dialogs work, its styles apply, and nothing is blocked.
 */
import { expect, test } from '@playwright/test'

test('<frotz-play> plays under script-src \'self\'; style-src \'self\', with no CSP violation', async ({ page }) => {
  const violations: string[] = []
  page.on('console', m => {
    if (/Content[- ]Security[- ]Policy|violates/i.test(m.text())) violations.push(m.text())
  })
  page.on('pageerror', e => violations.push(String(e)))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`Content-Security-Policy violation: ${e.violatedDirective} ${e.blockedURI}`))
  })
  await page.goto('http://localhost:4182/')

  const input = page.getByRole('textbox', { name: 'Command' })
  await expect(input).toBeVisible()
  // Its styles are applied (adopted, not injected): the dark ground, the amber Enter button.
  const ground = await page.locator('frotz-play').evaluate(el => getComputedStyle(el.shadowRoot!.querySelector('.zp')!).backgroundColor)
  expect(ground).toBe('rgb(14, 17, 22)')
  expect(await page.locator('frotz-play').evaluate(el => el.shadowRoot!.querySelectorAll('style').length)).toBe(0)

  await input.fill('take lantern')
  await input.press('Enter')
  await expect(page.locator('frotz-play .zp-turn').last()).toContainText('Taken.')

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('radio', { name: 'Light' }).check()
  await page.keyboard.press('Escape')
  expect(await page.locator('frotz-play').evaluate(el => getComputedStyle(el.shadowRoot!.querySelector('.zp')!).backgroundColor)).toBe('rgb(243, 241, 234)')

  expect(violations).toEqual([])
})
