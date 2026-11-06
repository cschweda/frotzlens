import { defineConfig, devices } from '@playwright/test'

/** One port for the server, the base URL and the readiness check. */
const PORT = Number(process.env.PORT ?? 4175)
const URL = `http://127.0.0.1:${PORT}`

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
  use: { baseURL: URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/serve.mjs', url: URL, env: { PORT: String(PORT) }, reuseExistingServer: !process.env.CI },
})
