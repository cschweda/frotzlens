import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Console errors and CSP violations, collected for the whole test. */
function errorsOf(page: Page) {
  const errors: string[] = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('the page loads in the family shell, dark, with no errors and no axe violations', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'A debugger for Z-machine stories' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('banner').getByRole('link', { name: /frotztrace/ })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await axe(page)
  expect(errors).toEqual([])
})

test('light mode passes axe too', async ({ page }) => {
  const errors = errorsOf(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // As frotzlens's test: switch to light, and measure only once the page's ground is the light one.
  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
  await page.waitForFunction(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--frotz-ground)'
    document.body.append(probe)
    const ground = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(document.body).backgroundColor === ground
  })
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
  await axe(page)
  expect(errors).toEqual([])
})

test('works at 400px, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('robots.txt, sitemap.xml and the social card are served', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://frotztrace.frotzinc.com/sitemap.xml')
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://frotztrace.frotzinc.com/</loc>')
  expect((await request.get('/og-image.png')).headers()['content-type']).toBe('image/png')
})
