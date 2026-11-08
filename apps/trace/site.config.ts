/**
 * frotztrace — identity and the one canonical URL, in one place (as frotzlens's and frotzplay's
 * site.config.ts). To move the site, change `siteUrl` here and nowhere else.
 */
export const site = {
  name: 'frotztrace',
  tagline: 'Step through a Z-machine story, backwards too',
  /** At most 160 characters: search results and link previews cut longer ones. */
  description:
    'A debugger for Z-machine stories, in your browser: breakpoints, watches, a live object tree and call stack, and stepping backwards. Coming soon.',
  /** What the social card (public/og-image.png) shows, for its alt text. */
  imageAlt:
    'The frotztrace logo, an amber tile with a stepped trace under a playhead, beside the words "Step through a Z-machine story, backwards too", over a faded disassembly with the program counter on one line.',
  siteUrl: 'https://frotztrace.frotzinc.com',
  repoUrl: 'https://github.com/cschweda/frotzlens',
  npmUrl: 'https://www.npmjs.com/org/frotzinc',
  familyUrl: 'https://frotzinc.com',
  designUrl: 'https://github.com/cschweda/frotzlens/blob/main/docs/frotztrace-design.md',
} as const
