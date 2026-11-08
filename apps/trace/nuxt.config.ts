// https://nuxt.com/docs/api/configuration/nuxt-config
import { buildCommit, packageVersion } from '@frotzinc/nuxt-base/netlify/version'
import { seoHead } from './seo'

/**
 * What the About menu says: frotztrace's version and build, and the version of each package it's
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
    '@frotzinc/zcode': pkg('../../packages/zcode/package.json'),
    '@frotzinc/zcode-ui': pkg('../../packages/zcode-ui/package.json'),
    '@frotzinc/player': pkg('../../packages/player/package.json'),
    '@frotzinc/nuxt-base': pkg('../../packages/nuxt-base/package.json'),
  },
}

export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',

  // The shared frotz, Inc. layer: ssr:false (a static, client-side site), dark-default colour mode,
  // the Nuxt UI colour roles, the family shell (header, footer, About), and the build:manifest hook.
  // frotztrace defines no colours, fonts or chrome of its own: it looks exactly like frotzsmith,
  // frotzlens and frotzplay. The debugger's views come from @frotzinc/zcode-ui, the game's screen
  // from @frotzinc/player.
  extends: ['@frotzinc/nuxt-base', '@frotzinc/zcode-ui'],
  modules: ['@nuxt/ui'],
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
})
