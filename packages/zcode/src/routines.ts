/**
 * Routines (Standard §5): a header — the number of locals, and in v1–4 their
 * initial values — then instructions. Found by sweeping the code area.
 */
import { packedScale } from './address.js'
import { Bytes, Malformed, OutOfBounds } from './bytes.js'
import { decodeInstruction, type Instruction } from './decode.js'
import { MAX_SWEEP_WORK, SweepExhausted, spend, type Work } from './work.js'
import type { TextContext } from './text.js'
import type { Version } from './types.js'

export interface Routine {
  /** `routine:<addr>`. */
  id: `routine:${string}`
  /** The header's address (what a packed routine address points at). */
  address: number
  locals: number
  /** v1–4: each local's initial value (§5.2.1). Empty in v5+. */
  initialValues: number[]
  instructions: Instruction[]
  /** One past the last byte. */
  end: number
}

export { MAX_SWEEP_WORK, SweepExhausted, type Work } from './work.js'

/**
 * The routine at `address`, or Malformed if those bytes can't be one: a
 * locals count over 15, an opcode that doesn't exist, a local beyond the
 * declared ones, a branch out of the file or before the routine, or no
 * terminating instruction past every forward branch.
 */
export function parseRoutine(bytes: Bytes, version: Version, address: number, text: TextContext, work: Work = { used: 0 }): Routine {
  const locals = bytes.byte(address)
  if (locals > 15) throw new Malformed(`${locals} locals`, address)
  let a = address + 1
  const initialValues: number[] = []
  if (version <= 4) {
    for (let i = 0; i < locals; i++, a += 2) initialValues.push(bytes.word(a))
  }
  const first = a
  const instructions: Instruction[] = []
  let furthest = a // the furthest forward target seen so far

  const checkVar = (v: number) => {
    if (v >= 1 && v <= 15 && v > locals) throw new Malformed(`local ${v} in a routine with ${locals}`, a)
  }
  const checkTarget = (t: number) => {
    if (t < first || t >= bytes.size) throw new Malformed(`a branch to ${t.toString(16)}`, a)
    furthest = Math.max(furthest, t)
  }

  for (;;) {
    spend(work, 1)
    const ins = decodeInstruction(bytes, a, version, text, work)
    for (const o of ins.operands) if (o.kind === 'variable') checkVar(o.value)
    if (ins.store !== undefined) checkVar(ins.store)
    if (ins.branch?.target !== undefined) checkTarget(ins.branch.target)
    if (ins.jumpTarget !== undefined) checkTarget(ins.jumpTarget)
    instructions.push(ins)
    a += ins.length
    if (ins.info.terminal && a > furthest) break
  }
  return { id: `routine:${address.toString(16).padStart(4, '0')}`, address, locals, initialValues, instructions, end: a }
}

export const alignUp = (n: number, scale: number) => Math.ceil(n / scale) * scale

/**
 * parseRoutine, or null when the bytes aren't a routine. A probe that doesn't
 * end in a routine — rejected, or cut off by the work budget — gives back the
 * story's text budget its inline strings used: only kept routines spend that.
 * (The decoding work itself is never given back; see work.ts.)
 */
export function tryRoutine(bytes: Bytes, version: Version, address: number, text: TextContext, work?: Work): Routine | null {
  const budget = text.budget
  const truncated = text.truncated
  try {
    return parseRoutine(bytes, version, address, text, work)
  } catch (e) {
    text.budget = budget
    text.truncated = truncated
    if (e instanceof Malformed || e instanceof OutOfBounds) return null
    throw e
  }
}

/**
 * Sweep the code area: from `start`, find the first routine at an address a
 * packed address can name (a multiple of 2, 4 or 8, §1.2.3), then take each
 * routine that follows, at the next such address after the last one ends,
 * until one won't decode.
 */
export function sweepRoutines(
  bytes: Bytes,
  version: Version,
  start: number,
  text: TextContext,
  maxWork = MAX_SWEEP_WORK,
): { routines: Routine[]; exhausted: boolean } {
  const scale = packedScale(version)
  const routines: Routine[] = []
  const work: Work = { used: 0, max: maxWork }
  try {
    let a = alignUp(start, scale)
    // The first routine: the first aligned address that decodes as one (kept, not parsed again).
    let r: Routine | null = null
    while (a < bytes.size && !(r = tryRoutine(bytes, version, a, text, work))) a += scale
    while (r) {
      routines.push(r)
      a = alignUp(r.end, scale)
      r = a < bytes.size ? tryRoutine(bytes, version, a, text, work) : null
    }
  } catch (e) {
    if (!(e instanceof SweepExhausted)) throw e
    return { routines, exhausted: true }
  }
  return { routines, exhausted: false }
}
