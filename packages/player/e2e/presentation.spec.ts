/** Contract statements R1–R6 (docs/accessibility.md): themes, contrast, zoom, reflow, spacing, motion, fonts. */
import { expect, test } from '@playwright/test'
import { axe, open, openSettings, play } from './helpers'

test('R1: dark by default, every piece of text at 7:1 or better (axe, AAA contrast)', async ({ page }) => {
  await open(page)
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'dark')
  await play(page, 'look')
  await axe(page, { aaaContrast: true })
})

test('R2: light (AA) and high contrast (AAA) themes; the choice is remembered', async ({ page }) => {
  await open(page)
  await openSettings(page)
  await page.getByRole('radio', { name: 'Light' }).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'light')
  await axe(page)
  await openSettings(page)
  await page.getByRole('radio', { name: 'High contrast' }).check()
  await page.keyboard.press('Escape')
  await axe(page, { aaaContrast: true })
  await page.reload()
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'high-contrast')
})

test('R3: at 200% text and at 320 px, nothing is lost and nothing scrolls sideways', async ({ page }) => {
  await open(page)
  await openSettings(page)
  await page.getByRole('group', { name: 'Text size' }).getByRole('radio', { name: '200%' }).check()
  await page.keyboard.press('Escape')
  await play(page, 'look')
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(sideways, `${width}px`).toBe(false)
    for (const name of ['Enter', 'Undo', 'Settings']) {
      const b = page.getByRole('button', { name, exact: true })
      await b.scrollIntoViewIfNeeded()
      await expect(b).toBeInViewport()
    }
  }
})

test('R4: WCAG 1.4.12 text spacing loses nothing', async ({ page }) => {
  await open(page)
  await page.addStyleTag({
    content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
  })
  await play(page, 'look')
  const clipped = await page.evaluate(() =>
    // (Visually hidden labels are clipped on purpose.)
    [...document.querySelectorAll('.zp button, .zp label:not(.zp-sr), .zp .zp-statusbar')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent),
  )
  expect(clipped).toEqual([])
})

test('R5: reduced motion and more contrast are honoured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  expect(await page.locator('.zp-story').evaluate(el => getComputedStyle(el).scrollBehavior)).toBe('auto')
  await page.emulateMedia({ contrast: 'more' })
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'high-contrast')
})

test('R6: the OpenDyslexic and monospace fonts apply', async ({ page }) => {
  await open(page)
  await openSettings(page)
  await page.getByRole('radio', { name: 'OpenDyslexic' }).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('.zp')).toHaveAttribute('data-font', 'dyslexic')
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px OpenDyslexic'))).toBe(true)
  await expect.poll(() => page.locator('.zp-out').first().evaluate(el => getComputedStyle(el).fontFamily)).toContain('OpenDyslexic')
  await openSettings(page)
  await page.getByRole('radio', { name: 'Monospace' }).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('.zp')).toHaveAttribute('data-font', 'mono')
})
