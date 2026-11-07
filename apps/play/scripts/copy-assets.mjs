// Copies what the site serves but doesn't commit twice: the start page's sample stories (named in
// site.config.ts, from the repository's samples/) into public/samples/, and the player's fonts
// (OpenDyslexic) into public/fonts/.
import { cpSync, mkdirSync, readFileSync } from 'node:fs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const files = [...config.matchAll(/file:\s*'([\w.-]+\.z[3458])'/g)].map(m => m[1])
if (!files.length) throw new Error('copy-assets: no samples in site.config.ts')
const pub = new URL('../public/', import.meta.url)
mkdirSync(new URL('samples/', pub), { recursive: true })
for (const f of files) cpSync(new URL(`../../../samples/${f}`, import.meta.url), new URL(`samples/${f}`, pub))
cpSync(new URL('../../../packages/player/fonts/', import.meta.url), new URL('fonts/', pub), { recursive: true })
// The <frotz-play> element (built by @frotzinc/player), which Export puts into what it makes.
cpSync(new URL('../../../packages/player/dist/frotz-play.js', import.meta.url), new URL('frotz-play.js', pub))
console.log(`copy-assets: ${files.length} samples, the fonts, frotz-play.js`)
