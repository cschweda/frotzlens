/** Contract statements I1–I7 (docs/accessibility.md): the command line, the keyboard, focus and targets. */
import { expect, test } from '@playwright/test'
import { commandInput, open, openSettings, play, walkthrough } from './helpers'

test('I1: the command line is labelled, focused at start, and keeps focus after every turn', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('textbox', { name: 'Command' })).toBeFocused()
  for (const c of walkthrough('dark-cellar')) {
    await play(page, c)
    await expect(commandInput(page)).toBeFocused()
  }
})

test('I2: ↑ and ↓ step through earlier commands', async ({ page }) => {
  await open(page)
  await play(page, 'look')
  await play(page, 'inventory')
  await commandInput(page).press('ArrowUp')
  await expect(commandInput(page)).toHaveValue('inventory')
  await commandInput(page).press('ArrowUp')
  await expect(commandInput(page)).toHaveValue('look')
  await commandInput(page).press('ArrowDown')
  await expect(commandInput(page)).toHaveValue('inventory')
  await commandInput(page).press('ArrowDown')
  await expect(commandInput(page)).toHaveValue('')
})

test('I3: a key wanted is announced, and taken from the same control', async ({ page }) => {
  await open(page, 'timed.z5')
  await play(page, 'hello')
  await expect(page.getByRole('textbox', { name: 'Press any key' })).toBeFocused()
  await expect(page.getByText('The story is waiting for a key: press any key.')).toBeVisible()
  await commandInput(page).press('x')
  await expect(page.getByRole('region', { name: 'Story' }).getByText('Key: 120')).toBeVisible()
})

test('I4: everything by keyboard; dialogs return focus to what opened them', async ({ page }) => {
  await open(page)
  // Tab from the command line to the controls, open Settings with Enter, close with Escape.
  const settings = page.getByRole('button', { name: 'Settings' })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await expect(settings).toBeFocused()
  // The same for the shortcuts dialog, closed with its Close button by keyboard.
  const shortcuts = page.getByRole('button', { name: 'Keyboard shortcuts' })
  await shortcuts.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await dialog.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(shortcuts).toBeFocused()
  // Save by keyboard: the file comes down.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  expect((await download).suggestedFilename()).toMatch(/\.qzl$/)
})

test('I5: every control shows a visible focus indicator', async ({ page }) => {
  await open(page)
  for (const b of await page.locator('.zp button, .zp input').all()) {
    if (!(await b.isVisible()) || (await b.isDisabled())) continue
    await b.focus()
    const outline = await b.evaluate(el => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  }
})

test('I6: shortcuts work, can be changed, and can be turned off; none is a single key', async ({ page, browserName }) => {
  await open(page)
  await page.keyboard.press('Alt+Shift+KeyO')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.keyboard.press('Alt+Shift+KeyK')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  // Change "Settings" to Alt+Shift+P.
  await dialog.getByRole('button', { name: 'Change Settings' }).click()
  await page.keyboard.press('Alt+Shift+KeyP')
  await expect(dialog.getByRole('row', { name: /^Settings/ })).toContainText('Shift+P')
  // A single key is refused.
  await dialog.getByRole('button', { name: 'Change Undo the last turn' }).click()
  await page.keyboard.press('KeyQ')
  await expect(dialog.getByRole('status')).toContainText('needs Alt, Ctrl or Cmd')
  await page.keyboard.press('Escape')
  // Turn off "Read the upper window".
  await dialog.getByRole('button', { name: 'Turn off Read the upper window' }).click()
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.keyboard.press('Alt+Shift+KeyP')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Alt+Shift+KeyO')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  test.info().annotations.push({ type: 'browser', description: browserName })
})

test('I7: every target is at least 24 × 24 CSS px', async ({ page }) => {
  await open(page)
  await openSettings(page)
  for (const el of await page.locator('.zp button, .zp input, .zp select').all()) {
    if (!(await el.isVisible())) continue
    const box = (await el.boundingBox())!
    const what = await el.evaluate(e => e.outerHTML.slice(0, 80))
    expect(box.width, what).toBeGreaterThanOrEqual(24)
    expect(box.height, what).toBeGreaterThanOrEqual(24)
  }
})
