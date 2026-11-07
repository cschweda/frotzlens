// Fills dev/public for the dev page: the samples (from samples/), the fonts, the favicon, and the
// timed-input test story compiled from @frotzinc/zmachine's fixture. Rebuilt every run; gitignored.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { compile } from '@frotzinc/inform6-wasm'

const here = new URL('./', import.meta.url)
const pub = new URL('public/', here)
rmSync(pub, { recursive: true, force: true })
mkdirSync(new URL('stories/', pub), { recursive: true })
const samples = new URL('../../../samples/', here)
for (const f of ['dark-cellar.z5', 'locked-chest.z5', 'hermit.z5', 'magic-8-ball.z5', 'puny-dark-cellar.z3', 'mingus-1.z5']) {
  cpSync(new URL(f, samples), new URL(`stories/${f}`, pub))
}
cpSync(new URL('../fonts/', here), new URL('fonts/', pub), { recursive: true })
cpSync(new URL('../../../apps/play/public/favicon.svg', here), new URL('favicon.svg', pub))
const timed = await compile(readFileSync(new URL('../../zmachine/test/fixtures/timed.inf', here), 'utf8'), { version: 'z5' })
if (!timed.ok) throw new Error(timed.rawOutput)
writeFileSync(new URL('stories/timed.z5', pub), timed.story)
const upper = await compile(readFileSync(new URL('../e2e/fixtures/upper.inf', here), 'utf8'), { version: 'z5' })
if (!upper.ok) throw new Error(upper.rawOutput)
writeFileSync(new URL('stories/upper.z5', pub), upper.story)
console.log('dev/public ready')
