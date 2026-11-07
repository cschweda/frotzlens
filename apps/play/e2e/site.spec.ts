/**
 * frotzplay's site (docs/14 §6), against the built site served with netlify.toml's headers: every
 * way a story arrives, its errors in words, Blorb, the theme, the shell, axe, and no CSP violations.
 */
import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const sample = (f: string) => readFileSync(new URL(`../../../samples/${f}`, import.meta.url))

/** Every test fails on a CSP violation or an uncaught error. */
test.beforeEach(async ({ page }) => {
  const problems: string[] = []
  page.on('console', m => {
    if (/Content[- ]Security[- ]Policy|violates the following/i.test(m.text())) problems.push(m.text())
  })
  page.on('pageerror', e => problems.push(String(e)))
  ;(page as unknown as { __problems: string[] }).__problems = problems
})
test.afterEach(async ({ page }) => {
  expect((page as unknown as { __problems: string[] }).__problems).toEqual([])
})

async function waitToPlay(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Command' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Enter' })).toBeEnabled()
}

async function playTurn(page: Page, command = 'look') {
  const turns = page.locator('.zp-turn')
  const n = await turns.count()
  await page.getByRole('textbox', { name: 'Command' }).fill(command)
  await page.keyboard.press('Enter')
  await expect(turns).toHaveCount(n + 1)
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('the start page: what it is, the drop zone, the samples, Parchment; axe', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/frotzplay/)
  await expect(page.getByRole('heading', { level: 1, name: 'Play a Z-machine story' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose a file' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Try a sample' })).toBeVisible()
  for (const t of ['The Dark Cellar', 'The Locked Chest', 'The Hermit', 'Magic 8-Ball']) await expect(page.getByRole('button', { name: new RegExp(t) })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Parchment' })).toHaveAttribute('href', 'https://iplayif.com')
  await axe(page)
})

test('each sample opens and plays; the address says which', async ({ page }) => {
  for (const [id, title] of [['dark-cellar', 'The Dark Cellar'], ['locked-chest', 'The Locked Chest'], ['hermit', 'The Hermit'], ['magic-8-ball', 'Magic 8-Ball']]) {
    await page.goto('/')
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await waitToPlay(page)
    await expect(page).toHaveTitle(`${title} — frotzplay`)
    await expect(page).toHaveURL(new RegExp(`\\?sample=${id}`))
    await playTurn(page)
  }
  await axe(page)
})

test('?sample= opens straight away; an unknown one says so', async ({ page }) => {
  await page.goto('/?sample=hermit&seed=3')
  await waitToPlay(page)
  await expect(page).toHaveTitle('The Hermit — frotzplay')
  await page.goto('/?sample=nope')
  await expect(page.getByRole('alert')).toContainText('There’s no sample called “nope”')
})

test('a chosen file plays; a file that isn’t a story, or is Glulx, says why', async ({ page }) => {
  await page.goto('/')
  const input = page.getByLabel('Choose a story file')
  await input.setInputFiles({ name: 'switchable-lamp.z5', mimeType: 'application/octet-stream', buffer: sample('switchable-lamp.z5') })
  await waitToPlay(page)
  await expect(page).toHaveTitle('switchable lamp — frotzplay')
  await playTurn(page)

  await page.goto('/')
  await page.getByLabel('Choose a story file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('These are not the droids you are looking for. '.repeat(4)) })
  await expect(page.getByRole('alert')).toContainText('isn’t a Z-machine story')
  await page.getByLabel('Choose a story file').setInputFiles({ name: 'game.ulx', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from('Glul'), Buffer.alloc(200)]) })
  await expect(page.getByRole('alert')).toContainText('Glulx')
  await expect(page.getByRole('alert')).toContainText('Parchment')
})

test('a file dropped anywhere on the page plays', async ({ page }) => {
  await page.goto('/')
  const bytes = [...sample('puny-two-rooms.z3')]
  await page.evaluate(b => {
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(b)], 'two-rooms.z3'))
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, bytes)
  await waitToPlay(page)
  await expect(page).toHaveTitle('two rooms — frotzplay')
})

test('?story= from this site plays, and offers "Open in Parchment"', async ({ page }) => {
  await page.goto('/?story=/samples/locked-chest.z5')
  await waitToPlay(page)
  await playTurn(page)
  const link = page.getByRole('link', { name: 'Open in Parchment' })
  await expect(link).toHaveAttribute('href', `https://iplayif.com/?story=${encodeURIComponent('http://localhost:4210/samples/locked-chest.z5')}`)
})

test('?story= from another origin: with CORS it plays; without, it says why and what to do', async ({ page }) => {
  await page.goto(`/?story=${encodeURIComponent('https://localhost:4192/cors/hermit.z5')}`)
  await waitToPlay(page)
  await playTurn(page)

  await page.goto(`/?story=${encodeURIComponent('https://localhost:4192/nocors/hermit.z5')}`)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('may not allow other sites to read its files (CORS)')
  await expect(alert).toContainText('Download the story and drop it here instead')
  // The browser's own CORS message is expected here; nothing else.
  const p = (page as unknown as { __problems: string[] }).__problems
  p.splice(0, p.length, ...p.filter(x => !/CORS|Cross-Origin|Access-Control|access control|NetworkError|Load failed|Failed to fetch/i.test(x)))

  await page.goto(`/?story=${encodeURIComponent('http://example.com/game.z5')}`)
  await expect(page.getByRole('alert')).toContainText('secure (https) addresses')
})

