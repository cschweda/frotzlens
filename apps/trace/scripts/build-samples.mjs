// Builds frotztrace's samples (docs/21 §3): frotzsmith's sample games, each compiled from
// samples/src with @frotzinc/inform6-wasm and debugging on, so each has its story, its debug file
// (names, source lines) and its source, plus its walkthrough. Into public/samples/ (not committed).
// The source shipped is exactly the one compiled (with its fixed serial line), so the debug file's
// line numbers match it. A rebuild gives the same bytes.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compile } from '@frotzinc/inform6-wasm'
import { withFixedSerial } from '../../../packages/zcode/scripts/build-fixtures.mjs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const samples = [...config.matchAll(/\{\s*id:\s*'([\w-]+)',[^}]*?library:\s*'(std|puny)'/g)].map(m => ({ id: m[1], library: m[2] }))
if (!samples.length) throw new Error('build-samples: no samples in site.config.ts')
const SRC = new URL('../../../samples/src/', import.meta.url)
const WALK = new URL('../../../samples/walkthroughs/', import.meta.url)
const OUT = new URL('../public/samples/', import.meta.url)
mkdirSync(OUT, { recursive: true })

for (const { id, library } of samples) {
  const source = withFixedSerial(readFileSync(new URL(`${id}.inf`, SRC), 'utf8'))
  const r = await compile(source, { version: 'z5', library, debug: true })
  if (!r.ok || !r.story || !r.dbg) throw new Error(`build-samples: ${id} didn't compile:\n${r.rawOutput}`)
  writeFileSync(new URL(`${id}.z5`, OUT), r.story)
  writeFileSync(new URL(`${id}.dbg`, OUT), r.dbg)
  writeFileSync(new URL(`${id}.inf`, OUT), source)
  const walk = new URL(`${id}.txt`, WALK)
  if (existsSync(walk)) cpSync(walk, new URL(`${id}.txt`, OUT))
  console.log(`build-samples: ${id} (${r.story.length} bytes, with its debug file and source)`)
}
