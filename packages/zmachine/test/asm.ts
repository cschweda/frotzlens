/**
 * A tiny Z-machine assembler for the opcode tests (docs/11 §9): it builds a minimal story file of
 * any supported version around a few instructions, so one behaviour can be tested on its own.
 *
 *   const story = assemble(5, a => {
 *     a.routine('main', 0)
 *     a.op('ADD', [3, 4], { store: 0 })
 *     a.op('PRINT_NUM', [sp])
 *     a.op('QUIT')
 *   })
 *
 * Instructions are named as zcode's opcode table names them; the form (long, short, variable,
 * extended) is chosen from the operands. Operands: a number (small if 0–255, otherwise large),
 * `v(n)` (variable n; `sp` is variable 0), `L(n)` (a large constant), or `R('name')` (a routine's
 * packed address).
 *
 * The story has: 240 globals, an object table with `objects` (default: none), a dictionary with
 * `words`, and 1 KB of dynamic memory at `DATA` for text buffers and tables.
 */
import { op0, op1, op2, opExt, opVar, type OpInfo, type Version } from '@frotzinc/zcode'

export type Operand = number | { var: number } | { large: number } | { routine: string }
export const v = (n: number): Operand => ({ var: n })
export const sp: Operand = { var: 0 }
export const L = (n: number): Operand => ({ large: n & 0xffff })
export const R = (name: string): Operand => ({ routine: name })

export interface Branch {
  /** Branch to this label… */
  to?: string
  /** …or return true / false. */
  ret?: boolean
  /** Branch when the condition is false (default: true). */
  onFalse?: boolean
}

export interface OpOptions {
  store?: number
  branch?: Branch
  text?: string
}

export interface StoryObject {
  name: string
  parent?: number
  sibling?: number
  child?: number
  attributes?: number[]
  /** property number → data bytes; listed in descending order in the table. */
  properties?: Record<number, number[]>
}

export interface Layout {
  objects?: StoryObject[]
  words?: string[]
  separators?: string
  /** Header bytes to set (address → value), after the rest. */
  header?: Record<number, number>
  globals?: Record<number, number>
}

/** Where the 1 KB scratch area in dynamic memory starts. */
export const DATA = 0x400

const FORMS: [string, (n: number, v: Version) => OpInfo | undefined][] = [
  ['OP2', op2],
  ['OP1', op1],
  ['OP0', op0],
  ['VAR', opVar],
  ['EXT', opExt],
]

function find(name: string, version: Version, prefer?: string): { count: string; n: number; info: OpInfo } {
  for (const [count, look] of FORMS) {
    if (prefer && count !== prefer) continue
    for (let n = 0; n < 32; n++) {
      const info = look(n, version)
      if (info?.name === name) return { count, n, info }
    }
  }
  throw new Error(`no ${name} in version ${version}`)
}

/** ZSCII text as Z-characters (§3.5, default alphabets), padded and with the end bit (§3.7). */
export function encodeText(text: string): number[] {
  const A0 = 'abcdefghijklmnopqrstuvwxyz'
  const A1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const A2 = '\n0123456789.,!?_#\'"/\\-:()'
  const z: number[] = []
  for (const ch of text) {
    if (ch === ' ') z.push(0)
    else if (A0.includes(ch)) z.push(A0.indexOf(ch) + 6)
    else if (A1.includes(ch)) z.push(4, A1.indexOf(ch) + 6)
    else if (A2.includes(ch)) z.push(5, A2.indexOf(ch) + 7)
    else {
      const c = ch.charCodeAt(0)
      z.push(5, 6, c >> 5, c & 31)
    }
  }
  while (z.length % 3 || z.length === 0) z.push(5)
  const out: number[] = []
  for (let i = 0; i < z.length; i += 3) {
    let w = (z[i]! << 10) | (z[i + 1]! << 5) | z[i + 2]!
    if (i + 3 >= z.length) w |= 0x8000
    out.push(w >> 8, w & 0xff)
  }
  return out
}

export class Asm {
  readonly code: number[] = []
  private readonly labels = new Map<string, number>()
  private readonly routines = new Map<string, number>()
  private readonly fixups: { at: number; label: string; kind: 'branch' | 'jump' }[] = []
  private readonly routineFixups: { at: number; name: string }[] = []
  readonly scale: number

  constructor(
    readonly version: Version,
    /** Where the code will start in the story (set by assemble). */
    readonly base: number,
  ) {
    this.scale = version <= 3 ? 2 : version <= 5 ? 4 : 8
  }

  get here(): number {
    return this.base + this.code.length
  }

  label(name: string): this {
    this.labels.set(name, this.here)
    return this
  }

