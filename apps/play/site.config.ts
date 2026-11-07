/**
 * frotzplay — identity and the one canonical URL, in one place (as Frotzlens's site.config.ts).
 * To move the site, change `siteUrl` here and nowhere else.
 */
export const site = {
  name: 'frotzplay',
  tagline: 'Play Z-machine stories in your browser',
  /** At most 160 characters: search results and link previews cut longer ones. The long version is llms.txt. */
  description:
    'An accessible Z-machine player: play interactive fiction in your browser, built for screen readers and strict security policies. Nothing is uploaded.',
  /** When frotzplay was first published (the structured data's datePublished). */
  published: '2026-11-07',
  /** What the social card (public/og-image.png) shows, for its alt text. */
  imageAlt:
    'The frotzplay logo, an amber tile with a play triangle and a prompt cursor, beside the words "Play Z-machine stories in your browser", over a faded transcript of The Dark Cellar.',
  siteUrl: 'https://frotzplay.frotzinc.com',
  repoUrl: 'https://github.com/cschweda/frotzlens',
  npmUrl: 'https://www.npmjs.com/org/frotzinc',
  familyUrl: 'https://frotzinc.com',
  parchmentUrl: 'https://iplayif.com',
  /** The start page's "Try a sample" row; the first is featured (`?sample`). Files come from samples/ at build time. */
  samples: [
    { id: 'dark-cellar', file: 'dark-cellar.z5', title: 'The Dark Cellar', blurb: 'Darkness and light.' },
    { id: 'locked-chest', file: 'locked-chest.z5', title: 'The Locked Chest', blurb: 'A small puzzle.' },
    { id: 'hermit', file: 'hermit.z5', title: 'The Hermit', blurb: 'Someone to talk to.' },
    { id: 'magic-8-ball', file: 'magic-8-ball.z5', title: 'Magic 8-Ball', blurb: 'Ask it anything; the seed decides.' },
  ],
} as const
