/** @random (docs/11 §4): the session stream is the oracle's, and the xorshift is ZVM's. */
import { mulberry32 as oracleMulberry } from '@frotzinc/zmachine-oracle'
import { describe, expect, it } from 'vitest'
import { mulberry32, random } from '../src/index.js'
import type { RandomState } from '../src/index.js'

describe('random', () => {
  it("the session stream is exactly the oracle's Math.random stand-in", () => {
    for (const seed of [0, 1, 42, -7, 0x7fffffff]) {
      const a = mulberry32(seed)
      const b = oracleMulberry(seed)
      for (let i = 0; i < 1000; i++) expect(a()).toBe(b())
    }
  })

  it("session mode draws 1 + floor(r × range), as ZVM does with Math.random", () => {
    const s: RandomState = { mode: 'session', session: 9, xorshift: 0 }
    const r = mulberry32(9)
    for (let i = 0; i < 200; i++) expect(random(s, 6)).toBe((1 + r() * 6) | 0)
  })

  it('@random -n switches to the xorshift, and @random 0 back', () => {
    const s: RandomState = { mode: 'session', session: 1, xorshift: 0 }
    expect(random(s, -100)).toBe(0)
    expect(s.mode).toBe('xorshift')
    // ZVM's sequence from seed -100 (signed shifts): computed by the algorithm in ifvms zvm/runtime.js.
    let seed = -100
    const zvm = (range: number) => {
      seed ^= seed << 13
      seed ^= seed >> 17
      seed ^= seed << 5
      return 1 + ((seed & 0x7fff) % range)
    }
    for (let i = 0; i < 100; i++) expect(random(s, 20)).toBe(zvm(20))
    expect(random(s, 0)).toBe(0)
    expect(s.mode).toBe('session')
  })

  it('every draw is in range', () => {
    const s: RandomState = { mode: 'session', session: 5, xorshift: 0 }
    for (let i = 0; i < 2000; i++) {
      const v = random(s, 7)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(7)
    }
  })
})
