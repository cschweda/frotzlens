/**
 * routineView and formatStrings: the app's linked disassembly is txd's text,
 * piece for piece, and every link names something that exists.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatRoutine, formatStrings, formatTxd, routineView, txdRoutineName, txdStringName } from '../src/format/index.js'
import { parseStory } from '../src/index.js'
import type { StoryFile } from '../src/types.js'

const SAMPLES = fileURLToPath(new URL('../../../samples/', import.meta.url))
const files = readdirSync(SAMPLES).filter(f => /\.z\d$/.test(f)).sort()
const load = (f: string) => parseStory(new Uint8Array(readFileSync(SAMPLES + f)))

/** Does an Id name something in the story? */
function exists(s: StoryFile, id: string): boolean {
  const [kind, rest] = id.split(':') as [string, string]
  const n = parseInt(rest, kind === 'object' ? 10 : 16)
  switch (kind) {
    case 'object': return n >= 1 && n <= s.objects.objects.length
    case 'routine': return s.code.routines.some(r => r.address === n)
    case 'string': return s.strings.some(x => x.address === n)
    case 'dict': return s.dictionary.entries.some(e => e.address === n)
    default: return false
  }
}

describe('routineView', () => {
  it.each(files)('%s: every routine joins to formatRoutine, and every link resolves', (f) => {
    const s = load(f)
    for (const r of s.code.routines) {
      const v = routineView(s, r.address)!
      for (const addresses of [false, true]) {
        const view = addresses ? routineView(s, r.address, { addresses })! : v
        const text = [view.header, ...view.notes, '', ...view.lines.map(l => {
          const lead = addresses ? `${l.address.toString(16).padStart(5)}:  ` : l.label ? `${l.label}: ` : '       '
          return lead + l.pieces.map(p => p.text).join('')
        })].join('\n') + '\n'
        expect(text).toBe(formatRoutine(s, r.address, { width: 0, addresses }))
      }
      const starts = new Set(v.lines.map(l => l.address))
      for (const l of v.lines) for (const p of l.pieces) {
        if (p.id) expect(exists(s, p.id), `${f} ${p.id}`).toBe(true)
        if (p.target !== undefined) expect(starts.has(p.target)).toBe(true)
      }
    }
  })

  it('links calls, strings, objects and dictionary words in a real story', () => {
    const s = load('dark-cellar.z5')
    const kinds = new Set<string>()
    for (const r of s.code.routines) for (const l of routineView(s, r.address)!.lines) for (const p of l.pieces) if (p.id) kinds.add(p.id.split(':')[0]!)
    expect([...kinds].sort()).toEqual(['dict', 'object', 'routine', 'string'])
  })

  it('is undefined for an address that is not a routine', () => {
    expect(routineView(load('dark-cellar.z5'), 1)).toBeUndefined()
  })
})

describe('txd names', () => {
  it('are the names the disassembly uses', () => {
    const s = load('dark-cellar.z5')
    for (const r of s.code.routines) expect(txdRoutineName(s, r.address)).toBe(routineView(s, r.address)!.name)
    expect(txdStringName(s, s.strings[0]!.address)).toBe('S001')
    expect(txdRoutineName(s, 1)).toBe('1')
  })
})

describe('property words in the cross-references', () => {
  it("an object's name words refer to their dictionary entries", () => {
    const s = load('dark-cellar.z5')
    const fromObjects = Object.entries(s.xrefs).filter(([k, e]) => k.startsWith('dict:') && e.from.some(f => f.id.startsWith('object:')))
    expect(fromObjects.length).toBeGreaterThan(10)
  })
})

describe('formatStrings', () => {
  it('is the string section of formatTxd', () => {
    const s = load('dark-cellar.z5')
    for (const addresses of [false, true]) {
      expect(formatTxd(s, { addresses })).toContain(formatStrings(s, { addresses }))
    }
    expect(formatStrings(s).split('\n')[0]).toMatch(/^S001: "/)
  })
})
