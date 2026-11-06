/**
 * The disassembler's work budget. The code-area sweep probes candidate
 * addresses, and a crafted file can make every probe expensive: a long failed
 * parse, or an inline string with no end bit that is scanned to the end of the
 * file. Every unit of that work — an instruction decoded, a word of Z-characters
 * read, eight characters of text produced — is counted, never given back, and
 * the sweep stops when the budget is spent. Real stories need about 1% of it:
 * Mingus I (531 routines), Mingus II and The Architect's Legacy each ~21,000.
 */
export const MAX_SWEEP_WORK = 2_000_000

/** Work done so far, shared by every probe of one sweep. */
export interface Work {
  used: number
  /** The budget (MAX_SWEEP_WORK unless a caller sets less). */
  max?: number
}

/** The sweep's work budget ran out. */
export class SweepExhausted extends Error {
  constructor(readonly limit: number) {
    super(`decoding stopped after ${limit} units of work`)
  }
}

/** Spend `units` of work; throws SweepExhausted past the budget. */
export function spend(work: Work | undefined, units: number): void {
  if (!work) return
  work.used += units
  const max = work.max ?? MAX_SWEEP_WORK
  if (work.used > max) throw new SweepExhausted(max)
}
