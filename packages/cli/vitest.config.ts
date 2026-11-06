import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The tests read @frotzinc/zcode's compiled fixtures: build them first, so this package's
    // tests also run on their own.
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
  },
})
