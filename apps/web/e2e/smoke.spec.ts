/**
 * Phase 4's exit criterion, as a test: open architect-legacy.z5 and navigate
 * every view, with axe (WCAG 2.2 AA) on each and no console errors — against
 * the built site, served with the production CSP.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const STORY = fileURLToPath(new URL('../../../samples/architect-legacy.z5', import.meta.url))
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Console errors and uncaught exceptions, collected for the whole test. */
function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

async function axe(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(violations.map(v => `${what}: ${v.id} (${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')})`)).toEqual([])
}

async function open(page: Page) {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(STORY)
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

const go = (page: Page, hash: string) => page.evaluate(h => { location.hash = h }, hash)

/** Go to a view and wait for its title (every view has one h1). */
async function visit(page: Page, hash: string) {
  await go(page, hash)
  await expect(page).toHaveURL(new RegExp(`${hash}$`))
  await expect(page.locator('main h1')).toBeVisible()
}

test('the sample opens at the Overview', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await axe(page, 'drop zone')
  await page.getByRole('button', { name: 'Try a sample' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await expect(page.getByText('dark-cellar.z5').first()).toBeVisible()
  await axe(page, 'overview')
  expect(errors).toEqual([])
})

test('every view of architect-legacy.z5', async ({ page }) => {
  const errors = watchConsole(page)
  await open(page)

  // The object tree renders, and works from the keyboard.
  await page.getByRole('link', { name: /^Objects/ }).click()
  const tree = page.getByRole('tree', { name: 'Object tree' })
  await expect(tree.getByRole('treeitem').first()).toBeVisible()
  expect(await tree.getByRole('treeitem').count()).toBeGreaterThan(10)
  await axe(page, 'objects')
  await tree.locator('[role=treeitem][tabindex="0"]').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#object\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Attributes' })).toBeVisible()
  await axe(page, 'an object')

  for (const [hash, heading] of [
    ['#memory', 'Memory'],
    ['#memory/dictionary', /^Dictionary/],
    ['#dictionary', 'Dictionary'],
    ['#grammar', 'Grammar'],
    ['#routines', 'Routines'],
    ['#strings', 'Strings'],
  ] as const) {
    await go(page, hash)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await axe(page, hash)
  }

  // A routine's disassembly links what it calls; following one opens that routine.
  await go(page, '#routines')
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^[1-9]\d*$/ }) }).nth(20).getByRole('link').click()
  const listing = page.getByRole('region', { name: 'Disassembly' })
  await expect(listing).toBeVisible()
  await axe(page, 'a routine')
  const call = listing.locator('a[href^="#routine/"]:not([aria-label])').first()
  const target = await call.getAttribute('href')
  await call.click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
  await expect(page.getByRole('heading', { level: 1, name: /^Routine R\d{4}$/ })).toBeVisible()

  // Memory: an unknown part is "Nothing here"; a bad address says why instead of jumping.
  await visit(page, '#memory/typo')
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible()
  await visit(page, '#memory')
  await page.getByLabel('Go to address').fill('1c97zz')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("isn't a hex address")

  // A dictionary word, and a string, each with their referrers.
  await go(page, '#dictionary')
  await page.getByRole('cell').getByRole('link').nth(30).click()
  await expect(page.getByRole('heading', { name: 'Referred to from' })).toBeVisible()
  await axe(page, 'a word')
  await go(page, '#strings')
  await page.getByRole('cell').getByRole('link').first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'String S001' })).toBeVisible()
  await axe(page, 'a string')

  expect(errors).toEqual([])
})

test('works at 400px', async ({ page }) => {
  const errors = watchConsole(page)
  await page.setViewportSize({ width: 400, height: 860 })
  await open(page)
  for (const hash of ['#overview', '#objects', '#routines', '#memory']) {
    await visit(page, hash)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), hash).toBe(0)
    await axe(page, `${hash} at 400px`)
  }
  expect(errors).toEqual([])
})

test('light mode passes axe too', async ({ page }) => {
  const errors = watchConsole(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
  // Measure contrast only once the switch has finished: the page's ground is the light one.
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(243, 241, 234)')
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
  for (const hash of ['#overview', '#memory', '#objects', '#object/10', '#grammar', '#routines', '#strings']) {
    await visit(page, hash)
    await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
    await axe(page, `${hash} (light)`)
  }
  expect(errors).toEqual([])
})
