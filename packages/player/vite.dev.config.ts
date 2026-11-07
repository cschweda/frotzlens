/** The dev page (dev/): the player on its own with the samples, for the Playwright suite and NVDA. */
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('./dev', import.meta.url)),
  // The samples (and test stories) are served from the repository's samples/ and e2e fixtures.
  publicDir: fileURLToPath(new URL('./dev/public', import.meta.url)),
  plugins: [vue()],
  build: { outDir: fileURLToPath(new URL('./dev-dist', import.meta.url)), emptyOutDir: true },
  server: { port: 4180, strictPort: true },
})
