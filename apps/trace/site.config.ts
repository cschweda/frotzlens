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
  /**
   * The start page's samples (docs/21 §3): frotzsmith's sample games, built with their debug files
   * and sources from samples/src (scripts/build-samples.mjs), so breakpoints on actions and lines
   * work at once. The first is featured (`?sample`).
   */
  samples: [
    { id: 'dark-cellar', title: 'The Dark Cellar', blurb: 'Darkness and light: try a breakpoint on Take.', library: 'std' },
    { id: 'locked-chest', title: 'The Locked Chest', blurb: 'A key, a chest, and the parser.', library: 'std' },
    { id: 'hermit', title: 'The Hermit', blurb: 'Someone to talk to: conversation rules.', library: 'std' },
    { id: 'magic-8-ball', title: 'Magic 8-Ball', blurb: 'Random answers, replayed exactly.', library: 'std' },
    { id: 'puny-dark-cellar', title: 'The Dark Cellar (PunyInform)', blurb: 'The same game on the small library.', library: 'puny' },
  ],
} as const
