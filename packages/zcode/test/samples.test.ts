/**
 * The story files in the repository's samples/ folder (built by
 * scripts/build-samples.mjs): each parses cleanly. With INFODUMP set, each
 * section of each one is also compared with the real infodump, and with TXD
 * set, the whole disassembly with the real txd (both modes) — more stories
 * than the fixtures cover (e.g. Mingus II, the v8 builds). PunyInform's
 * grammar sections are left out: Ztools misreads its version-3 grammar.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  formatAbbreviations,
  formatDictionary,
  formatGrammar,
  formatHeader,
  formatMap,
  formatObjects,
  formatTree,
  formatTxd,
} from '../src/format/index.js'
import { parseStory } from '../src/index.js'

const SAMPLES = fileURLToPath(new URL('../../../samples/', import.meta.url))
const files = readdirSync(SAMPLES).filter(f => /\.z\d$/.test(f)).sort()

describe('samples/', () => {
  it('has the samples, tiny to large', () => {
    expect(files.length).toBeGreaterThanOrEqual(30)
  })

  it.each(files)('%s parses without errors', (f) => {
    const s = parseStory(new Uint8Array(readFileSync(SAMPLES + f)))
    expect(s.errors).toEqual([])
    expect(s.objects.objects.length).toBeGreaterThan(0)
  })
})

describe.runIf(process.env.INFODUMP)('samples/ against the real infodump (INFODUMP is set)', () => {
  const formats = { i: formatHeader, a: formatAbbreviations, o: formatObjects, t: formatTree, d: formatDictionary, m: formatMap, g: formatGrammar }
  it.each(files)('%s: -i -a -o -t -d -m -g', (f) => {
    const story = parseStory(new Uint8Array(readFileSync(SAMPLES + f)))
    for (const [opt, format] of Object.entries(formats)) {
      if (f.startsWith('puny-') && (opt === 'm' || opt === 'g')) continue
      if (f === 'minimal.z5' && opt === 'm') continue // infodump's -m mis-sizes an empty property-names table
      // Resolved first: it runs from samples/, so a relative INFODUMP would otherwise not be found.
      const r = spawnSync(resolve(process.env.INFODUMP!), [`-${opt}`, f], { cwd: SAMPLES, encoding: 'latin1' })
      expect(r.status).toBe(0)
      expect(format(story, { fileName: f }), `-${opt}`).toBe(r.stdout)
    }
  })
})

/**
 * Each routine block's lines without its grammar notes or blank lines, by header (as txd.test.ts
 * compares PunyInform: txd's garbage notes for it come with an extra blank line).
 */
function blocks(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const block of text.split(/\n\[End of code/)[0]!.split(/\n(?=(?:Main r|R)outine [^,]+,)/)) {
    const m = /^(?:Main r|R)outine ([^,]+),/.exec(block)
    if (!m) continue
    const lines: string[] = []
    let notes = false
    for (const l of block.split('\n')) {
      if (/^ {4}(Action|Parsing|Pre-action) routine for:$/.test(l)) notes = true
      else if (!(notes && l.startsWith('        '))) {
        notes = false
        if (l !== '') lines.push(l)
      }
    }
    out.set(m[1]!, lines.join('\n'))
  }
  return out
}

describe.runIf(process.env.TXD)('samples/ against the real txd (TXD is set)', () => {
  it.each(files)('%s: txd and txd -n', (f) => {
    const story = parseStory(new Uint8Array(readFileSync(SAMPLES + f)))
    for (const addresses of [false, true]) {
      const r = spawnSync(resolve(process.env.TXD!), addresses ? ['-n', f] : [f], { cwd: SAMPLES, encoding: 'latin1', maxBuffer: 1 << 28 })
      const ours = formatTxd(story, { addresses })
      if (!f.startsWith('puny-')) {
        expect(r.status).toBe(0)
        expect(ours === r.stdout, `txd${addresses ? ' -n' : ''}`).toBe(true)
        continue
      }
      // PunyInform: Ztools misreads its grammar, so compare every finished routine without the notes,
      // and the string section exactly when txd got that far.
      const want = blocks(r.stdout)
      const got = blocks(ours)
      const complete = r.stdout.includes('[End of code')
      const keys = [...want.keys()].slice(0, complete ? undefined : -1)
      expect(keys.length, 'routines txd finished').toBeGreaterThan(30)
      for (const k of keys) expect(got.get(k), `routine ${k}`).toBe(want.get(k))
      if (complete) {
        const strings = (t: string) => t.slice(t.indexOf('[End of code'))
        expect(strings(ours) === strings(r.stdout), 'string section').toBe(true)
      }
    }
  })
})
