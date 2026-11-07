// Phase 6a's proof: every debug fixture decompiles to Inform 6 that compiles again, to a story
// equivalent to the original part by part (docs/09-decompiler.md §4), and most to the same bytes.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURES_DIR, storyFiles } from './fixtures.js'
import { roundTrip } from './roundtrip.js'

/**
 * Those whose recompiled story isn't the same bytes, and why. The rest must stay identical.
 * mingus-1: the identifier-names table lists one individual property ("done") among the action
 * names in a different place, because the output declares it before the object that first has it,
 * where the original first used it in code. Nothing reads that order.
 */
const NOT_IDENTICAL = new Set(['mingus-1.z5'])

const withSymbols = storyFiles().filter(f => existsSync(FIXTURES_DIR + f.replace(/\.z\d$/, '.dbg')))

describe('decompiling to Inform 6 (6a)', () => {
  it('has every debug fixture to check', () => expect(withSymbols).toHaveLength(16))

  for (const file of withSymbols) {
    it(`${file} recompiles to an equivalent story`, async () => {
      const r = await roundTrip(new Uint8Array(readFileSync(FIXTURES_DIR + file)), readFileSync(FIXTURES_DIR + file.replace(/\.z\d$/, '.dbg'), 'utf8'))
      expect(r.errors).toEqual([])
      expect(r.compiled).toBe(true)
      const different = Object.entries(r.parts).filter(([, p]) => p.result === 'different').map(([k, p]) => `${k}:\n    ${p.differences.join('\n    ')}`)
      if (process.env.ROUNDTRIP_REPORT) console.log(file, r.identical ? 'identical' : 'not identical', Object.fromEntries(Object.entries(r.parts).map(([k, p]) => [k, p.result])))
      expect(different).toEqual([])
      expect(r.identical).toBe(!NOT_IDENTICAL.has(file))
    }, 60_000)
  }
})

describe('Inform 6 text', () => {
  it('writes strings as Inform spells them', async () => {
    const { informString, informWord } = await import('../src/inform/text.js')
    expect(informString('Say "hi"\nthen ~ ^ @ \\ é')).toBe('"Say ~hi~^then @@126 @@94 @@64 @@92 @{e9}"')
    expect(informWord('a')).toBe("'a//'")
    expect(informWord("o'clock")).toBe("'o^clock'")
    expect(informWord('coins', true)).toBe("'coins//p'")
  })
})

describe('decompiling, economy mode with a library that declares abbreviations', () => {
  // PunyInform's globals.h declares abbreviations of its own: with -e they're in the story's table
  // beside any of the game's, and come back with the Include, not written out again.
  it('puny-dark-cellar built with -e recompiles to the same bytes', async () => {
    const { compile } = await import('@frotzinc/inform6-wasm')
    const src = readFileSync(new URL('./fixtures/src/puny-dark-cellar.inf', import.meta.url), 'utf8')
    const out = await compile(`!% -e\n${src}`, { version: 'z5', library: 'puny', debug: true })
    expect(out.ok).toBe(true)
    const r = await roundTrip(out.story!, out.dbg!)
    expect(r.errors).toEqual([])
    expect(r.source).not.toMatch(/Abbreviate "Are you sure/)
    expect(Object.entries(r.parts).filter(([, p]) => p.result === 'different').map(([k]) => k)).toEqual([])
    expect(r.identical).toBe(true)
  }, 60_000)
})

/**
 * Without a debug file (6a's second half): the symbols are worked out by comparing the story with its
 * library compiled alone, set up as the story's was (findReference), and the comparison is by
 * position, since the names are made up. These come back the same bytes; the rest differ only in
 * names Inform keeps as text (a property's, an action's), which the made-up names can't match.
 */
const IDENTICAL_WITHOUT_SYMBOLS = new Set(['dark-cellar.z5', 'dark-cellar-v8.z8', 'demo.z5', 'hermit.z5', 'locked-chest.z5', 'puny-dark-cellar.z5', 'puny-dark-cellar-v3.z3', 'puny-dark-cellar-v4.z4', 'minimal.z5'])

describe('decompiling to Inform 6 without a debug file (6a)', () => {
  for (const file of withSymbols) {
    it(`${file} recompiles to an equivalent story`, async () => {
      const r = await roundTrip(new Uint8Array(readFileSync(FIXTURES_DIR + file)), readFileSync(FIXTURES_DIR + file.replace(/\.z\d$/, '.dbg'), 'utf8'), true)
      expect(r.errors).toEqual([])
      const different = Object.entries(r.parts).filter(([, p]) => p.result === 'different').map(([k, p]) => `${k}:\n    ${p.differences.join('\n    ')}`)
      expect(different).toEqual([])
      expect(r.identical).toBe(IDENTICAL_WITHOUT_SYMBOLS.has(file))
    }, 120_000)
  }
})
