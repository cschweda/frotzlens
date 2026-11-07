/**
 * @frotzinc/nuxt-base — the shared Nuxt layer for frotz, Inc. apps.
 *
 *   export default defineNuxtConfig({ extends: ['@frotzinc/nuxt-base'] })
 *
 * Gives: a pure client-side static app (ssr: false), dark-by-default color
 * mode, the Nuxt UI color roles (app.config.ts), the auto-imported utils in
 * app/utils, and the `build:manifest` hook that netlify/inject-preloads.mjs
 * reads. Not here, on purpose: @nuxt/ui itself (the app lists it in
 * `modules`), CSS (the app imports css/base.css from its own main.css, so
 * Tailwind has one entry), and PWA (opt-in per app).
 */
import { mkdirSync, writeFileSync } from 'node:fs'

export default defineNuxtConfig({
  ssr: false,

  colorMode: {
    preference: 'dark',
  },

  hooks: {
    // Dump the client build manifest for netlify/inject-preloads.mjs, which
    // runs after `nuxt generate` and injects <link rel="modulepreload"> hints
    // for each route's chunk chain (ssr:false ships an empty shell, so without
    // hints the browser discovers chunks serially — the LCP waterfall).
    'build:manifest': (manifest) => {
      // Never preload Web Worker chunks into the page. Nuxt 4.6 began emitting
      // <link rel=modulepreload> for them — but a Worker fetches its own
      // script, so the page-level preload can't help it. inject-preloads
      // fails the build if one comes back.
      for (const chunk of Object.values(manifest)) {
        if (/\.worker-[^/]*\.js$/.test(chunk.file ?? '')) {
          chunk.preload = false
          chunk.prefetch = false
        }
      }
      mkdirSync('.nuxt', { recursive: true })
      writeFileSync('.nuxt/client-manifest.json', JSON.stringify(manifest, null, 2))
    },
  },
})
