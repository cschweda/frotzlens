/**
 * The conformance suites (docs/12 §1, test/conformance/README.md): Czech in every version and
 * Praxix, compiled here; each passes, and prints exactly what ZVM prints.
 */
import { readFileSync } from 'node:fs'
import { compile } from '@frotzinc/inform6-wasm'
import { runReplay } from '@frotzinc/zmachine-oracle'
import { describe, expect, it } from 'vitest'
import { play } from '../src/index.js'

const source = (name: string) => readFileSync(new URL(`./conformance/${name}`, import.meta.url), 'utf8')

async function build(name: string, version: 'z3' | 'z4' | 'z5' | 'z8') {
  const r = await compile(source(name), { version })
  if (!r.ok) throw new Error(r.rawOutput)
  return r.story!
}

describe('Czech 0.8', () => {
  for (const version of ['z3', 'z4', 'z5', 'z8'] as const) {
    it(version, async () => {
      const story = await build('czech.inf', version)
      // Czech prints the header's Standard revision: claim ZVM's 1.2 so the two print the same.
      const ours = play(story, [], { seed: 1, header: { profile: 'zvm', standard: [1, 2] } })
      const zvm = await runReplay(story.slice(), 'zmachine', [], undefined, { seed: 1 })
      const out = ours.turns[0]!.output
      expect(out).toMatch(/Failed: 0\b/)
      expect(out).toMatch(/Passed: \d{3}/)
      expect(out).toBe(zvm.turns[0]!.output)
      expect(ours.stoppedBy).toBe('quit')
    }, 60_000)
  }
})

describe('Praxix', () => {
  it('all tests pass, as in ZVM (up to Standard 1.1)', async () => {
    const story = await build('praxix.inf', 'z5')
    const ours = play(story, ['all'], { seed: 1, header: { profile: 'zvm' } })
    const out = ours.turns[1]!.output
    expect(out).toMatch(/All tests passed\./)
    expect(out).not.toMatch(/FAIL/)
    // ZVM claims Standard 1.2 and so runs Praxix's 1.2 tests; up to there, the output is the same.
    const zvm = await runReplay(story.slice(), 'zmachine', ['all'], undefined, { seed: 1 })
    // (Its banner prints the revision each claims, 1.1 here and 1.2 there: that line aside.)
    const upTo12 = (s: string) => s.slice(0, s.indexOf('Z-Machine 1.2')).replace(/interpreter is version 1\.[12]/g, 'interpreter is version 1.x')
    expect(upTo12(out)).toBe(upTo12(zvm.turns[1]!.output))
  }, 60_000)
})
