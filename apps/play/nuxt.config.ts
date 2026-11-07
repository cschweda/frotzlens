// https://nuxt.com/docs/api/configuration/nuxt-config
import { buildCommit, packageVersion } from '@frotzinc/nuxt-base/netlify/version'
import { seoHead } from './seo'
import { site } from './site.config'

/**
 * What the About menu says: frotzplay's version and build, and the version of each package it's
 * made of (read from their package.json at build time). The commit is the one being built.
 */
const pkg = (path: string) => packageVersion(new URL(path, import.meta.url))
const commit = buildCommit(new URL('../../', import.meta.url))
const about = {
  version: pkg('./package.json'),
  commit: (process.env.COMMIT_REF ?? commit?.commit ?? '').slice(0, 7),
  date: commit?.date ?? '',
  packages: {
    '@frotzinc/zmachine': pkg('../../packages/zmachine/package.json'),
    '@frotzinc/player': pkg('../../packages/player/package.json'),
    '@frotzinc/zcode': pkg('../../packages/zcode/package.json'),
    '@frotzinc/nuxt-base': pkg('../../packages/nuxt-base/package.json'),
  },
}

export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',

  // The shared frotz, inc. layer: ssr:false (a static, client-side site), dark-default colour mode,
  // the Nuxt UI colour roles, the family shell (header, footer, About), and the build:manifest hook.
  extends: ['@frotzinc/nuxt-base'],
  modules: ['@nuxt/ui', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],

  // Self-hosted at build time: no request to Google or anyone else from a visitor's browser.
  fonts: {
    families: [
      { name: 'Open Sans', provider: 'google', weights: [400, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 600] },
    ],
  },

  // Icons bundled into the client, never fetched from api.iconify.design.
  icon: { clientBundle: { scan: true, sizeLimitKb: 256 } },

  devtools: { enabled: false },

  runtimeConfig: { public: { about } },

  app: { head: seoHead },

  // The PWA (docs/14 §3): the app shell, the samples and the fonts precached, so frotzplay opens
  // offline and a dropped story plays offline.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: `${site.name} — ${site.tagline}`,
      short_name: site.name,
      description: site.description,
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0e1116',
      theme_color: '#0e1116',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,svg,png,woff2,z5}'],
      globIgnores: ['og-image.png'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    },
    client: { installPrompt: false },
  },
})
