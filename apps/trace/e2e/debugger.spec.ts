/**
 * frotztrace's debugger (docs/21): the deliverable on the built site, under its real CSP: open the
 * Dark Cellar sample, stop on action Take, inspect, step back, continue; axe on every view.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

function errorsOf(page: Page) {
  const errors: string[] = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
  return errors
}
async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map(v => `${where}: ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}
const status = (page: Page) => page.getByRole('status').filter({ hasText: /^At / })
async function type(page: Page, command: string) {
  await page.getByRole('textbox', { name: 'Command' }).fill(command)
  await page.getByRole('textbox', { name: 'Command' }).press('Enter')
}

test('the samples are on the start page, and one opens with its names', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Try a sample' })).toBeVisible()
  await expect(page.getByRole('button', { name: /The Dark Cellar · start here/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /PunyInform/ })).toBeVisible()
  await axe(page, 'start')
  await page.getByRole('button', { name: /The Dark Cellar · start here/ }).click()
  await expect(status(page)).toContainText('waiting for a command')
  await expect(page.getByText('THE DARK CELLAR')).toBeVisible()
  await expect(page.getByRole('link', { name: 'KeyboardPrimitive' })).toBeVisible()
  expect(errors).toEqual([])
})

test('the deliverable: stop on action Take, inspect, step back, continue', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/?sample=dark-cellar#breakpoints')
  await expect(status(page)).toContainText('waiting for a command')
  await page.getByLabel('Stop at').fill('action:Take')
  await page.getByRole('button', { name: 'Add breakpoint' }).click()
  await expect(page.getByRole('checkbox', { name: 'action Take' })).toBeChecked()
  await axe(page, 'breakpoints')

  for (const c of ['down', 'up']) {
    await type(page, c)
    await expect(status(page)).toContainText('waiting for a command')
  }
  await type(page, 'take lantern')
  await expect(status(page)).toContainText('breakpoint action Take: action Take (noun: lantern)')
  await expect(status(page)).toContainText('turn 3')
  await expect(page.getByText('1 hit')).toBeVisible()

  // The stack, named, innermost first.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Stack' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '#0' })).toContainText('InformLibrary.begin_action')
  await axe(page, 'stack')
  // The code, with the PC marked.
  await page.getByRole('link', { name: 'Code', exact: true }).click()
  await expect(page.getByText('current instruction')).toBeAttached()
  await axe(page, 'code')
  // Objects, globals and memory, live.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Objects' }).click()
  await expect(page.getByRole('tree', { name: 'Object tree' })).toBeVisible()
  await axe(page, 'objects')
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Globals' }).click()
  await expect(page.getByRole('columnheader', { name: 'Now' })).toBeVisible()
  await axe(page, 'globals')
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Memory' }).click()
  await expect(page.getByRole('table', { name: /^Bytes from / })).toBeVisible()
  await axe(page, 'memory')
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Trace' }).click()
  await expect(page.getByText(/→ InformLibrary\.begin_action/).first()).toBeVisible()
  await axe(page, 'trace')

  // Step back one instruction, then go on: the turn finishes, waiting for the next command.
  const before = await status(page).textContent()
  await page.getByRole('button', { name: 'Step back' }).click()
  await expect(status(page)).not.toHaveText(before!)
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(status(page)).toContainText(/breakpoint action Take|waiting for a command/)
  await page.keyboard.press('F5')
  await expect(status(page)).toContainText('waiting for a command')
  await expect(page.getByText('Taken.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a gutter breakpoint in Code, and keyboard stepping', async ({ page }) => {
  await page.goto('/?sample=dark-cellar#code')
  await expect(status(page)).toContainText('waiting for a command')
  const gutter = page.getByRole('button', { name: /^Breakpoint at / }).first()
  await gutter.click()
  await expect(gutter).toHaveAttribute('aria-pressed', 'true')
  await gutter.click()
  await expect(gutter).toHaveAttribute('aria-pressed', 'false')
  await type(page, 'look')
  await expect(status(page)).toContainText('waiting for a command')
  await page.keyboard.press('Shift+F10') // step back
  await expect(status(page)).not.toContainText('waiting for a command')
  await page.keyboard.press('F11') // step into
  await expect(status(page)).toContainText(/^At /)
})

test('the debugger passes axe in light mode too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/?sample=dark-cellar#stack')
  await expect(status(page)).toContainText('waiting for a command')
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
  await axe(page, 'stack (light)')
})
