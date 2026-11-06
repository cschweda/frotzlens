// https://nuxt.com/docs/api/configuration/nuxt-config
import { site } from './site.config'

const title = `${site.name} — ${site.tagline}`

export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',

  // The shared Frotz, Inc. layer: ssr:false (a pure client-side, static site), dark-default color
  // mode, the Nuxt UI color roles, safe-storage/slug/shortcut, and the build:manifest hook.
  extends: ['@frotzinc/nuxt-base'],
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  // Self-hosted at build time (Nuxt UI's font module downloads them into the site): no request to
  // Google or anyone else from a visitor's browser. Segoe UI and Cascadia Code are used when installed.
  fonts: {
    families: [
      { name: 'Open Sans', provider: 'google', weights: [400, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 600] },
    ],
  },

  // Icons bundled into the client, never fetched from api.iconify.design.
  icon: { clientBundle: { scan: true, sizeLimitKb: 256 } },

  // The parse worker imports ES modules.
  vite: { worker: { format: 'es' } },

  devtools: { enabled: false },

  app: {
    head: {
      title,
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: site.description },
        // The browser chrome follows the palette's --frotz-ground (nuxt-base/css/palette.css).
        { name: 'theme-color', content: '#0e1116', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#f3f1ea', media: '(prefers-color-scheme: light)' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: site.name },
        { property: 'og:title', content: title },
        { property: 'og:description', content: site.description },
        { property: 'og:url', content: `${site.siteUrl}/` },
        { property: 'og:image', content: `${site.siteUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: title },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: site.description },
        { name: 'twitter:image', content: `${site.siteUrl}/og-image.png` },
      ],
      link: [
        { rel: 'canonical', href: `${site.siteUrl}/` },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
