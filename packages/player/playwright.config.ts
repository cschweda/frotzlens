import { defineConfig, devices } from '@playwright/test'

/**
 * The accessibility contract's suite (docs/accessibility.md): the dev page, built and served, in
 * Chromium, Firefox and WebKit. Each test is named after the statement it checks.
 */
const PORT = 4180
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'pnpm preview', url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
    // The embed test's page: <frotz-play> (dist/frotz-play.js: run `pnpm build` first) under a strict CSP.
    { command: 'node e2e/embed-server.mjs', url: 'http://localhost:4182/embed.css', reuseExistingServer: !process.env.CI },
  ],
})
