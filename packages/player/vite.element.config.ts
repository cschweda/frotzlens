/**
 * The <frotz-play> build (docs/15 §1): one self-contained classic script (IIFE, so it runs from
 * file:// and from a plain <script src>), Vue and the interpreter inside, Vue's runtime only
 * (templates compiled here: no eval).
 */
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue({ customElement: false })],
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  build: {
    emptyOutDir: false,
    lib: { entry: 'src/element.ts', formats: ['iife'], name: 'FrotzPlay', fileName: () => 'frotz-play.js' },
    cssCodeSplit: false,
    sourcemap: false,
  },
})
