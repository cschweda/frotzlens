#!/usr/bin/env node
// Builds samples/*.z3|z5|z8 — story files to try Frotzlens on, from tiny to
// large — from the Inform 6 sources in samples/src (Christopher Schweda's
// Frotzsmith samples, plus `minimal`), and writes samples/README.md's table.
//
//   node scripts/build-samples.mjs
//
// Standard Library sources are built as v5 (the three largest also as v8);
// PunyInform sources (puny-*) as v5 and v3. Every source gets
// `Serial "000000";`, as the test fixtures do, so a rebuild gives the same
// bytes and git sees no change.
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { compile } from '@frotzinc/inform6-wasm'
import { withFixedSerial } from '../packages/zcode/scripts/build-fixtures.mjs'

const DIR = new URL('../samples/', import.meta.url)
const SRC = new URL('src/', DIR)
const ALSO_V8 = new Set(['architect-legacy', 'mingus-1', 'mingus-2'])
/** v3 can't hold these: a v3 property has room for 4 dictionary words (§12.4.1), this sample names 5. */
const NOT_V3 = new Set(['puny-magic-8-ball'])

/** The sample's one-line description: the title line of its header comment. */
function describe(source) {
  const line = source.split('\n').find(l => /^!\s+\S.*(—|--)/.test(l)) ?? ''
  return line.replace(/^!\s+/, '').replace(/\s+/g, ' ').trim()
}

// Compile everything first, and only then replace the files: a source that fails leaves the
// folder as it was.
const rows = []
const built = []
for (const file of readdirSync(SRC).filter(f => f.endsWith('.inf')).sort()) {
  const name = file.replace(/\.inf$/, '')
  const source = withFixedSerial(readFileSync(new URL(file, SRC), 'utf8'))
  const puny = name.startsWith('puny-')
  const library = name === 'minimal' ? 'std' : puny ? 'puny' : 'std'
  const versions = puny ? (NOT_V3.has(name) ? ['z5'] : ['z3', 'z5']) : ALSO_V8.has(name) ? ['z5', 'z8'] : ['z5']
  for (const version of versions) {
    const r = await compile(source, { version, library })
    if (!r.ok) throw new Error(`${name}.${version} failed to compile (samples/ unchanged):\n${r.rawOutput}`)
    built.push([`${name}.${version}`, r.story])
    rows.push({ file: `${name}.${version}`, bytes: r.story.length, library: name === 'minimal' ? 'none' : puny ? 'PunyInform' : 'Standard Library', what: describe(source) })
    console.log(`built ${name}.${version} (${r.story.length} bytes)`)
  }
}

for (const f of readdirSync(DIR)) if (/\.z\d$/.test(f)) rmSync(new URL(f, DIR))
for (const [file, story] of built) writeFileSync(new URL(file, DIR), story)

rows.sort((a, b) => a.bytes - b.bytes || a.file.localeCompare(b.file))
const kb = n => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
const table = rows.map(r => `| \`${r.file}\` | ${kb(r.bytes)} | ${r.library} | ${r.what} |`).join('\n')
writeFileSync(
  new URL('README.md', DIR),
  `# Sample story files

Story files to try Frotzlens on, from tiny to large. Run the CLI on one (after \`pnpm install && pnpm build\`
at the repository root): \`node packages/cli/dist/bin.js --objects samples/dark-cellar.z5\`. The web app,
when it arrives in Phase 3, will take them by drag and drop. They are Christopher Schweda's own games and
examples from [Frotzsmith](https://frotzsmith.com), plus \`minimal\`, a Frotzlens test fixture; all compiled
with Inform 6.44 by \`@frotzinc/inform6-wasm\`. The sources are in [\`src/\`](src/).

To rebuild them (the bytes come out the same): \`pnpm samples\`. Each is compiled with \`Serial "000000";\`,
so the serial number reads 000000.

Not here: the two *Haunted House* samples (derived from a 1979 commercial game) and Frotzsmith's ZIL
samples (from the GPL ZILF repository, and compiled by ZILF). These are for trying the tools; the test
suite builds its own fixtures (\`packages/zcode/test/fixtures\`).

| File | Size | Library | What it is |
|---|---|---|---|
${table}

Copyright Christopher Schweda. The Inform 6 libraries compiled into them are the Inform Standard
Library (Artistic License 2.0) and PunyInform (MIT).
`,
)
console.log(`${rows.length} samples; samples/README.md written`)
