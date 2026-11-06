import type { ParseError } from './types.js'

/** Thrown inside the core only, and always caught at a table's boundary. */
export class OutOfBounds extends Error {
  constructor(readonly address: number, readonly length: number) {
    super(`read of ${length} byte(s) at ${hex(address)} is outside the file`)
  }
}

/**
 * Bounds-checked big-endian readers over the story (§2.1: words are
 * big-endian, unsigned unless an opcode says otherwise).
 */
export class Bytes {
  constructor(readonly data: Uint8Array) {}

  get size(): number {
    return this.data.length
  }

  has(address: number, length = 1): boolean {
    return Number.isInteger(address) && address >= 0 && address + length <= this.data.length
  }

  byte(address: number): number {
    if (!this.has(address)) throw new OutOfBounds(address, 1)
    return this.data[address]!
  }

  word(address: number): number {
    if (!this.has(address, 2)) throw new OutOfBounds(address, 2)
    return (this.data[address]! << 8) | this.data[address + 1]!
  }

  slice(address: number, length: number): Uint8Array {
    if (!this.has(address, length)) throw new OutOfBounds(address, length)
    return this.data.slice(address, address + length)
  }
}

/** Lowercase hex with at least `width` digits, no prefix. */
export function hex(n: number, width = 4): string {
  return n.toString(16).padStart(width, '0')
}

/** A table that is readable but makes no sense (a property list with no end, a bad entry length). */
export class Malformed extends Error {
  constructor(message: string, readonly address?: number) {
    super(message)
  }
}

/**
 * Run one table's parse. A bad file — a read outside it (OutOfBounds) or a
 * table that makes no sense (Malformed) — becomes a ParseError with the
 * table's code, and the fallback comes back. Anything else is a bug in this
 * package: it is rethrown, so it can't hide as a bad-file error, and
 * parseStory reports it as an `internal` error.
 */
export function guarded<T>(errors: ParseError[], code: ParseError['code'], what: string, fallback: T, run: () => T): T {
  try {
    return run()
  } catch (e) {
    if (!(e instanceof OutOfBounds || e instanceof Malformed)) throw e
    errors.push({ code, severity: 'error', ...(e.address !== undefined ? { address: e.address } : {}), message: `${what}: ${e.message}` })
    return fallback
  }
}
