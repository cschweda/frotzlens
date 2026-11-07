/**
 * @random (§2.4, §15), matching ZVM so the differential tests can compare stories that use it
 * (docs/11 §4). ZVM's two modes:
 *
 * - xorshift seed 0 ("pure randomness"): `1 + ((Math.random() * range) | 0)`. Here the draw comes
 *   from the session's mulberry32 stream instead, and the test oracle feeds ZVM the same stream.
 * - after `@random -n`: a 32-bit xorshift seeded with n (negative, as ZVM stores it), with signed
 *   shifts, `1 + ((s & 0x7FFF) % range)`. ZVM: ifvms.js zvm/runtime.js random() (MIT, Dannii
 *   Willis); the algorithm is copied here exactly.
 *
 * ZVM does not implement the Standard's recommended counting sequence for seeds under 1000
 * (§2.4.1); neither does this, by the same reasoning (README, conformance notes).
 */
import type { RandomState } from './types.js'

/** mulberry32 (Tommy Ettinger, public domain): one step from `state`; returns [value in [0, 1), next state]. */
export function mulberry32Step(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}

/** A mulberry32 stream as a function, like Math.random (for the test oracle and tests). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    const [v, next] = mulberry32Step(s)
    s = next
    return v
  }
}

export function initialRandom(seed: number): RandomState {
  return { mode: 'session', session: seed | 0, xorshift: 0 }
}

/**
 * @random range, with `range` as a signed 16-bit number. Positive: a number from 1 to range.
 * Zero or negative: reseed (0: back to the session stream; -n: xorshift from -n) and return 0.
 */
export function random(state: RandomState, range: number): number {
  if (range < 1) {
    state.xorshift = range
    state.mode = range === 0 ? 'session' : 'xorshift'
    return 0
  }
  if (state.mode === 'session') {
    const [v, next] = mulberry32Step(state.session)
    state.session = next
    return (1 + v * range) | 0
  }
  let seed = state.xorshift
  seed ^= seed << 13
  seed ^= seed >> 17
  seed ^= seed << 5
  state.xorshift = seed
  return 1 + ((seed & 0x7fff) % range)
}
