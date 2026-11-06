/**
 * What the fixtures never exercise, pinned against infodump's own output.
 * Each expectation below is what infodump 7/3.1a printed for the same patch
 * of minimal.z5 (or puny-dark-cellar-v3/-v4) — observed black-box, one header
 * byte or table at a time, on 2026-11-06.
 *
 * To re-verify them against the real binary, run with INFODUMP set:
 *
 *   INFODUMP=/path/to/infodump pnpm --filter @frotzinc/zcode test
 *
 * Then every story a test formats here is also written to a temp folder and
 * given to infodump (from that folder, with a short name), and our whole
 * output must equal infodump's, except where a test marks it deliberate. Each
 * test checks itself, so any one of them can run alone.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatDictionary, formatHeader, Writer } from '../src/format/index.js'
import { parseStory } from '../src/index.js'
import { readStory } from './fixtures.js'

type Patch = [address: number, value: number, kind?: 'word']

/** Patched stories whose output differs from infodump's on purpose: not live-checked. */
const deliberate = new WeakSet<Uint8Array>()
const INFODUMP = process.env.INFODUMP ? resolve(process.env.INFODUMP) : undefined

/**
 * Our infodump-format text for a story (`-i` by default). With INFODUMP set,
 * it must also equal what the real infodump prints for the same bytes.
 */
