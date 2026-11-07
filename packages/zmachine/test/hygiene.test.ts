/** No eval, no DOM, and nothing thrown past the package (docs/11 exit criteria; design §5 "No eval, ever"). */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Machine, play } from '../src/index.js'
import { readSample } from './samples.js'

const SRC = new URL('../src/', import.meta.url)

describe('hygiene', () => {
  it('no eval, new Function or Function( anywhere in src', () => {
    for (const f of readdirSync(SRC)) {
      const text = readFileSync(new URL(f, SRC), 'utf8')
      expect(text, f).not.toMatch(/\beval\s*\(|new\s+Function\b|[^.\w]Function\s*\(/)
    }
  })

  it('the package compiles without the DOM (lib: ES2023 only)', () => {
    const cfg = JSON.parse(readFileSync(new URL('../tsconfig.build.json', import.meta.url), 'utf8'))
    expect(cfg.compilerOptions.lib).toEqual(['ES2023'])
  })

  it('a story it can’t play is a fault, never a throw', () => {
    const v6 = readSample('dark-cellar.z5').slice()
    v6[0] = 6
    const cases: [string, Uint8Array][] = [
      ['empty', new Uint8Array(0)],
      ['truncated', readSample('dark-cellar.z5').slice(0, 40)],
      ['version 6', v6],
      ['version 9', Uint8Array.of(9, ...new Uint8Array(100))],
      ['static base past the end', Uint8Array.of(5, ...new Uint8Array(13), 0xff, 0xff, ...new Uint8Array(60))],
    ]
    for (const [what, bytes] of cases) {
      const m = Machine.create(bytes, { seed: 1 })
      expect(m instanceof Machine, what).toBe(false)
      expect((m as { fault: { code: string } }).fault.code, what).toBe('bad-story')
    }
  })

  it('garbage that passes the header check runs to a fault, not a throw', () => {
    const story = readSample('dark-cellar.z5').slice()
    // Point the initial PC at the header: those bytes aren't sensible code.
    story[6] = 0
    story[7] = 0x10
    const r = play(story, ['look'], { seed: 1 })
    expect(typeof r.stoppedBy === 'object' || r.stoppedBy === undefined).toBe(true)
  })
})