  /** Start a routine with `locals` locals (v1–4: their initial values, default 0). */
  routine(name: string, locals: number | number[] = 0): this {
    while (this.here % this.scale) this.code.push(0)
    this.routines.set(name, this.here)
    const init = typeof locals === 'number' ? new Array<number>(locals).fill(0) : locals
    this.code.push(init.length)
    if (this.version <= 4) for (const x of init) this.code.push(x >> 8, x & 0xff)
    return this
  }

  /** A string at a packed-addressable place (no routine header): R(name) is its packed address. */
  string(name: string, text: string): this {
    while (this.here % this.scale) this.code.push(0)
    this.routines.set(name, this.here)
    this.code.push(...encodeText(text))
    return this
  }

  /** Raw bytes, for tests of what's illegal. */
  bytes(...b: number[]): this {
    this.code.push(...b)
    return this
  }

  op(name: string, operands: Operand[] = [], opts: OpOptions = {}, prefer?: 'OP2' | 'OP1' | 'OP0' | 'VAR' | 'EXT'): this {
    const { count, n, info } = find(name, this.version, prefer)
    const kind = (o: Operand): 0 | 1 | 2 => (typeof o === 'number' ? (o >= 0 && o <= 255 ? 1 : 0) : 'var' in o ? 2 : 0)
    const types = operands.map(kind)
    const operandBytes: (number | { routine: string })[] = []
    for (const o of operands) {
      if (typeof o === 'number') {
        if (o >= 0 && o <= 255) operandBytes.push(o)
        else operandBytes.push((o >> 8) & 0xff, o & 0xff)
      } else if ('var' in o) operandBytes.push(o.var)
      else if ('large' in o) operandBytes.push(o.large >> 8, o.large & 0xff)
      else operandBytes.push(o) // a routine's packed address: two bytes, fixed up in finish()
    }
    const typeBytes = (max: number) => {
      const t: number[] = [...types]
      while (t.length < max) t.push(3)
      const out: number[] = []
      for (let i = 0; i < max; i += 4) out.push((t[i]! << 6) | (t[i + 1]! << 4) | (t[i + 2]! << 2) | t[i + 3]!)
      return out
    }
    if (count === 'OP2' && operands.length === 2 && types.every(t => t !== 0)) {
      this.code.push((types[0] === 2 ? 0x40 : 0) | (types[1] === 2 ? 0x20 : 0) | n)
    } else if (count === 'OP2') {
      this.code.push(0xc0 | n, ...typeBytes(4))
    } else if (count === 'OP1') {
      this.code.push(0x80 | (types[0]! << 4) | n)
    } else if (count === 'OP0') {
      this.code.push(0xb0 | n)
    } else if (count === 'VAR') {
      this.code.push(0xe0 | n, ...typeBytes(info.doubleTypes ? 8 : 4))
    } else {
      this.code.push(0xbe, n, ...typeBytes(4))
    }
    for (const b of operandBytes) {
      if (typeof b === 'number') this.code.push(b)
      else {
        this.routineFixups.push({ at: this.code.length, name: b.routine })
        this.code.push(0, 0)
      }
    }
    if (info.store) this.code.push(opts.store ?? 0)
    if (info.branch) {
      const br = opts.branch ?? { ret: false }
      const onTrue = !br.onFalse
      if (br.ret !== undefined) this.code.push((onTrue ? 0x80 : 0) | 0x40 | (br.ret ? 1 : 0))
      else {
        this.fixups.push({ at: this.code.length, label: br.to!, kind: 'branch' })
        this.code.push(onTrue ? 0x80 : 0, 0)
      }
    }
    if (info.text) this.code.push(...encodeText(opts.text ?? ''))
    return this
  }

  /** @jump to a label. */
  jump(label: string): this {
    this.code.push(0x8c) // 1OP:12 with a large operand
    this.fixups.push({ at: this.code.length, label, kind: 'jump' })
    this.code.push(0, 0)
    return this
  }

  /** Resolve labels and routine addresses. */
  finish(): number[] {
    for (const f of this.fixups) {
      const target = this.labels.get(f.label)
      if (target === undefined) throw new Error(`no label ${f.label}`)
      const after = this.base + f.at + 2
      const offset = target - after + 2
      if (f.kind === 'branch') {
        this.code[f.at] = (this.code[f.at]! & 0x80) | ((offset >> 8) & 0x3f)
        this.code[f.at + 1] = offset & 0xff
      } else {
        this.code[f.at] = (offset >> 8) & 0xff
        this.code[f.at + 1] = offset & 0xff
      }
    }
    for (const f of this.routineFixups) {
      const address = this.routines.get(f.name)
      if (address === undefined) throw new Error(`no routine ${f.name}`)
      const packed = address / this.scale
      this.code[f.at] = (packed >> 8) & 0xff
      this.code[f.at + 1] = packed & 0xff
    }
    return this.code
  }

