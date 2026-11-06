/**
 * Frotzlens — identity and the one canonical URL, in one place. The domain may
 * become frotzlens.frotzinc.com when the family moves to subdomains: change
 * `siteUrl` here and nowhere else.
 */
export const site = {
  name: 'Frotzlens',
  tagline: 'See inside a Z-machine story file',
  description:
    'A browser-based disassembler and inspector for Z-machine story files: header, memory map, objects, dictionary, grammar, every routine and every string. Everything runs in your browser; nothing is uploaded.',
  siteUrl: 'https://frotzlens.com',
  repoUrl: 'https://github.com/cschweda/frotzlens',
  npmUrl: 'https://www.npmjs.com/package/frotzlens',
  familyUrl: 'https://frotzinc.com',
  sample: { file: 'dark-cellar.z5', title: 'The Dark Cellar' },
} as const
