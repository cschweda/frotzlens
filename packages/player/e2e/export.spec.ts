/**
 * Export (docs/15 §2): the single file opened from file:// plays a turn with no console errors; so
 * does the folder's index.html, unzipped.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { bundle, bundleFolder, zip } from '../src/export'

const elementJs = readFileSync(new URL('../dist/frotz-play.js', import.meta.url), 'utf8')
const story = new Uint8Array(readFileSync(new URL('../../../samples/dark-cellar.z5', import.meta.url)))
const options = { title: 'The Dark Cellar', storyName: 'dark-cellar.z5', elementJs, seed: 1 }

function watch(page: Page) {
  const problems: string[] = []
  page.on('console', m => m.type() === 'error' && problems.push(m.text()))
  page.on('pageerror', e => problems.push(String(e)))
  return problems
}

async function playsATurn(page: Page) {
  const input = page.getByRole('textbox', { name: 'Command' })
  await expect(input).toBeVisible()
  await expect(page).toHaveTitle('The Dark Cellar — frotzplay')
  // frotzplay's branding: the mark and name in the header, the links in the footer.
  await expect(page.getByRole('banner').getByRole('link', { name: 'frotzplay' })).toBeVisible()
  await expect(page.locator('header svg.fp-logo')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'frotzplay' })
  await expect(nav.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/cschweda/frotzlens/tree/main/apps/play')
  await expect(nav.getByRole('link', { name: 'From frotz, Inc.' })).toHaveAttribute('href', 'https://frotzinc.com')
  await input.fill('take lantern')
  await input.press('Enter')
  await expect(page.locator('frotz-play .zp-turn').last()).toContainText('Taken.')
}

test('the single HTML file plays from file://, under its own strict CSP', async ({ page }) => {
  const { filename, html } = await bundle(story, options)
  expect(filename).toBe('the-dark-cellar.html')
  expect(html).toContain("default-src 'none'")
  const dir = mkdtempSync(join(tmpdir(), 'frotzplay-export-'))
  writeFileSync(join(dir, filename), html)
  const problems = watch(page)
  await page.goto(pathToFileURL(join(dir, filename)).href)
  await playsATurn(page)
  // Autosave may be unavailable from file:// (it says so in words); nothing else may go wrong.
  expect(problems.filter(p => !/indexedDB|IndexedDB/.test(p))).toEqual([])
})

test('the folder (a .zip) plays from file://; the story file is in it', async ({ page }) => {
  const files = bundleFolder(story, options)
  expect(files.map(f => f.name).sort()).toEqual(['README.txt', 'boot.js', 'frotzplay.css', 'frotzplay.js', 'index.html', 'story.js', 'story.z5'])
  const dir = mkdtempSync(join(tmpdir(), 'frotzplay-folder-'))
  writeFileSync(join(dir, 'game.zip'), zip(files, 'the-dark-cellar'))
  // Unzipped with the system's unzip: proof the .zip is a real one.
  execFileSync('unzip', ['-q', 'game.zip'], { cwd: dir })
  expect(readFileSync(join(dir, 'the-dark-cellar', 'story.z5'))).toEqual(Buffer.from(story))
  const problems = watch(page)
  await page.goto(pathToFileURL(join(dir, 'the-dark-cellar', 'index.html')).href)
  await playsATurn(page)
  expect(problems.filter(p => !/indexedDB|IndexedDB/.test(p))).toEqual([])
})
