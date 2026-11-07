import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Open the dev page on a story, seeded, without autosave, and wait for the first command. */
export async function open(page: Page, story = 'dark-cellar.z5', extra = '') {
  await page.goto(`/?story=${story}&seed=1&autosave=off${extra}`)
  await expect(page.getByRole('button', { name: 'Enter' })).toBeEnabled()
}

export const commandInput = (page: Page) => page.locator('#zp-command-input')
export const turns = (page: Page) => page.locator('.zp-turn')

/** Type a command and wait for its turn to be done: a new turn block, and the story waiting again (for a line or a key). */
export async function play(page: Page, command: string) {
  const before = await turns(page).count()
  await commandInput(page).fill(command)
  await commandInput(page).press('Enter')
  await expect(turns(page)).toHaveCount(before + 1)
  await expect
    .poll(async () => (await page.getByRole('button', { name: 'Enter' }).isEnabled()) || (await page.getByRole('textbox', { name: 'Press any key' }).count()) > 0)
    .toBe(true)
}

/** Count what's added to the announcer from now on. */
export async function watchAnnouncer(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __announced: string[] }
    w.__announced = []
    const log = document.querySelector('[data-testid="announcer"]')!
    new MutationObserver(records => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) w.__announced.push((n as HTMLElement).textContent ?? '')
    }).observe(log, { childList: true })
  })
  return () => page.evaluate(() => (window as unknown as { __announced: string[] }).__announced)
}

/** What the status announcer says now. */
export const statusAnnounced = (page: Page) => page.locator('[data-testid="status-announcer"]').textContent()

export function walkthrough(name: string): string[] {
  return readFileSync(new URL(`../../../samples/walkthroughs/${name}.txt`, import.meta.url), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('!'))
}

/** axe: WCAG 2.0–2.2 A and AA, plus AAA contrast when asked (the dark theme's promise). */
export async function axe(page: Page, opts: { aaaContrast?: boolean } = {}) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  if (opts.aaaContrast) b = b.options({ rules: { 'color-contrast-enhanced': { enabled: true } } })
  const r = await b.analyze()
  const found = r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
  expect(found).toEqual([])
}

export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}
