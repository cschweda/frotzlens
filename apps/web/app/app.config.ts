import { site } from '../site.config'

/**
 * Who Frotzlens is, for the family shell from @frotzinc/nuxt-base (the header, footer, About menu
 * and dialogs). Built from site.config.ts, which stays the one place the identity is written.
 */
export default defineAppConfig({
  product: {
    name: site.name,
    tagline: site.tagline,
    homeHref: '#overview',
    repoUrl: site.repoUrl,
    npmUrl: site.npmUrl,
    familyUrl: site.familyUrl,
    licences: [
      { what: 'Frotzlens (this site) and the frotzlens CLI', licence: 'GPL-3.0-or-later', href: `${site.repoUrl}/blob/main/LICENSE` },
      { what: 'The @frotzinc libraries (zcode, worker-rpc, nuxt-base, inform6-wasm)', licence: 'MIT', href: `${site.repoUrl}/blob/main/LICENSING.md` },
      { what: 'Parchment, ZVM, GlkOte and jQuery (the Play view’s player)', licence: 'MIT', href: '/play/web/THIRD-PARTY-NOTICES.txt' },
      { what: 'Open Sans and JetBrains Mono (the fonts, served from this site)', licence: 'SIL Open Font License 1.1', href: 'https://openfontlicense.org' },
      { what: 'Lucide (the icons)', licence: 'ISC', href: 'https://lucide.dev/license' },
      { what: 'Nuxt, Nuxt UI and Vue', licence: 'MIT', href: 'https://github.com/nuxt/nuxt/blob/main/LICENSE' },
    ],
  },
})