  routineAddress(name: string): number {
    return this.routines.get(name)!
  }
}

/** A story of `version` whose code is what `body` assembles; `main` is the first routine and where play starts. */
export function assemble(version: Version, body: (a: Asm) => void, layout: Layout = {}): Uint8Array {
  const v3 = version <= 3
  const mem: number[] = new Array(0x40).fill(0)
  const set16 = (a: number, x: number) => {
    mem[a] = (x >> 8) & 0xff
    mem[a + 1] = x & 0xff
  }

  // Globals at 0x40 (240 words).
  const globals = 0x40
  mem.length = globals + 480
  mem.fill(0, globals)
  for (const [g, x] of Object.entries(layout.globals ?? {})) set16(globals + Number(g) * 2, x)

  // Scratch at DATA (1 KB).
  while (mem.length < DATA + 1024) mem.push(0)

  // The object table.
  const objects = mem.length
  const defaults = v3 ? 31 : 63
  for (let i = 0; i < defaults * 2; i++) mem.push(0)
  const entrySize = v3 ? 9 : 14
  const objs = layout.objects ?? []
  const entriesAt = mem.length
  for (let i = 0; i < objs.length * entrySize; i++) mem.push(0)
  objs.forEach((o, i) => {
    const e = entriesAt + i * entrySize
    for (const a of o.attributes ?? []) mem[e + (a >> 3)] = (mem[e + (a >> 3)] ?? 0) | (0x80 >> (a & 7))
    const links = [o.parent ?? 0, o.sibling ?? 0, o.child ?? 0]
    if (v3) links.forEach((l, k) => (mem[e + 4 + k] = l))
    else links.forEach((l, k) => set16(e + 6 + k * 2, l))
    const table = mem.length
    set16(e + (v3 ? 7 : 12), table)
    const name = encodeText(o.name)
    mem.push(name.length / 2, ...name)
    const props = Object.entries(o.properties ?? {}).map(([p, d]) => [Number(p), d] as const).sort((x, y) => y[0] - x[0])
    for (const [p, data] of props) {
      if (v3) mem.push(((data.length - 1) << 5) | p)
      else if (data.length <= 2) mem.push((data.length === 2 ? 0x40 : 0) | p)
      else mem.push(0x80 | p, 0x80 | (data.length & 63))
      mem.push(...data)
    }
    mem.push(0)
  })

  // The dictionary.
  const dictionary = mem.length
  const seps = [...(layout.separators ?? '.,')].map(c => c.charCodeAt(0))
  const keyBytes = v3 ? 4 : 6
  const entryLength = keyBytes + 3
  const words = [...(layout.words ?? [])].sort()
  mem.push(seps.length, ...seps, entryLength, (words.length >> 8) & 0xff, words.length & 0xff)
  // Lowercase words only: their keys sort as the words do (§13.2: the dictionary is sorted).
  const encoded = words.map(w => {
    const zchars: number[] = []
    for (const ch of w.slice(0, v3 ? 6 : 9)) zchars.push(ch.charCodeAt(0) - 97 + 6)
    while (zchars.length < (v3 ? 6 : 9)) zchars.push(5)
    const key: number[] = []
    for (let i = 0; i < zchars.length; i += 3) {
      let x = (zchars[i]! << 10) | (zchars[i + 1]! << 5) | zchars[i + 2]!
      if (i + 3 >= zchars.length) x |= 0x8000
      key.push(x >> 8, x & 0xff)
    }
    return key
  })
  for (const key of encoded) mem.push(...key, 0, 0, 0)

  // Static memory starts here; code follows in high memory.
  const staticBase = mem.length
  while (mem.length % 8) mem.push(0)
  const a = new Asm(version, mem.length)
  body(a)
  const code = a.finish()
  const start = mem.length
  mem.push(...code)
  while (mem.length % 8) mem.push(0)

  mem[0] = version
  set16(0x04, start) // high memory
  // Play starts at the first instruction of `main` (after its local count, and v1–4 initial values).
  const main = a.routineAddress('main')
  const mainLocals = mem[main]!
  set16(0x06, main + 1 + (version <= 4 ? mainLocals * 2 : 0))
  set16(0x08, dictionary)
  set16(0x0a, objects)
  set16(0x0c, globals)
  set16(0x0e, staticBase)
  set16(0x1a, mem.length / a.scale)
  let sum = 0
  for (let i = 0x40; i < mem.length; i++) sum = (sum + mem[i]!) & 0xffff
  set16(0x1c, sum)
  for (const [at, x] of Object.entries(layout.header ?? {})) mem[Number(at)] = x
  return Uint8Array.from(mem)
}
