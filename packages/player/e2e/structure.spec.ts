/** Contract statements S1–S4 (docs/accessibility.md), and axe in every state of docs/13 §4. */
import { expect, test } from '@playwright/test'
import { axe, commandInput, open, openSettings, play } from './helpers'

test('S1: one main, a skip link to the command line, the story as the page title', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page).toHaveTitle('The Dark Cellar — frotzplay')
  // The skip link is the first thing in the tab order, and goes to the command line.
  const first = await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, [tabindex]')].filter(e => e.tabIndex >= 0)
    return all[0]?.textContent?.trim()
  })
  expect(first).toBe('Skip to the command line')
  const skip = page.getByRole('link', { name: 'Skip to the command line' })
  await skip.focus()
  await expect(skip).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(commandInput(page)).toBeFocused()
  await expect(page.getByRole('form', { name: 'Command line' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Story controls' })).toBeVisible()
})

test('S2: saved and exported are status messages, in words', async ({ page }) => {
  await open(page)
  const status = page.getByTestId('status-message')
  await expect(status).toHaveAttribute('role', 'status')
  const save = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await save
  await expect(status).toContainText('Saved: the-dark-cellar.qzl')
  const transcript = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download transcript' }).click()
  expect((await transcript).suggestedFilename()).toBe('the-dark-cellar-transcript.txt')
  await expect(status).toContainText('Transcript saved')
})

test('S3: a bad save file is an error in words, with what to do; the story goes on', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Restore' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore a saved game' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Save file').setInputFiles({ name: 'other.qzl', mimeType: 'application/octet-stream', buffer: Buffer.from('not a save file at all') })
  const alert = page.getByTestId('error-message')
  await expect(alert).toHaveAttribute('role', 'alert')
  await expect(alert).toContainText('That save file can’t be restored')
  await expect(alert).toContainText('Choose another file, or carry on')
  await play(page, 'look')
})

test('S3: a save made here restores', async ({ page }) => {
  await open(page)
  await play(page, 'take lantern')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const path = await (await download).path()
  await play(page, 'drop lantern')
  await page.getByRole('button', { name: 'Restore' }).click()
  await page.getByRole('dialog', { name: 'Restore a saved game' }).getByLabel('Save file').setInputFiles(path!)
  await expect(page.getByTestId('status-message')).toContainText('Restored from')
  await play(page, 'inventory')
  await expect(page.locator('.zp-turn').last()).toContainText('brass lantern')
})

test('S4: every dialog is named by its heading', async ({ page }) => {
  await open(page)
  for (const [button, name] of [
    ['Settings', 'Settings'],
    ['Keyboard shortcuts', 'Keyboard shortcuts'],
  ] as const) {
    await page.getByRole('button', { name: button }).click()
    await expect(page.getByRole('dialog', { name })).toBeVisible()
    await expect(page.getByRole('dialog', { name }).getByRole('heading', { name })).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

test.describe('axe in every state (docs/13 §4)', () => {
  test('start, five turns, the v3 status line', async ({ page }) => {
    await open(page)
    await axe(page, { aaaContrast: true })
    for (const c of ['look', 'take lantern', 'down', 'up', 'inventory']) await play(page, c)
    await axe(page, { aaaContrast: true })
    await open(page, 'puny-dark-cellar.z3')
    await axe(page, { aaaContrast: true })
  })

  test('the upper window, waiting for a key, a timed read', async ({ page }) => {
    await open(page, 'upper.z5')
    await axe(page, { aaaContrast: true })
    await open(page, 'timed.z5')
    await axe(page, { aaaContrast: true })
    await play(page, 'hi')
    await axe(page, { aaaContrast: true })
  })

  test('each dialog, a message, an error', async ({ page }) => {
    await open(page)
    await openSettings(page)
    await axe(page, { aaaContrast: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
    await axe(page, { aaaContrast: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Restore' }).click()
    await axe(page, { aaaContrast: true })
    await page.getByRole('dialog', { name: 'Restore a saved game' }).getByLabel('Save file').setInputFiles({ name: 'x.qzl', mimeType: 'application/octet-stream', buffer: Buffer.from('nope') })
    await expect(page.getByTestId('error-message')).toContainText('can’t be restored')
    await axe(page, { aaaContrast: true })
    const d = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download transcript' }).click()
    await d
    await axe(page, { aaaContrast: true })
  })

  test('each theme, 320 px, 200%', async ({ page }) => {
    await open(page)
    for (const theme of ['Light', 'High contrast']) {
      await openSettings(page)
      await page.getByRole('radio', { name: theme }).check()
      await page.keyboard.press('Escape')
      await axe(page, { aaaContrast: theme !== 'Light' })
    }
    await page.setViewportSize({ width: 320, height: 640 })
    await axe(page)
    await openSettings(page)
    await page.getByLabel('Size').selectOption('200')
    await page.keyboard.press('Escape')
    await axe(page)
  })
})
