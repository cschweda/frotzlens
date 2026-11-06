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

/**
 * Run one table's parse; an out-of-range read becomes a ParseError (with the
 * table's error code) and the fallback, never a throw past the caller.
 */
export function guarded<T>(errors: ParseError[], code: ParseError['code'], what: string, fallback: T, run: () => T): T {
  try {
    return run()
  } catch (e) {
    if (e instanceof OutOfBounds) {
      errors.push({ code, severity: 'error', address: e.address, message: `${what}: ${e.message}` })
      return fallback
    }
    errors.push({ code, severity: 'error', message: `${what}: ${String(e)}` })
    return fallback
  }
}
