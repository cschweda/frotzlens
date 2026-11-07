/**
 * ZIL syntax tables, decoded without a ZILF-compiled story in the repository: the tables are built
 * here, by hand, in ZILF's layout, inside a real story's memory (an Inform fixture's, so its routines
 * and dictionary are real), and its globals pointed at them. The ZILF-compiled stories themselves
 * are checked against their source in zil.test.ts (local only).
 */
import { describe, expect, it } from 'vitest'
import { Bytes } from '../src/bytes.js'
import { formatZilGrammar, zilLineText } from '../src/format/index.js'
import { INFOCOM_SEARCH_FLAGS, ZILLIB_SEARCH_FLAGS, parseStory, parseZilGrammar, verbNumber } from '../src/index.js'
import { readStory } from './fixtures.js'

describe('verbNumber: where ZILF puts a verb number among a word\'s values', () => {
  it.each([
    ['verb only', [64 | 1, 0xfe, 0], 3, 0xfe],
    ['verb first, then an object', [128 | 64 | 1, 0xfd, 0], 3, 0xfd],
    ['object first (nothing marked first), then the verb', [128 | 64, 0, 0xfc], 3, 0xfc],
    ['a preposition comes first, the verb second', [64 | 8 | 1, 0xf0, 0xfb], 3, 0xfb],
    ['adjective first in v3, verb second', [64 | 32 | 2, 0xee, 0xfa], 3, 0xfa],
    ['v4+ writes no adjective value: the verb first', [64 | 32 | 1, 0xf9, 0], 5, 0xf9],
    ['preposition and buzzword fill both values: no verb number', [64 | 8 | 4, 1, 2], 3, undefined],
    ['not a verb', [128, 0, 0], 3, undefined],
  ] as const)('%s', (_, data, version, want) => {
    expect(verbNumber(data, version)).toBe(want)
  })
})

