/** The library build: the components and composables as one ES module, Vue left to the host, CSS as one file. */
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'player.js', cssFileName: 'player' },
    rollupOptions: { external: ['vue', '@frotzinc/zmachine', '@frotzinc/zcode'] },
    sourcemap: true,
  },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
})
