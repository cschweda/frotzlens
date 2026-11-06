import { defineConfig, devices } from '@playwright/test'

/**
 * The smoke test: the generated site (run `pnpm generate` first), served with
 * the production CSP by scripts/serve.mjs, in Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI },
})
