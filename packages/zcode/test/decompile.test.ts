// Phase 6a's proof: every debug fixture decompiles to Inform 6 that compiles again, to a story
// equivalent to the original part by part (docs/09-decompiler.md §4), and most to the same bytes.
import { readFileSync } from 'node:fs'
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

const withSymbols = storyFiles().filter(f => {
  try {
    readFileSync(FIXTURES_DIR + f.replace(/\.z\d$/, '.dbg'))
    return true
  } catch {
    return false
  }
})

describe('decompiling to Inform 6 (6a)', () => {
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
