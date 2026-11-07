/**
 * frotzlens — identity and the one canonical URL, in one place. The site lives
 * on the family's domain (frotzlens.frotzinc.com, since 2026-11-06); to move it,
 * change `siteUrl` here and nowhere else.
 */
export const site = {
  name: 'frotzlens',
  tagline: 'See inside a Z-machine story file',
  description:
    'Disassemble and explore Z-machine story files in your browser: objects, dictionary, grammar, every routine and string, Inform debug symbols, and the map. Nothing is uploaded.',
  /** What the social card (public/og-image.png) shows, for its alt text. */
  imageAlt: 'The frotzlens logo, an amber magnifying glass, beside the words "See inside a Z-machine story file", over a faded disassembly listing.',
  siteUrl: 'https://frotzlens.frotzinc.com',
  repoUrl: 'https://github.com/cschweda/frotzlens',
  /** The published @frotzinc packages (the frotzlens CLI is on npm too, unscoped). */
  npmUrl: 'https://www.npmjs.com/org/frotzinc',
  familyUrl: 'https://frotzinc.com',
  sample: { file: 'dark-cellar.z5', title: 'The Dark Cellar' },
} as const
