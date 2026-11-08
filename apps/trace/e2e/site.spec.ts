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

test('About → Report a problem sends by email through the site’s report function', async ({ page }) => {
  const errors = errorsOf(page)
  let posted: Record<string, unknown> | undefined
  // The static test server has no functions: stand in for netlify/functions/report.mjs.
  await page.route('**/.netlify/functions/report', async (route) => {
    posted = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: 'About' }).click()
  await page.getByRole('menuitem', { name: 'Report a problem…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Report a problem' })
  await dialog.getByLabel('Title').fill('A test')
  await dialog.getByLabel('What happened').fill('Nothing, this is a test.')
  await dialog.getByLabel('Your email, for a reply (optional)').fill('reader@example.org')
  await axe(page)
  await page.waitForTimeout(3100) // the function refuses a form filled in under three seconds
  await dialog.getByRole('button', { name: 'Send' }).click()
  // The form gives way to a confirmation, with the focus on it, and a toast says so too.
  await expect(dialog.getByRole('heading', { name: 'Sent' })).toBeFocused()
  await expect(dialog.getByRole('status')).toContainText('Your report went to frotztrace’s maker by email. Thank you.')
  await expect(dialog.getByRole('status')).toContainText('A reply, if one’s needed, will go to reader@example.org.')
  await expect(page.getByText('Report sent')).toBeVisible()
  await axe(page)
  expect(posted).toMatchObject({ kind: 'problem', title: 'A test', happened: 'Nothing, this is a test.', replyTo: 'reader@example.org', website: '' })
  expect(Number(posted?.elapsed)).toBeGreaterThanOrEqual(3000)
  // Send another brings back an empty form.
  await dialog.getByRole('button', { name: 'Send another' }).click()
  await expect(dialog.getByLabel('What happened')).toHaveValue('')
  expect(errors).toEqual([])
})

test('a report the site can’t send says so, and GitHub stays the way', async ({ page }) => {
  await page.route('**/.netlify/functions/report', route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Reports by email aren’t set up on this site."}' }))
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: 'About' }).click()
  await page.getByRole('menuitem', { name: 'Suggest a feature…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest a feature' })
  await dialog.getByLabel('What you’d like').fill('An idea.')
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog.getByRole('alert')).toContainText('aren’t set up on this site. Nothing was sent. You can open it on GitHub instead.')
  await expect(dialog.getByRole('heading', { name: 'Sent' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Open on GitHub' })).toBeEnabled()
})
