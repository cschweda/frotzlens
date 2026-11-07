/**
 * The object table (§12): attributes, the tree, and properties. v3: 255 objects, 32 attributes,
 * 9-byte entries, byte links, 31 default properties; v4+: 65,535 objects, 48 attributes, 14-byte
 * entries, word links, 63 default properties.
 */
import { fail, hex } from './fault.js'
import type { Memory } from './memory.js'

export class Objects {
  private readonly v3: boolean
  private readonly entrySize: number
  private readonly first: number

  constructor(
    private readonly mem: Memory,
    version: number,
    private readonly table: number,
  ) {
    this.v3 = version <= 3
    this.entrySize = this.v3 ? 9 : 14
    this.first = table + (this.v3 ? 31 : 63) * 2
  }

  private entry(o: number): number {
    if (o < 1 || o > (this.v3 ? 255 : 65535)) fail('bad-object', `object ${o} doesn't exist`)
    return this.first + (o - 1) * this.entrySize
  }

  // ── attributes (§12.3.1) ──────────────────────────────────────────────────
  private attrAt(o: number, a: number): [number, number] {
    if (a < 0 || a >= (this.v3 ? 32 : 48)) fail('bad-object', `attribute ${a} doesn't exist (object ${o})`)
    return [this.entry(o) + (a >> 3), 0x80 >> (a & 7)]
  }

  testAttr(o: number, a: number): boolean {
    if (o === 0) return false
    const [at, bit] = this.attrAt(o, a)
    return (this.mem.byte(at) & bit) !== 0
  }

  setAttr(o: number, a: number, on: boolean): void {
    if (o === 0) return
    const [at, bit] = this.attrAt(o, a)
    const b = this.mem.byte(at)
    this.mem.setByte(at, on ? b | bit : b & ~bit)
  }

  // ── the tree (§12.3.2) ────────────────────────────────────────────────────
  private link(o: number, which: 0 | 1 | 2): number {
    if (o === 0) return 0
    const e = this.entry(o)
    return this.v3 ? this.mem.byte(e + 4 + which) : this.mem.word(e + 6 + which * 2)
  }

  private setLink(o: number, which: 0 | 1 | 2, v: number): void {
    const e = this.entry(o)
    if (this.v3) this.mem.setByte(e + 4 + which, v)
    else this.mem.setWord(e + 6 + which * 2, v)
  }

  parent = (o: number) => this.link(o, 0)
  sibling = (o: number) => this.link(o, 1)
  child = (o: number) => this.link(o, 2)

  /** Take `o` out of its parent's children (@remove_obj). */
  remove(o: number): void {
    if (o === 0) return
    const p = this.parent(o)
    if (p === 0) return
    const next = this.sibling(o)
    if (this.child(p) === o) this.setLink(p, 2, next)
    else {
      let c = this.child(p)
      // A broken tree (a loop) must not hang the machine: there are at most 65,535 objects.
      for (let guard = 0; c !== 0 && guard < 65536; guard++) {
        const s = this.sibling(c)
        if (s === o) {
          this.setLink(c, 1, next)
          break
        }
        c = s
      }
    }
    this.setLink(o, 0, 0)
    this.setLink(o, 1, 0)
  }

  /** Make `o` the first child of `d` (@insert_obj). */
  insert(o: number, d: number): void {
    if (o === 0) return
    if (d === 0) fail('bad-object', `can't move object ${o} into object 0`)
    this.remove(o)
    this.setLink(o, 0, d)
    this.setLink(o, 1, this.child(d))
    this.setLink(d, 2, o)
  }

  // ── properties (§12.4) ────────────────────────────────────────────────────
  propTable(o: number): number {
    return this.mem.word(this.entry(o) + (this.v3 ? 7 : 12))
  }

  /** The short name's byte address (after its length byte), and its length in words. */
  shortName(o: number): { address: number; words: number } {
    const t = this.propTable(o)
    return { address: t + 1, words: this.mem.byte(t) }
  }

  /** The size byte(s) at `at`: the property's number, its data's size, and where the data starts. */
  private header(at: number): { number: number; size: number; data: number } {
    const b = this.mem.byte(at)
    if (this.v3) return { number: b & 31, size: (b >> 5) + 1, data: at + 1 }
    if (b & 0x80) {
      const size = this.mem.byte(at + 1) & 63
      return { number: b & 63, size: size === 0 ? 64 : size, data: at + 2 }
    }
    return { number: b & 63, size: b & 0x40 ? 2 : 1, data: at + 1 }
  }

  private firstProp(o: number): number {
    const t = this.propTable(o)
    return t + 1 + this.mem.byte(t) * 2
  }

  /** Where property `p` of `o` is, or null when `o` hasn't got it. */
  find(o: number, p: number): { number: number; size: number; data: number } | null {
    if (o === 0) return null
    let at = this.firstProp(o)
    for (let guard = 0; guard < 64; guard++) {
      const h = this.header(at)
      if (h.number === 0 || h.number < p) return null // listed in descending order (§12.4)
      if (h.number === p) return h
      at = h.data + h.size
    }
    return null
  }

  defaultProp(p: number): number {
    if (p < 1 || p > (this.v3 ? 31 : 63)) fail('bad-property', `property ${p} doesn't exist`)
    return this.mem.word(this.table + (p - 1) * 2)
  }

  /** @get_prop: a 1-byte property as a byte, anything longer as its first word (§15: longer is illegal; Frotz and ZVM read the word). */
  get(o: number, p: number): number {
    const h = this.find(o, p)
    if (!h) return this.defaultProp(p)
    return h.size === 1 ? this.mem.byte(h.data) : this.mem.word(h.data)
  }

  put(o: number, p: number, v: number): void {
    const h = this.find(o, p)
    if (!h) fail('bad-property', `object ${o} has no property ${p} to put (${hex(this.entry(o))})`)
    if (h!.size === 1) this.mem.setByte(h!.data, v & 0xff)
    else this.mem.setWord(h!.data, v)
  }

  /** @get_prop_len: the size of the property whose data starts at `data` (0 for 0, §15). */
  propLen(data: number): number {
    if (data === 0) return 0
    const b = this.mem.byte(data - 1)
    if (this.v3) return (b >> 5) + 1
    // A byte with bit 7 set is the second of two size bytes (§12.4.2.1.1).
    if (b & 0x80) return (b & 63) === 0 ? 64 : b & 63
    return b & 0x40 ? 2 : 1
  }

  /** @get_next_prop: the first property for 0, otherwise the one after `p`; 0 after the last. */
  next(o: number, p: number): number {
    if (o === 0) return 0
    if (p === 0) return this.header(this.firstProp(o)).number
    const h = this.find(o, p)
    if (!h) fail('bad-property', `object ${o} has no property ${p}, so no next one`)
    return this.header(h!.data + h!.size).number
  }
}
