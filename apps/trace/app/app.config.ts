import { site } from '../site.config'

/** Who frotztrace is, for the family shell (header, footer, About menu and dialogs). Built from site.config.ts. */
export default defineAppConfig({
  product: {
    name: site.name,
    tagline: site.tagline,
    summary: 'A debugger for Z-machine stories, in your browser: breakpoints, a live view of everything inside the story, and stepping backwards. Nothing is uploaded.',
    homeHref: '/',
    repoUrl: site.repoUrl,
    npmUrl: site.npmUrl,
    familyUrl: site.familyUrl,
    // Report a problem / Suggest a feature can send by email (netlify/functions/report.mjs, Resend).
    reportEndpoint: '/.netlify/functions/report',
    licences: [
      { what: 'frotztrace (this site)', licence: 'GPL-3.0-or-later', href: `${site.repoUrl}/blob/main/LICENSE` },
      { what: 'The @frotzinc libraries (nuxt-base)', licence: 'MIT', href: `${site.repoUrl}/blob/main/LICENSING.md` },
      { what: 'Open Sans and JetBrains Mono (the fonts, served from this site)', licence: 'SIL Open Font License 1.1', href: 'https://openfontlicense.org' },
      { what: 'Lucide (the icons)', licence: 'ISC', href: 'https://lucide.dev/license' },
      { what: 'Nuxt, Nuxt UI and Vue', licence: 'MIT', href: 'https://github.com/nuxt/nuxt/blob/main/LICENSE' },
    ],
  },
})
