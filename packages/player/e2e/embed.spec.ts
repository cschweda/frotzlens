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
  // Its styles are applied (adopted, not injected): the dark paper page.
  const ground = await page.locator('frotz-play').evaluate(el => getComputedStyle(el.shadowRoot!.querySelector('.zp')!).backgroundColor)
  expect(ground).toBe('rgb(33, 29, 22)')
  expect(await page.locator('frotz-play').evaluate(el => el.shadowRoot!.querySelectorAll('style').length)).toBe(0)

  await input.fill('take lantern')
  await input.press('Enter')
  await expect(page.locator('frotz-play .zp-turn').last()).toContainText('Taken.')

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('radio', { name: 'Light' }).check()
  await page.keyboard.press('Escape')
  expect(await page.locator('frotz-play').evaluate(el => getComputedStyle(el.shadowRoot!.querySelector('.zp')!).backgroundColor)).toBe('rgb(244, 236, 216)')

  expect(violations).toEqual([])
})

test('<frotz-play> takes commands from its host: send(), press(), started and status events, theme', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(() => {
    const w = window as unknown as { heard: { type: string; detail: unknown }[] }
    w.heard = []
    for (const type of ['started', 'status', 'turn']) document.addEventListener(type, e => w.heard.push({ type, detail: (e as CustomEvent).detail }), true)
  })
  await page.goto('http://localhost:4182/')
  await expect(page.getByRole('textbox', { name: 'Command' })).toBeVisible()

  const result = await page.locator('frotz-play').evaluate(async el => {
    const fp = el as HTMLElement & { send(l: string): Promise<boolean>; press(k: string): Promise<boolean> }
    const pressed = await fp.press('Enter')
    const sent = await fp.send('take lantern')
    return { pressed, sent }
  })
  expect(result).toEqual({ pressed: false, sent: true })
  await expect(page.locator('frotz-play .zp-turn').last()).toContainText('Taken.')

  const heard = await page.evaluate(() => (window as unknown as { heard: { type: string; detail: unknown[] }[] }).heard)
  expect(heard.filter(h => h.type === 'started')).toHaveLength(1)
  expect(heard.some(h => h.type === 'status' && (h.detail[0] as { left: string }).left.length > 0)).toBe(true)
  expect(heard.filter(h => h.type === 'turn').at(-1)!.detail[0]).toMatchObject({ command: 'take lantern', fed: true })

  // theme="light" from the host.
  await page.locator('frotz-play').evaluate(el => el.setAttribute('theme', 'light'))
  await expect.poll(() => page.locator('frotz-play').evaluate(el => getComputedStyle(el.shadowRoot!.querySelector('.zp')!).backgroundColor)).toBe('rgb(244, 236, 216)')
  expect(errors).toEqual([])
})
