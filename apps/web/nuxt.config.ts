// https://nuxt.com/docs/api/configuration/nuxt-config
import { buildCommit, packageVersion } from '@frotzinc/nuxt-base/netlify/version'
import { site } from './site.config'

/**
 * What the About menu says: this app's version and build, and the version of each package it's made
 * of (read from their package.json at build time). The commit is the one being built (Netlify sets
 * COMMIT_REF; git is asked otherwise).
 */
const pkg = (path: string) => packageVersion(new URL(path, import.meta.url))
const commit = buildCommit(new URL('../../', import.meta.url))
const about = {
  version: pkg('./package.json'),
  commit: (process.env.COMMIT_REF ?? commit?.commit ?? '').slice(0, 7),
  date: commit?.date ?? '',
  packages: {
    '@frotzinc/zcode': pkg('../../packages/zcode/package.json'),
    frotzlens: pkg('../../packages/cli/package.json'),
    '@frotzinc/worker-rpc': pkg('../../packages/worker-rpc/package.json'),
    '@frotzinc/nuxt-base': pkg('../../packages/nuxt-base/package.json'),
    '@frotzinc/zcode-ui': pkg('../../packages/zcode-ui/package.json'),
  },
}

const title = `${site.name} — ${site.tagline}`

/**
 * Structured data for search engines (schema.org): a free web application, and who makes it. A
 * JSON data block, not a script that runs, so the CSP's script-src doesn't apply to it.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: site.name,
  url: `${site.siteUrl}/`,
  description: site.description,
  image: `${site.siteUrl}/og-image.png`,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any (runs in a web browser)',
  browserRequirements: 'Requires JavaScript and Web Workers.',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://spdx.org/licenses/GPL-3.0-or-later.html',
  codeRepository: site.repoUrl,
  author: { '@type': 'Person', name: 'Christopher Schweda' },
  publisher: { '@type': 'Organization', name: 'frotz, Inc.', url: site.familyUrl },
}

export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',

  // The shared frotz, Inc. layer: ssr:false (a pure client-side, static site), dark-default color
  // mode, the Nuxt UI color roles, safe-storage/slug/shortcut, and the build:manifest hook. Then the
  // story views shared with frotztrace (@frotzinc/zcode-ui): ObjectTree, GlobalsView, Disassembly, …
  extends: ['@frotzinc/nuxt-base', '@frotzinc/zcode-ui'],
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

  runtimeConfig: { public: { about } },

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
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:site_name', content: site.name },
        { property: 'og:title', content: title },
        { property: 'og:description', content: site.description },
        { property: 'og:url', content: `${site.siteUrl}/` },
        { property: 'og:image', content: `${site.siteUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:alt', content: site.imageAlt },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: site.description },
        { name: 'twitter:image', content: `${site.siteUrl}/og-image.png` },
        { name: 'twitter:image:alt', content: site.imageAlt },
      ],
      script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }],
      link: [
        { rel: 'canonical', href: `${site.siteUrl}/` },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
