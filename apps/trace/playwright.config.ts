import { defineConfig, devices } from '@playwright/test'

/**
 * frotztrace's site: the generated site (run `pnpm generate` first), served with netlify.toml's
 * headers by scripts/serve.mjs, in Chromium.
 */
const PORT = 4220
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/serve.mjs', url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI },
})
