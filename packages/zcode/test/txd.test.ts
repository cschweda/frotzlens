/**
 * Differential tests against Ztools' txd: our disassembly of every fixture,
 * as txd prints it and as `txd -n` does, must equal txd's byte for byte. The
 * golden files (test/golden/*.txd*.txt.gz) come from scripts/golden.sh.
 *
 * PunyInform stories are the exception: their grammar is version 3, which txd
 * reads as version 1, so its "Action routine for:" notes are garbage (and for
 * two v3 stories it stops partway). For those, every routine txd finished is
 * compared without its grammar notes, and so is the string section when txd
 * got that far.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { formatRoutine, formatTxd } from '../src/format/index.js'
import { parseStory } from '../src/index.js'
import { FIXTURES_DIR, GOLDEN_DIR, readStory, storyFiles } from './fixtures.js'

const golden = (name: string, mode: 'txd' | 'txd-n') =>
  gunzipSync(readFileSync(`${GOLDEN_DIR}${name}.${mode}.txt.gz`)).toString('latin1')

/** The first differing line, for a readable failure on 18,000-line files. */
function firstDifference(ours: string, theirs: string): string | undefined {
  const a = ours.split('\n')
  const b = theirs.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `line ${i + 1}:\n  txd:  ${JSON.stringify(b[i])}\n  ours: ${JSON.stringify(a[i])}`
  }
  return undefined
}

/** txd's routine blocks, by address, without grammar notes (for the PunyInform comparison). */
function routineBlocks(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const code = text.split(/\n\[End of code/)[0]!
  for (const block of code.split(/\n(?=(?:Main r|R)outine [^,]+,)/)) {
    const m = /^(?:Main r|R)outine ([^,]+),/.exec(block)
    if (!m) continue
    const lines: string[] = []
    let notes = false
    for (const l of block.split('\n')) {
      if (/^ {4}(Action|Parsing|Pre-action) routine for:$/.test(l)) {
        notes = true
        continue
      }
      if (notes && l.startsWith('        ')) continue
      notes = false
      if (l !== '') lines.push(l)
    }
    out.set(m[1]!, lines)
  }
  return out
}

describe.each(storyFiles())('%s matches txd', (file) => {
  const name = file.replace(/\.z\d$/, '')
  const story = parseStory(readStory(file))
  const puny = name.startsWith('puny-')

  it.each([
    ['txd', false],
    ['txd -n', true],
  ] as const)('%s', (_label, addresses) => {
    const theirs = golden(name, addresses ? 'txd-n' : 'txd')
    const ours = formatTxd(story, { addresses })
    if (!puny) {
      expect(firstDifference(ours, theirs)).toBeUndefined()
      return
    }
    const want = routineBlocks(theirs)
    const got = routineBlocks(ours)
    // txd stops partway on two v3 PunyInform stories, mid-routine: leave out only that last block.
    const complete = theirs.includes('[End of code')
    const finished = complete ? [...want.keys()] : [...want.keys()].slice(0, -1)
    expect(finished.length).toBeGreaterThan(30)
    for (const key of finished) expect(got.get(key), `routine ${key}`).toEqual(want.get(key))
    // The string section has no grammar in it: it must match exactly.
    if (complete) {
      const strings = (t: string) => t.slice(t.indexOf('[End of code'))
      expect(firstDifference(strings(ours), strings(theirs))).toBeUndefined()
    }
  })
})

describe('the Phase 2 exit criterion: `frotzlens --routine <addr> dark-cellar.z5` matches txd', () => {
  const story = parseStory(readStory('dark-cellar.z5'))

  it.each([false, true])('every routine, alone, is exactly its block in txd (addresses: %s)', (addresses) => {
    const theirs = golden('dark-cellar', addresses ? 'txd-n' : 'txd')
    for (const r of story.code.routines) {
      const ours = formatRoutine(story, r.address, { addresses })!
      // In txd's output, each routine block is "\n" + the block.
      expect(theirs.includes(`\n${ours}`), `routine ${r.address.toString(16)}`).toBe(true)
    }
    expect(story.code.routines).toHaveLength(405)
  })

  it('through the CLI', () => {
    const bin = fileURLToPath(new URL('../../cli/dist/bin.js', import.meta.url))
    const r = spawnSync(process.execPath, [bin, '--routine', '27f8', 'dark-cellar.z5'], { cwd: FIXTURES_DIR, encoding: 'utf8' })
    if (r.error || r.status === null) return // the CLI isn't built in this run (it's tested in its package)
    expect(r.status).toBe(0)
    expect(golden('dark-cellar', 'txd').includes(`\n${r.stdout}`)).toBe(true)
    expect(r.stdout.startsWith('Routine R0002, 0 locals\n')).toBe(true)
  })
})
