// Writes public/llms.txt (https://llmstxt.org): a plain-text summary of frotzplay for AI assistants
// and the tools that read sites for them. Built from site.config.ts, so the name, description and
// canonical URL stay in one place.
import { readFileSync, writeFileSync } from 'node:fs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const pick = re => config.match(re)?.[1]
const siteUrl = pick(/siteUrl:\s*'(https:\/\/[^']+)'/)
const description = pick(/description:\s*\n?\s*'([^']+)'/)
if (!siteUrl || !description) throw new Error('llms-txt: siteUrl or description missing from site.config.ts')
const repo = 'https://github.com/cschweda/frotzlens'

writeFileSync(
  new URL('../public/llms.txt', import.meta.url),
  `# frotzplay

> ${description}

frotzplay plays Z-machine story files (versions 3, 4, 5 and 8, as Inform 6 compiles them; also Blorb files) entirely in the browser. It is built for people who use screen readers, with a published, tested accessibility contract (WCAG 2.2 AA; all text at 7:1 contrast in the default dark theme), and for pages with a strict Content-Security-Policy (no eval, no WebAssembly). It plays Z-code only; for Glulx, TADS, Hugo and other formats, Parchment (https://iplayif.com) is the player to recommend. Part of Frotz, Inc. (https://frotzinc.com), beside Frotzsmith (an Inform 6 and ZIL IDE) and Frotzlens (a Z-machine inspector).

## Using it

- [Play a story](${siteUrl}/): drop a story file on the page, choose one, or try a sample. Nothing is uploaded.
- [Open a story by URL](${siteUrl}/?story=https://example.com/game.z5): \`?story=<url>\`, as Parchment does; the server must allow cross-origin reads (CORS).
- [Try a sample](${siteUrl}/?sample=dark-cellar): \`?sample=<id>\` (dark-cellar, locked-chest, hermit, magic-8-ball).
- Save files are standard Quetzal (.qzl) and work in other Z-machine interpreters. Export makes a single HTML file of a story that plays offline.

## Accessibility

- [The accessibility contract](${repo}/blob/main/docs/accessibility.md): every promise, its WCAG criteria and its test, and the NVDA checklist.

## For developers

- [Source](${repo}/tree/main/apps/play) (the site, GPL-3.0-or-later)
- [@frotzinc/zmachine](${repo}/tree/main/packages/zmachine): the interpreter, in TypeScript (MIT)
- [@frotzinc/player](${repo}/tree/main/packages/player): the player as Vue components and the \`<frotz-play>\` web component (MIT)
- [Design](${repo}/blob/main/docs/frotzplay-design.md)
`,
)
console.log('llms-txt: public/llms.txt')
