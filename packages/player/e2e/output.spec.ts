/** Contract statements O1–O8 (docs/accessibility.md): what the story shows, and what's announced. */
import { expect, test } from '@playwright/test'
import { commandInput, open, openSettings, play, statusAnnounced, turns, walkthrough, watchAnnouncer } from './helpers'

test('O1: the story is a labelled region of one block per turn, not itself live', async ({ page }) => {
  await open(page)
  const story = page.getByRole('region', { name: 'Story' })
  await expect(story).toBeVisible()
  await expect(story).not.toHaveAttribute('aria-live', /.*/)
  await expect(turns(page)).toHaveCount(1)
  await play(page, 'look')
  await expect(turns(page)).toHaveCount(2)
  await expect(turns(page).nth(1).locator('.zp-echo')).toContainText('look')
})

test('O2: each turn is announced once, as one block, over a whole walkthrough', async ({ page }) => {
  await open(page)
  const announced = await watchAnnouncer(page)
  const commands = walkthrough('dark-cellar')
  for (const c of commands) await play(page, c)
  const said = await announced()
  expect(said).toHaveLength(commands.length)
  for (const s of said) expect(s.trim().length).toBeGreaterThan(0)
})

test('O3: verbosity shapes the announcement; the story shows everything either way', async ({ page }) => {
  await open(page)
  const announced = await watchAnnouncer(page)
  await play(page, 'look')
  await openSettings(page)
  await page.getByRole('radio', { name: 'Everything, with your command' }).check()
  await page.keyboard.press('Escape')
  await play(page, 'look')
  const [standard, full] = await announced()
  expect(standard).not.toContain('> look')
  expect(full).toContain('> look')
  await expect(turns(page).nth(2).locator('.zp-echo')).toContainText('look')
})

test('O4: the status line is announced when it changes, and only then (v5 row; v3 sentence)', async ({ page }) => {
  await open(page, 'upper.z5')
  expect(await statusAnnounced(page)).toBe('Upper Room Turns: 0')
  await play(page, 'look')
  expect(await statusAnnounced(page)).toBe('Upper Room Turns: 0')
  // Unchanged: the region wasn't rewritten. Changed: it says the new row.
  await page.evaluate(() => (document.querySelector('[data-testid="status-announcer"]')!.textContent = 'marker'))
  await play(page, 'look')
  expect(await statusAnnounced(page)).toBe('marker')
  await play(page, 'wait')
  expect(await statusAnnounced(page)).toBe('Upper Room Turns: 1')

  await open(page, 'puny-dark-cellar.z3')
  expect(await statusAnnounced(page)).toBe('Hall. Score 0, moves 0.')
})

test('O5: the upper window is text, and "Read upper window" announces it', async ({ page }) => {
  await open(page, 'upper.z5')
  const upper = page.getByRole('region', { name: 'Upper window' })
  await expect(upper).toContainText('Map: north to the Hall')
  const announced = await watchAnnouncer(page)
  await page.getByRole('button', { name: 'Read upper window' }).click()
  expect((await announced()).at(-1)).toBe('Upper window: Upper Room Turns: 0. Map: north to the Hall. south to the Garden')
})

test('O7: at 320 px the page never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await open(page)
  await play(page, 'look')
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(sideways).toBe(false)
})

test('O8: timed input is announced, can be paused, and can be turned off', async ({ page }) => {
  await open(page, 'timed.z5')
  const hint = page.locator('#zp-command-hint')
  await expect(hint.getByText('The game will go on in 1 second unless you type.')).toBeVisible()
  // Paused: the timer routine isn't called. (Counted from the pause: on a slow machine a tick may
  // already have happened before the click.)
  await page.getByRole('button', { name: 'Pause timer' }).click()
  const story = page.getByRole('region', { name: 'Story' })
  const ticks = story.getByText(/\[tick \d\]/)
  const before = await ticks.count()
  await page.waitForTimeout(1600)
  await expect(ticks).toHaveCount(before)
  await page.getByRole('button', { name: 'Resume timer' }).click()
  await expect(ticks).toHaveCount(before + 1)

  await open(page, 'timed.z5')
  await openSettings(page)
  await page.getByRole('checkbox', { name: 'Turn off the story’s timers' }).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('#zp-command-hint').getByText('The story’s timers are off in Settings.')).toBeVisible()
  await page.waitForTimeout(1600)
  await expect(page.getByRole('region', { name: 'Story' }).getByText('[tick 1]')).toHaveCount(0)
  await expect(commandInput(page)).toBeEditable()
})
