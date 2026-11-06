/**
 * Frotzlens — identity and the one canonical URL, in one place. The site lives
 * on the family's domain (frotzlens.frotzinc.com, since 2026-11-06); to move it,
 * change `siteUrl` here and nowhere else.
 */
export const site = {
  name: 'Frotzlens',
  tagline: 'See inside a Z-machine story file',
  description:
    'A browser-based disassembler and inspector for Z-machine story files: header, memory map, objects, dictionary, grammar, every routine and every string. Everything runs in your browser; nothing is uploaded.',
  siteUrl: 'https://frotzlens.frotzinc.com',
  repoUrl: 'https://github.com/cschweda/frotzlens',
  /** The published @frotzinc libraries (the frotzlens CLI follows in Phase 5). */
  npmUrl: 'https://www.npmjs.com/org/frotzinc',
  familyUrl: 'https://frotzinc.com',
  sample: { file: 'dark-cellar.z5', title: 'The Dark Cellar' },
} as const
