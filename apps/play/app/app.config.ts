import { site } from '../site.config'

/**
 * Who frotzplay is, for the family shell (header, footer, About menu and dialogs). Built from
 * site.config.ts, the one place the identity is written. The licences credit Parchment as prior
 * art, and ZVM as the test oracle (design §3).
 */
export default defineAppConfig({
  product: {
    name: site.name,
    tagline: site.tagline,
    homeHref: '/',
    repoUrl: site.repoUrl,
    npmUrl: site.npmUrl,
    familyUrl: site.familyUrl,
    // Report a problem / Suggest a feature can send by email (netlify/functions/report.mjs, Resend).
    reportEndpoint: '/.netlify/functions/report',
    licences: [
      { what: 'frotzplay (this site)', licence: 'GPL-3.0-or-later', href: `${site.repoUrl}/blob/main/LICENSE` },
      { what: 'The @frotzinc libraries (zmachine, player, zcode, nuxt-base)', licence: 'MIT', href: `${site.repoUrl}/blob/main/LICENSING.md` },
      { what: 'Parchment, the web player for interactive fiction, by Dannii Willis: the prior art for everything here', licence: 'MIT', href: 'https://github.com/curiousdannii/parchment' },
      { what: 'ZVM (ifvms.js), frotzplay’s test oracle; shipped in nothing', licence: 'MIT', href: 'https://github.com/curiousdannii/ifvms.js' },
      { what: 'OpenDyslexic (the dyslexia-friendly font), by Abbie Gonzalez', licence: 'SIL Open Font License 1.1', href: 'https://github.com/antijingoist/opendyslexic/blob/main/OFL.txt' },
      { what: 'Open Sans and JetBrains Mono (the fonts, served from this site)', licence: 'SIL Open Font License 1.1', href: 'https://openfontlicense.org' },
      { what: 'Lucide (the icons)', licence: 'ISC', href: 'https://lucide.dev/license' },
      { what: 'Nuxt, Nuxt UI and Vue', licence: 'MIT', href: 'https://github.com/nuxt/nuxt/blob/main/LICENSE' },
    ],
  },
})
