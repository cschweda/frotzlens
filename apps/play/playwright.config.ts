import { defineConfig, devices } from '@playwright/test'

/**
 * frotzplay's site (docs/14 §6): the generated site (run `pnpm generate` first), served with
 * netlify.toml's headers by scripts/serve.mjs, in Chromium, Firefox and WebKit; and a second origin
 * serving stories over HTTPS for the ?story= tests.
 */
const PORT = 4210
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', ignoreHTTPSErrors: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node scripts/serve.mjs', url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI },
    { command: 'node e2e/story-server.mjs', port: 4192, reuseExistingServer: !process.env.CI, ignoreHTTPSErrors: true },
  ],
})
