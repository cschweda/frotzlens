#!/usr/bin/env node
// Builds every test fixture with @frotzinc/inform6-wasm into test/.fixtures/
// (gitignored): <name>.z<v> and, for debug builds, <name>.dbg.
//
// Each source gets `Serial "000000";` injected (after any leading `!%` lines,
// which must stay first), so a fixture is byte-for-byte the same whatever day
// it's built: Inform otherwise stamps the compile date as the serial, and the
// header checksum changes with it.
//
//   node scripts/build-fixtures.mjs        build any that are missing or stale
//   node scripts/build-fixtures.mjs --force
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile } from '@frotzinc/inform6-wasm'

const ROOT = new URL('../', import.meta.url)
const SRC = new URL('test/fixtures/src/', ROOT)
export const OUT = fileURLToPath(new URL('test/.fixtures/', ROOT))

/** name → how it's built. `name` is the output stem; `src` the .inf stem. */
export const FIXTURES = [
  { name: 'dark-cellar', src: 'dark-cellar', version: 'z5', debug: true },
  // The Standard Library 6.12 needs v5+ (v3 has too few properties and call arguments, v4 lacks
  // tokenise, save_undo and check_arg_count), so the v3 and v4 builds are the PunyInform port.
  { name: 'puny-dark-cellar-v3', src: 'puny-dark-cellar', version: 'z3', library: 'puny' },
  { name: 'puny-dark-cellar-v4', src: 'puny-dark-cellar', version: 'z4', library: 'puny' },
  { name: 'dark-cellar-v8', src: 'dark-cellar', version: 'z8' },
  { name: 'puny-dark-cellar', src: 'puny-dark-cellar', version: 'z5', library: 'puny', debug: true },
  { name: 'locked-chest', src: 'locked-chest', version: 'z5', debug: true },
  { name: 'hermit', src: 'hermit', version: 'z5', debug: true },
  { name: 'demo', src: 'demo', version: 'z5', debug: true },
  { name: 'mingus-1', src: 'mingus-1', version: 'z5', debug: true },
  { name: 'architect-legacy', src: 'architect-legacy', version: 'z5', debug: true },
  { name: 'grammar', src: 'grammar', version: 'z5', debug: true },
  { name: 'list-exits', src: 'list-exits', version: 'z5', debug: true },
  { name: 'magic-8-ball', src: 'magic-8-ball', version: 'z5', debug: true },
  { name: 'gv1', src: 'gv1', version: 'z5', debug: true },
  { name: 'minimal', src: 'minimal', version: 'z5', debug: true },
]

/** The source with `Serial "000000";` after any leading `!%` lines. */
export function withFixedSerial(source) {
  const lines = source.split('\n')
  let i = 0
  while (i < lines.length && lines[i].startsWith('!%')) i++
  lines.splice(i, 0, 'Serial "000000";')
  return lines.join('\n')
}

const storyPath = f => `${OUT}${f.name}.${f.version}`

/** Build the fixtures (only those whose source or recipe changed, unless force). */
export async function buildFixtures({ force = false, log = () => {} } = {}) {
  mkdirSync(OUT, { recursive: true })
  for (const f of FIXTURES) {
    const source = withFixedSerial(readFileSync(new URL(`${f.src}.inf`, SRC), 'utf8'))
    const key = createHash('sha256').update(JSON.stringify(f)).update(source).digest('hex')
    const stamp = `${OUT}${f.name}.key`
    if (!force && existsSync(stamp) && existsSync(storyPath(f)) && readFileSync(stamp, 'utf8') === key) continue
    const r = await compile(source, { version: f.version, library: f.library ?? 'std', debug: !!f.debug })
    if (!r.ok) throw new Error(`fixture ${f.name} failed to compile:\n${r.rawOutput}`)
    writeFileSync(storyPath(f), r.story)
    if (r.dbg) writeFileSync(`${OUT}${f.name}.dbg`, r.dbg)
    writeFileSync(stamp, key)
    log(`built ${f.name}.${f.version} (${r.story.length} bytes)`)
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) await buildFixtures({ force: process.argv.includes('--force'), log: console.log })