/** A Blorb: the story, a cover picture (the frontispiece), and iFiction metadata. */
function blorb(story: Buffer, title: string, author: string): Buffer {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const xml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><ifindex version="1.0" xmlns="http://babel.ifarchive.org/protocol/iFiction/"><story><bibliographic><title>${title}</title><author>${author}</author></bibliographic></story></ifindex>`)
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'latin1')
    head.writeUInt32BE(data.length, 4)
    return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
  }
  const ridxLen = 8 + 4 + 12 * 2
  const zcodAt = 12 + ridxLen
  const pngAt = zcodAt + 8 + story.length + (story.length % 2)
  const ridx = Buffer.alloc(4 + 24)
  ridx.writeUInt32BE(2, 0)
  ridx.write('Exec', 4, 'latin1'); ridx.writeUInt32BE(0, 8); ridx.writeUInt32BE(zcodAt, 12)
  ridx.write('Pict', 16, 'latin1'); ridx.writeUInt32BE(1, 20); ridx.writeUInt32BE(pngAt, 24)
  const fspc = Buffer.alloc(4)
  fspc.writeUInt32BE(1, 0)
  const body = Buffer.concat([Buffer.from('IFRS'), chunk('RIdx', ridx), chunk('ZCOD', story), chunk('PNG ', png), chunk('Fspc', fspc), chunk('IFmd', xml)])
  const form = Buffer.alloc(8)
  form.write('FORM', 0, 'latin1')
  form.writeUInt32BE(body.length, 4)
  return Buffer.concat([form, body])
}

test('a Blorb: its title and author name the page, and its cover shows', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose a story file').setInputFiles({ name: 'cellar.zblorb', mimeType: 'application/octet-stream', buffer: blorb(sample('dark-cellar.z5'), 'The Darker Cellar', 'A. Tester') })
  await waitToPlay(page)
  await expect(page).toHaveTitle('The Darker Cellar — frotzplay')
  await expect(page.getByRole('img', { name: 'Cover of The Darker Cellar' })).toBeVisible()
  await expect(page.getByText('The Darker Cellar, by A. Tester')).toBeVisible()
})

test('one theme for the page and the player, remembered: the header’s switch, and high contrast from Settings', async ({ page }) => {
  await page.goto('/?sample=dark-cellar')
  await waitToPlay(page)
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: /light mode|dark mode|color mode/i }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'High contrast' }).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/high-contrast/)
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)light(\s|$)/)
  await axe(page)
  await page.reload()
  await waitToPlay(page)
  await expect(page.locator('.zp')).toHaveAttribute('data-theme', 'high-contrast')
})

test('a story handed over by the opening window (the Frotzlens handshake)', async ({ page, context }) => {
  await page.goto('/')
  const bytes = [...sample('hermit.z5')]
  const popup = context.waitForEvent('page')
  await page.evaluate(b => {
    const w = window.open('/', '_blank')!
    window.addEventListener('message', e => {
      if (e.source === w && e.data?.source === 'frotzplay' && e.data.type === 'ready') {
        w.postMessage({ source: 'frotzlens', type: 'story', bytes: new Uint8Array(b), name: 'hermit.z5' }, location.origin)
      }
    })
  }, bytes)
  const p = await popup
  await expect(p.getByRole('textbox', { name: 'Command' })).toBeFocused()
  await expect(p).toHaveTitle('hermit — frotzplay')
})

test('the skip link goes to the command line while playing; Another story goes back to the start', async ({ page }) => {
  await page.goto('/?sample=dark-cellar')
  await waitToPlay(page)
  const skip = page.getByRole('link', { name: 'Skip to the command line' })
  await skip.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Command' })).toBeFocused()
  await page.getByRole('button', { name: /Another story/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Play a Z-machine story' })).toBeVisible()
  await expect(page).not.toHaveURL(/sample=/)
})

test('About credits Parchment and ZVM', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'About', exact: true }).click()
  await page.getByRole('menuitem', { name: 'About frotzplay' }).click()
  const dialog = page.getByRole('dialog', { name: 'About frotzplay' })
  await expect(dialog).toContainText('Parchment, the web player for interactive fiction')
  await expect(dialog).toContainText('ZVM')
})

test('the service worker registers (the PWA)', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright’s Firefox has service workers off')
  await page.goto('/')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe('http://localhost:4210/')
})

test('Export: one HTML file and a folder, made in the browser', async ({ page }) => {
  await page.goto('/?sample=dark-cellar')
  await waitToPlay(page)
  await page.getByRole('button', { name: /Export/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Export this story' })
  await expect(dialog).toBeVisible()
  const file = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download one HTML file' }).click()
  expect((await file).suggestedFilename()).toBe('the-dark-cellar.html')
  await expect(dialog.getByRole('status')).toContainText('Saved the-dark-cellar.html')
  const folder = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download a folder (.zip)' }).click()
  expect((await folder).suggestedFilename()).toBe('the-dark-cellar.zip')
  await axe(page)
})
