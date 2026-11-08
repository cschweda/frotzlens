/** frotztrace Phase 5 (docs/22): Source, Watches, Timeline, the live Map, the shortcuts; axe on each. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function axe(page: Page, where: string) {
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map(v => `${where}: ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}
const status = (page: Page) => page.getByRole('status').filter({ hasText: /^At / })
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: new RegExp(`^${name}\\b`) })
async function type(page: Page, command: string) {
  await page.getByRole('textbox', { name: 'Command' }).fill(command)
  await page.getByRole('textbox', { name: 'Command' }).press('Enter')
  await expect(status(page)).toContainText(/waiting for a command|breakpoint/)
}
const openSample = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?sample=dark-cellar#source')
  await expect(status(page)).toContainText('waiting for a command')
}

test('Source: a gutter breakpoint on the game’s own line, reached by going back in time', async ({ page }) => {
  await openSample(page)
  await expect(page.getByRole('region', { name: 'Source' })).toBeVisible()
  await axe(page, 'source')
  // The Dark Cellar's own code is Initialise (the rest is in the library): three statements, which
  // ran before the first prompt. Set a breakpoint on the first, go back to instruction 0, and run.
  const first = page.getByRole('button', { name: /^Breakpoint on line \d+$/ }).first()
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await nav(page, 'Timeline').click()
  const slider = page.getByRole('slider')
  await slider.fill('0')
  await slider.dispatchEvent('change')
  await expect(status(page)).toContainText(' 0 instructions')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(status(page)).toContainText(/breakpoint line story\.inf:\d+/)
  await nav(page, 'Source').click()
  await expect(page.getByText('the machine is on this line')).toBeAttached()
})

test('Watches: a value, changed after a turn', async ({ page }) => {
  await openSample(page)
  await nav(page, 'Watches').click()
  await page.getByRole('textbox', { name: 'Watch' }).fill('lantern in player')
  await page.getByRole('button', { name: 'Add watch' }).click()
  await page.getByRole('textbox', { name: 'Watch' }).fill('location ==')
  await page.getByRole('button', { name: 'Add watch' }).click()
  await expect(page.getByRole('alert')).toContainText('the expression ends too soon')
  await page.getByRole('textbox', { name: 'Watch' }).fill('score')
  await page.getByRole('button', { name: 'Add watch' }).click()
  const row = page.getByRole('row').filter({ hasText: 'lantern in player' })
  await expect(row).toContainText('0')
  for (const c of ['down', 'up', 'take lantern']) await type(page, c)
  await expect(row).toContainText('1')
  await expect(row).toContainText('changed')
  await axe(page, 'watches')
})

test('Timeline: back to a turn, and the scrubber', async ({ page }) => {
  await openSample(page)
  for (const c of ['down', 'up']) await type(page, c)
  await nav(page, 'Timeline').click()
  await expect(page.locator('#views').getByText('> down')).toBeVisible()
  await axe(page, 'timeline')
  await page.getByRole('button', { name: 'Go here (turn 1)' }).click()
  await expect(status(page)).toContainText('turn 1')
  await expect(status(page)).toContainText('waiting for a command')
  await page.getByRole('button', { name: 'To the furthest point' }).click()
  await expect(status(page)).toContainText('turn 2')
  const slider = page.getByRole('slider')
  await slider.fill('1000')
  await slider.dispatchEvent('change')
  await expect(status(page)).toContainText(/ 1,000 instructions/)
})

test('Map: the room the player is in, and the rooms visited', async ({ page }) => {
  await openSample(page)
  await type(page, 'down')
  await nav(page, 'Map').click()
  await expect(page.getByRole('listitem').filter({ hasText: 'you are here' })).toContainText('Cellar')
  await expect(page.getByRole('listitem').filter({ hasText: /^Hall/ })).toContainText('visited')
  await axe(page, 'map')
})

test('the shortcuts dialog, and the views in light mode', async ({ page }) => {
  await openSample(page)
  await page.locator('body').press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Step back: one instruction back in time')
  await axe(page, 'shortcuts')
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
  await page.waitForFunction(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--frotz-ground)'
    document.body.append(probe)
    const ground = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(document.body).backgroundColor === ground
  })
  for (const v of ['Source', 'Watches', 'Timeline', 'Map']) {
    await nav(page, v).click()
    await axe(page, `${v} (light)`)
  }
})

test.describe('a story handed over by frotzlens', () => {
  test('opens it, from frotzlens only, and says ready to its opener', async ({ page, request }) => {
    const story = await (await request.get('/samples/dark-cellar.z5')).body()
    await page.goto('/?from=frotzlens')
    await expect(page.getByRole('heading', { name: 'Debug a Z-machine story' })).toBeVisible()
    // From another site: refused.
    await page.evaluate(b => window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: 'frotztrace:open', name: 'x.z5', bytes: new Uint8Array(b) } })), [...story])
    await expect(page.getByRole('heading', { name: 'Debug a Z-machine story' })).toBeVisible()
    // From frotzlens: opened.
    await page.evaluate(b => window.dispatchEvent(new MessageEvent('message', { origin: 'https://frotzlens.frotzinc.com', data: { type: 'frotztrace:open', name: 'dark-cellar.z5', bytes: new Uint8Array(b) } })), [...story])
    await expect(page.getByRole('status').filter({ hasText: /^At / })).toContainText('waiting for a command')
    await expect(page.getByRole('banner')).toContainText('dark-cellar.z5')
  })
})