describe('parseZilGrammar', () => {
  // Real routines and dictionary from an Inform story; ZIL tables written into its dynamic memory.
  const base = parseStory(readStory('dark-cellar.z5'))
  const routines = base.code.routines
  const scale = 4
  const [r1, r2, r3] = routines.slice(5, 8).map(r => r.address)
  const words = base.dictionary.entries
  const dict = { ...base.dictionary, entries: words.map(e => ({ ...e, data: [0, 0, 0] })) }
  // "take" is verb 255 (verb first); "get" its synonym; "in" preposition 255.
  const take = dict.entries.find(e => e.word === 'take')!
  const get = dict.entries.find(e => e.word === 'get')!
  const inWord = dict.entries.find(e => e.word === 'in')!
  take.data = [64 | 1, 255, 0]
  get.data = [64 | 1, 255, 0]
  inWord.data = [8, 255, 0]

  const mem = base.bytes.slice()
  const put = (at: number, ...b: number[]) => mem.set(b, at)
  const putWord = (at: number, w: number) => put(at, w >> 8, w & 255)
  const T = 0x100 // a scratch area well inside dynamic memory
  const vtbl = T, st = T + 600, atbl = T + 700, patbl = T + 720, prtbl = T + 740
  putWord(vtbl, st) // verb 255
  for (let i = 1; i < 255; i++) putWord(vtbl + 2 * i, 0)
  // Two lines, last-defined first: TAKE IN OBJECT (FIND 7) (HAVE TAKE) = 1; TAKE OBJECT (MANY IN-ROOM CARRIED) = 0
  put(st, 2, 1, 255, 0, 7, 0, 1 | 4, 24, 1, 1, 0, 0, 0, 0, 2 | 8 | 16, 24, 0)
  putWord(atbl, r1! / scale)
  putWord(atbl + 2, r2! / scale)
  putWord(patbl, r3! / scale)
  putWord(patbl + 2, 0)
  putWord(prtbl, 1)
  putWord(prtbl + 2, inWord.address)
  putWord(prtbl + 4, 255)
  const globals = [vtbl, atbl, patbl, prtbl, 7, 0].map((value, number) => ({ id: `global:${number}` as const, number, address: 0, value }))
  const g = parseZilGrammar(new Bytes(mem), 5, globals, dict, routines, base.header.highMemory, ZILLIB_SEARCH_FLAGS)!

  it('finds the four tables through the globals', () => {
    expect(g).toMatchObject({ format: 'fixed', verbTable: vtbl, actionTable: atbl, preactionTable: patbl, prepositionTable: prtbl })
    expect(g.actions).toEqual([r1, r2])
    expect(g.preactions).toEqual([r3, 0])
    expect(g.prepositions).toEqual([{ number: 255, words: ['in'] }])
  })

  it('reads each verb, its words, and its lines', () => {
    expect(g.verbs).toHaveLength(1)
    const v = g.verbs[0]!
    expect(v).toMatchObject({ number: 255, address: st, words: ['get', 'take'] })
    expect(v.lines.map(l => [l.objects, l.prepositions, l.find, l.options, l.action])).toEqual([
      [1, [255, 0], [7, 0], [5, 24], 1],
      [1, [0, 0], [0, 0], [26, 24], 0],
    ])
    expect(v.lines.map(l => zilLineText(g, 'take', l))).toEqual(['TAKE IN OBJECT (FIND 7) (HAVE TAKE)', 'TAKE OBJECT (MANY IN-ROOM CARRIED)'])
  })

  it('names Infocom\'s search options when the story isn\'t ZILF\'s', () => {
    const infocom = parseZilGrammar(new Bytes(mem), 5, globals, dict, routines, base.header.highMemory, INFOCOM_SEARCH_FLAGS)!
    expect(zilLineText(infocom, 'take', infocom.verbs[0]!.lines[1]!)).toBe('TAKE OBJECT (HAVE TAKE ON-GROUND)')
  })

  it('a TOPIC object, and a preposition number no word has', () => {
    const m = mem.slice()
    m.set([1, 4 | 1, 200, 0, 0, 0, 0, 0, 0], st) // one line: TOPIC after preposition #200
    const t = parseZilGrammar(new Bytes(m), 5, globals, dict, routines, base.header.highMemory, ZILLIB_SEARCH_FLAGS)!
    expect(zilLineText(t, 'take', t.verbs[0]!.lines[0]!)).toBe('TAKE #200 TOPIC')
  })

  it('nothing when no global leads to a verb table, or an entry isn\'t a syntax table', () => {
    expect(parseZilGrammar(new Bytes(mem), 5, globals.slice(1), dict, routines, base.header.highMemory, ZILLIB_SEARCH_FLAGS)).toBeUndefined()
    const bad = mem.slice()
    bad.set([0, 0], st) // a count of 0
    expect(parseZilGrammar(new Bytes(bad), 5, globals, dict, routines, base.header.highMemory, ZILLIB_SEARCH_FLAGS)).toBeUndefined()
  })

  it('an Inform story has none, and keeps its own grammar', () => {
    expect(base.zilGrammar).toBeUndefined()
    expect(base.grammar).toBeDefined()
  })

  it('formatZilGrammar: verbs, actions and prepositions', () => {
    const text = formatZilGrammar({ ...base, zilGrammar: g }, g, { fileName: 'x.z5' })
    expect(text).toContain('255. 2 entries, verb = "get", "take"\n    [01 ff 00 07 00 05 18 01] TAKE IN OBJECT (FIND 7) (HAVE TAKE) = 1\n')
    expect(text).toMatch(/Action table entries = 2\n\naction# action-routine pre-action-routine\n\n {2}0\. +[0-9a-f]+ +[0-9a-f]+\n {2}1\. +[0-9a-f]+\n/)
    expect(text).toContain('Table entries = 1\n\n255. "in"\n')
  })
})
