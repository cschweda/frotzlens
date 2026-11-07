/**
 * Memory (§1): the whole story in one Uint8Array, with dynamic memory written in place. Reads may
 * go anywhere in the file; writes only below the static-memory base (§1.1.2). Words are
 * big-endian (§2.1).
 */
import { fail, hex } from './fault.js'
import type { Hooks } from './types.js'

export class Memory {
  constructor(
    readonly bytes: Uint8Array,
    readonly staticBase: number,
    private readonly hooks: Hooks | undefined,
  ) {}

  get size(): number {
    return this.bytes.length
  }

  byte(a: number): number {
    if (a < 0 || a >= this.bytes.length) fail('bad-address', `read of the byte at ${hex(a)}, outside the story (${hex(this.bytes.length, 5)} bytes)`)
    return this.bytes[a]!
  }

  word(a: number): number {
    if (a < 0 || a + 1 >= this.bytes.length) fail('bad-address', `read of the word at ${hex(a)}, outside the story (${hex(this.bytes.length, 5)} bytes)`)
    return (this.bytes[a]! << 8) | this.bytes[a + 1]!
  }

  setByte(a: number, v: number): void {
    if (a < 0 || a >= this.staticBase) fail('write-to-static', `write of the byte at ${hex(a)}, outside dynamic memory (which ends at ${hex(this.staticBase)})`)
    this.bytes[a] = v & 0xff
    this.hooks?.write?.(a, v & 0xff, 1)
  }

  setWord(a: number, v: number): void {
    if (a < 0 || a + 1 >= this.staticBase) fail('write-to-static', `write of the word at ${hex(a)}, outside dynamic memory (which ends at ${hex(this.staticBase)})`)
    this.bytes[a] = (v >> 8) & 0xff
    this.bytes[a + 1] = v & 0xff
    this.hooks?.write?.(a, v & 0xffff, 2)
  }
}

/** A 16-bit value as signed (§2.2). */
export const signed = (v: number) => (v << 16) >> 16
/** Any number as a 16-bit unsigned value. */
export const u16 = (v: number) => v & 0xffff