function format(bytes: Uint8Array, opt: 'i' | 'd' = 'i'): string {
  const name = `p.z${bytes[0]}`
  const ours = (opt === 'i' ? formatHeader : formatDictionary)(parseStory(bytes), { fileName: name })
  if (INFODUMP && !deliberate.has(bytes)) {
    const dir = mkdtempSync(join(tmpdir(), 'zcode-probe-'))
    try {
      // A short, bare name, run from the story's folder: infodump overflows an 80-byte buffer on a long path.
      writeFileSync(join(dir, name), bytes)
      const r = spawnSync(INFODUMP, [`-${opt}`, name], { cwd: dir, encoding: 'latin1' })
      expect(r.status, `infodump -${opt}`).toBe(0)
      expect(ours, `against infodump -${opt}`).toBe(r.stdout)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  return ours
}

function patched(file: string, patches: Patch[], opts: { deliberate?: boolean } = {}): Uint8Array {
  const b = readStory(file).slice()
  for (const [a, v, kind] of patches) {
    if (kind === 'word') {
      b[a] = v >> 8
      b[a + 1] = v & 0xff
    } else b[a] = v
  }
  if (opts.deliberate) deliberate.add(b)
  return b
}

const headerLine = (bytes: Uint8Array, label: string) =>
  format(bytes)
    .split('\n')
    .find(l => l.startsWith(label))
    ?.slice(26)

describe('header flags, as infodump names them', () => {
  const v3 = 'puny-dark-cellar-v3.z3'
  const v5 = 'minimal.z5'

  it.each([
    [1, 'Display time'],
    [2, 'Display score/moves, Unknown (0x04)'],
    [3, 'Display score/moves, Tandy'],
    [4, 'Display score/moves, No status line'],
    [5, 'Display score/moves, Windows available'],
    [6, 'Display score/moves, Proportional fonts used'],
    [7, 'Display score/moves, Unknown (0x80)'],
  ])('v3 flags1 bit %i: %s', (bit, text) => {
    expect(headerLine(patched(v3, [[0x01, 1 << bit]]), 'Interpreter flags')).toBe(text)
  })

  it.each([
    [1, 'Pictures'],
    [2, 'Bold font'],
    [3, 'Emphasis'],
    [4, 'Fixed space font'],
    [5, 'Unknown (0x20)'],
    [6, 'Unknown (0x40)'],
    [7, 'Timed input'],
  ])('v4+ flags1 bit %i: %s', (bit, text) => {
    expect(headerLine(patched(v5, [[0x01, 1 << bit]]), 'Interpreter flags')).toBe(text)
    expect(headerLine(patched('puny-dark-cellar-v4.z4', [[0x01, 1 << bit]]), 'Interpreter flags')).toBe(text)
  })

  it.each([
    [0, 'Scripting'],
    [1, 'Use fixed font'],
    [2, 'Screen refresh required'],
    [3, 'Supports graphics'],
    [4, 'Supports undo'],
    [5, 'Supports mouse'],
    [6, 'Supports colour'],
    [7, 'Supports sound'],
    [8, 'Supports menus'],
    [9, 'Unknown (0x0200)'],
    [10, 'Printer error'],
    [11, 'Unknown (0x0800)'],
    [15, 'Unknown (0x8000)'],
  ])('v4+ flags2 bit %i: %s', (bit, text) => {
    expect(headerLine(patched(v5, [[0x10, 1 << bit, 'word']]), 'Game flags')).toBe(text)
  })

  it.each([
    [0, 'Scripting'],
    [1, 'Use fixed font'],
    [2, 'Unknown (0x0004)'],
    [4, 'Supports sound'],
    [9, 'Unknown (0x0200)'],
  ])('v3 flags2 bit %i: %s', (bit, text) => {
    expect(headerLine(patched(v3, [[0x10, 1 << bit, 'word']]), 'Game flags')).toBe(text)
  })

  it.each([
    [5, 'Unknown (0x0020)', '0x0010'],
    [6, 'Unknown (0x0040)', '0x0020'],
    [7, 'Unknown (0x0080)', '0x0040'],
    [8, 'Unknown (0x0100)', '0x0080'],
  ])('v3 flags2 bit %i names its own mask: %s (deliberate: infodump prints %s)', (bit, text) => {
    expect(headerLine(patched(v3, [[0x10, 1 << bit, 'word']], { deliberate: true }), 'Game flags')).toBe(text)
  })

  it('several flags are joined with ", "', () => {
    expect(headerLine(patched(v5, [[0x10, 0x0051, 'word']]), 'Game flags')).toBe('Scripting, Supports undo, Supports colour')
  })
})

describe('header: optional fields', () => {
  const v5 = 'minimal.z5'
  const tail = (bytes: Uint8Array) => format(bytes).split('\n').slice(20).join('\n')

  it('terminating keys, by name, joined with ", "', () => {
    // minimal.z5's terminating-characters table is at 0x04e0.
    const b = patched(v5, [[0x4e0, 129], [0x4e1, 133], [0x4e2, 13], [0x4e3, 255], [0x4e4, 0]])
    expect(format(b)).toContain(
      '    Keys used: Up arrow, F1, Unknown key (0x0d), Any function key\n',
    )
  })

  it.each([
    [130, 'Down arrow'], [132, 'Right arrow'], [144, 'F12'], [145, 'KP0'], [154, 'KP9'],
    [252, 'Menu click'], [253, 'Single mouse click'], [254, 'Double mouse click'], [65, 'Unknown key (0x41)'],
  ])('key %i is %s', (k, name) => {
    expect(format(patched(v5, [[0x4e0, k], [0x4e1, 0]]))).toContain(`Keys used: ${name}\n`)
  })

  it('no terminating-keys lines when the address is 0', () => {
    const text = format(patched(v5, [[0x2e, 0, 'word']]))
    expect(text).not.toContain('Terminating keys')
    expect(text).not.toContain('Keys used')
  })

  it('a custom alphabet table: its address and its three rows, each up to a 0', () => {
    const b = readStory(v5).slice()
    const table = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ@#0123456789.,!?_#\'"/\\-:()'
    for (let i = 0; i < 78; i++) b[0x200 + i] = table.charCodeAt(i)
    b[0x34] = 0x02
    b[0x35] = 0x00
    expect(format(b)).toContain(
      'Alphabet address:         0200\n' +
        '    "abcdefghijklmnopqrstuvwxyz"\n' +
        '    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"\n' +
        '    "@#0123456789.,!?_#\'"/\\-:()"\n' +
        'Header extension address: 0102\n',
    )
  })

  it('no header extension: only the Inform version line', () => {
    expect(tail(patched(v5, [[0x36, 0, 'word']]))).toBe('    Keys used: \nInform Version:           6.44\n')
  })

  it.each([
    [0, 'Header extension length:  0000\n'],
    [2, 'Header extension length:  0002\n'],
    [4, 'Header extension length:  0004\nUnicode table address:    3333\n'],
  ])('a header extension of %i words', (n, expected) => {
    const b = patched(v5, [[0x102, n, 'word'], [0x104, 0x1111, 'word'], [0x106, 0x2222, 'word'], [0x108, 0x3333, 'word'], [0x10a, 0x4444, 'word']])
    expect(tail(b)).toBe(`    Keys used: \nHeader extension address: 0102\nInform Version:           6.44\n${expected}`)
  })

  it.each([
    ['ABCD', 'ABCD'],
    ['6.4 ', '6.4 '],
    ['7.00', '7.00'],
    ['x\0\0\0', 'x'],
    ['1234', undefined],
    ['  12', undefined],
    ['\0\0\0\0', undefined],
  ])('bytes 0x3C–0x3F %j → Inform Version %j', (bytes, shown) => {
    const b = readStory(v5).slice()
    for (let i = 0; i < 4; i++) b[0x3c + i] = bytes.charCodeAt(i)
    expect(headerLine(b, 'Inform Version')).toBe(shown)
    // The model's own field is stricter: only d.dd counts as Inform's version.
    expect(parseStory(b).header.inform?.compilerVersion).toBe(bytes === '7.00' ? '7.00' : undefined)
  })
})

describe('Writer (infodump-style wrapping)', () => {
  it('keeps a 79-column line and breaks an 80-column one at its last space', () => {
    const exactly79 = `${'x'.repeat(78)} `
    expect(new Writer().write(`${exactly79}\n`).toString()).toBe(`${exactly79}\n`)
    // The 80th character is the "b" of "ab", so "ab" moves down whole (the space before it is dropped).
    expect(new Writer().write(`${'x'.repeat(77)} ab cd\n`).toString()).toBe(`${'x'.repeat(77)}\nab cd\n`)
  })

  it('width 0 never wraps', () => {
    const long = 'word '.repeat(40)
    expect(new Writer(0).write(long).toString()).toBe(long)
  })
})

describe('dictionary layout', () => {
  it('an empty dictionary is the two header lines and a blank line', () => {
    expect(formatDictionary(parseStory(readStory('minimal.z5')), { fileName: 'x' })).toBe(
      '\nStory file is x\n\n    **** Dictionary ****\n\n  Word separators = ".,""\n  Word count = 0, word size = 9\n\n',
    )
  })
})

describe('dictionary rows for other entry lengths', () => {
  it('8-byte entries: five 16-column cells fill 80 columns, so the 79-column wrap adds a blank line (as infodump does)', () => {
    // Observed: infodump -d on puny-dark-cellar-v3.z3 with its entry length patched from 7 to 8
    // prints "[   1] …  [   5] …  " then an empty line, then the next row.
    const b = readStory('puny-dark-cellar-v3.z3').slice()
    const d = (b[8]! << 8) | b[9]!
    b[d + 1 + b[d]!] = 8
    // Deliberate for the INFODUMP check: with the entry length changed, some words no longer end
    // where their 4 bytes do, and infodump reads them on past it until an end bit; we read the 4
    // bytes a v3 entry has (§13.3). Only the layout is asserted here.
    deliberate.add(b)
    const lines = format(b, 'd').split('\n')
    // Lines 0–7: banner, separators, word count, blank. Then the rows.
    expect(lines[8]!.match(/\[/g)).toHaveLength(5)
    expect(lines[9]).toBe('')
    expect(lines[10]!.startsWith('[   6]')).toBe(true)
  })
})
