import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Compiles the fixtures (test/.fixtures) once per run, before any test file loads.
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
  },
})
