/**
 * Phase 4's exit criterion, as a test: open architect-legacy.z5 and navigate
 * every view, with axe (WCAG 2.2 AA) on each and no console errors — against
 * the built site, served with the production CSP.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const STORY = fileURLToPath(new URL('../../../samples/architect-legacy.z5', import.meta.url))
// A story with its debug file: zcode's test fixtures (built by its tests, which CI runs first).
const FIXTURES = fileURLToPath(new URL('../../../packages/zcode/test/.fixtures/', import.meta.url))
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Console errors and uncaught exceptions, collected for the whole test. */
function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

async function axe(page: Page, what: string) {
  // Contrast is measured on the settled page, not mid-way through a dialog's fade-in.
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
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

test('symbols: a debug file names things, and draws the map', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(`${FIXTURES}mingus-1.z5`)
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Standard Library 6.12.8')).toBeVisible()

  // One from another story is refused.
  await visit(page, '#symbols')
  await axe(page, 'symbols, none loaded')
  await page.locator('input[accept=".dbg"]').setInputFiles(`${FIXTURES}demo.dbg`)
  await expect(page.getByRole('alert')).toContainText('written for another story file')

  // Its own is taken: routines, globals and the map have names.
  await page.locator('input[accept=".dbg"]').setInputFiles(`${FIXTURES}mingus-1.dbg`)
  await expect(page.getByText('written for this story file')).toBeVisible()
  await axe(page, 'symbols, loaded')
  await visit(page, '#routines')
  await page.getByRole('textbox', { name: 'Filter routines' }).fill('Initialise')
  await expect(page.getByRole('link', { name: 'Initialise', exact: true })).toBeVisible()
  await visit(page, '#globals')
  await page.getByRole('link', { name: 'location', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'location' })).toBeVisible()
  await axe(page, 'a global')
  await visit(page, '#map')
  await expect(page.getByText(/^19 rooms; the game starts in Wind-Scoured Mesa/)).toBeVisible()
  await expect(page.getByRole('group', { name: /A map of 19 rooms/ })).toBeVisible()
  await axe(page, 'the map')
  await visit(page, '#abbreviations')
  await axe(page, 'abbreviations')
  await visit(page, '#source')
  await expect(page.getByRole('heading', { level: 1, name: 'Inform 6 source' })).toBeVisible()
  await expect(page.locator('main').getByText('In progress', { exact: true }).first()).toBeVisible()
  await axe(page, 'source')

  // Names off: txd's numbers again.
  await page.getByRole('button', { name: 'Names' }).click()
  await expect(page.getByRole('button', { name: 'Names' })).toHaveAttribute('aria-pressed', 'false')
  await visit(page, '#routines')
  await page.getByRole('textbox', { name: 'Filter routines' }).fill('Initialise')
  await expect(page.getByText('No routine')).toBeVisible()
  expect(errors).toEqual([])
})

test('play: the sample runs in the sandboxed player, and a command gets an answer', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await page.getByRole('link', { name: 'Play the game' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Play' })).toBeVisible()
  await axe(page, 'play, not started')
  await page.getByRole('button', { name: /^Play dark-cellar/ }).click()
  const iframe = page.locator('iframe[title$="playing in Parchment"]')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  const game = page.frameLocator('iframe[title$="playing in Parchment"]')
  await expect(game.locator('.BufferWindow')).toContainText('THE DARK CELLAR')
  // A command only the running game can answer: the lantern is in the Hall.
  await game.locator('input.LineInput').fill('take lantern')
  await game.locator('input.LineInput').press('Enter')
  await expect(game.locator('.BufferWindow')).toContainText('Taken.')
  // The game can't reach Frotzlens: its origin is opaque.
  expect(await page.frames().find(f => f.url().includes('/play/index.html'))!.evaluate(() => window.origin)).toBe('null')
  expect(errors).toEqual([])
})

test('the About menu: versions and licences, the changelog, reports, updates', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'About', exact: true })

  await menu.click()
  await page.getByRole('menuitem', { name: 'About Frotzlens' }).click()
  const about = page.getByRole('dialog', { name: 'About Frotzlens' })
  await expect(about).toContainText(/Frotzlens\s*0\.\d+\.\d+/)
  await expect(about).toContainText('@frotzinc/zcode')
  await expect(about.getByRole('link', { name: 'GPL-3.0-or-later' })).toBeVisible()
  await axe(page, 'about')
  await page.keyboard.press('Escape')

  // The footer's Changelog opens the changelog.
  await page.getByRole('button', { name: 'Changelog' }).click()
  const log = page.getByRole('dialog', { name: 'What’s new' })
  await expect(log.getByRole('heading', { name: /0\.1\.0/ })).toBeVisible()
  await axe(page, 'changelog')
  await page.keyboard.press('Escape')

  // A problem report opens GitHub's form, filled in; nothing is sent from the page.
  await menu.click()
  await page.getByRole('menuitem', { name: 'Report a problem…' }).click()
  const report = page.getByRole('dialog', { name: 'Report a problem' })
  await report.getByLabel('Title').fill('A title')
  await report.getByLabel('What happened').fill('It broke')
  await axe(page, 'report')
  // The link the page opens, caught before it goes anywhere (the test never visits GitHub).
  await page.evaluate(() => {
    window.open = (u?: string | URL) => {
      ;(window as unknown as { opened: string }).opened = String(u)
      return null
    }
  })
  await report.getByRole('button', { name: 'Open on GitHub' }).click()
  // After the report is copied to the clipboard, the link opens.
  const opened = await page.waitForFunction(() => (window as unknown as { opened?: string }).opened)
  const url = new URL(String(await opened.jsonValue()))
  expect(url.origin + url.pathname).toBe('https://github.com/cschweda/frotzlens/issues/new')
  expect(url.searchParams.get('template')).toBe('bug.yml')
  expect(url.searchParams.get('what-happened')).toBe('It broke')
  expect(url.searchParams.get('version')).toMatch(/^Frotzlens 0\.\d+\.\d+/)
  await page.keyboard.press('Escape')

  // Check for updates: this build is the live one.
  await menu.click()
  await page.getByRole('menuitem', { name: 'Check for updates' }).click()
  await expect(page.getByText(/is the latest/).first()).toBeVisible()
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
  // The narrowest common phone: the header's buttons still fit.
  await page.setViewportSize({ width: 320, height: 700 })
  await visit(page, '#overview')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'at 320px').toBe(0)
  expect(errors).toEqual([])
})

test('light mode passes axe too', async ({ page }) => {
  const errors = watchConsole(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
  // Measure contrast only once the switch has finished: the page's ground is the light one.
  await page.waitForFunction(() => {
    // The body has settled on the palette's ground (now the light one), read from the token through a probe.
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--frotz-ground)'
    document.body.append(probe)
    const ground = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(document.body).backgroundColor === ground
  })
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
  for (const hash of ['#overview', '#memory', '#objects', '#object/10', '#grammar', '#routines', '#strings']) {
    await visit(page, hash)
    await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
    await axe(page, `${hash} (light)`)
  }
  expect(errors).toEqual([])
})
