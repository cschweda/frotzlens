import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The Inform layer's tests read @frotzinc/zcode's compiled fixtures (a story and its debug file).
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
  },
})
