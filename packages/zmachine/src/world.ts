/**
 * The story's world as the debugger sees it (docs/20): the object table and globals read from a
 * live machine's memory with the interpreter's own code (so they agree with what the story sees),
 * named from the symbols, and the static facts (short names, where property tables lie) from
 * @frotzinc/zcode's model. It is the expression language's context, and maps an address written
 * to the global or object it belongs to.
 */
import type { StoryFile, Symbols } from '@frotzinc/zcode'
import type { ExprContext } from './expr.js'
import type { Machine } from './machine.js'
import { Memory } from './memory.js'
import { Objects } from './objects.js'

/** Name → number, for each kind of name the symbols have, built once per set of symbols. */
export interface NameIndex {
  globals: Map<string, number>
  objects: Map<string, number>
  attributes: Map<string, number>
  properties: Map<string, number>
  actions: Map<string, number>
}

export function indexNames(symbols: Symbols | undefined): NameIndex {
  const rev = (r: Record<number, string> | undefined) => {
    const m = new Map<string, number>()
    for (const [n, name] of Object.entries(r ?? {})) if (name && !m.has(name)) m.set(name, Number(n))
    return m
  }
  return {
    globals: rev(symbols?.globals),
    objects: rev(symbols?.objects),
    attributes: rev(symbols?.attributes),
    properties: rev(symbols?.properties),
    actions: rev(symbols?.actions),
  }
}

export class World implements ExprContext {
  readonly mem: Memory
  readonly objs: Objects
  readonly globalsBase: number
  private readonly objectTable: number
  private readonly entrySize: number
  private readonly maxObject: number

  constructor(
    private readonly machine: Machine,
    readonly story: StoryFile,
    readonly symbols: Symbols | undefined,
    readonly names: NameIndex,
  ) {
    const bytes = machine.state.memory
    const word = (a: number) => (bytes[a]! << 8) | bytes[a + 1]!
    // A reader only: no hooks, so reading never looks like the story writing.
    this.mem = new Memory(bytes, word(0x0e), undefined)
    this.objectTable = word(0x0a)
    this.objs = new Objects(this.mem, machine.version, this.objectTable)
    this.globalsBase = word(0x0c)
    this.entrySize = machine.version <= 3 ? 9 : 14
    this.maxObject = story.objects.objects.length
  }

  // ── names ─────────────────────────────────────────────────────────────────

  objectName(o: number): string {
    return this.symbols?.objects[o] ?? (this.story.objects.objects[o - 1]?.shortName.text || `object ${o}`)
  }

  globalNumber(name: string): number | undefined {
    const n = this.names.globals.get(name)
    if (n !== undefined) return n
    const hex = /^G([0-9a-f]{2})$/i.exec(name)
    if (hex) return parseInt(hex[1]!, 16)
    const dec = /^g(\d+)$/.exec(name)
    return dec ? Number(dec[1]) : undefined
  }

  globalValue(n: number): number {
    return this.mem.word(this.globalsBase + n * 2)
  }

  // ── the expression context ────────────────────────────────────────────────

  local(name: string): number | undefined {
    const f = this.machine.state.frames.at(-1)
    if (!f) return undefined
    const named = f.routine !== undefined ? this.symbols?.routines[f.routine]?.locals ?? [] : []
    let i = named.indexOf(name)
    if (i < 0) {
      const m = /^L(\d\d?)$/i.exec(name)
      if (m) i = Number(m[1])
    }
    return i >= 0 && i < f.locals.length ? f.locals[i] : undefined
  }

  global(name: string): number | undefined {
    const n = this.globalNumber(name)
    return n !== undefined && n >= 0 && n < 240 ? this.globalValue(n) : undefined
  }

  object(name: string): number | undefined {
    return this.names.objects.get(name)
  }

  objectByShortName(text: string): number | undefined {
    const t = text.toLowerCase()
    return this.story.objects.objects.find(o => o.shortName.text.toLowerCase() === t)?.number
  }

  constant(name: string): number | undefined {
    return this.symbols?.constants[name]
  }

  action(name: string): number | undefined {
    return this.names.actions.get(name)
  }

  attributeNumber(name: string): number | undefined {
    return this.names.attributes.get(name)
  }

  propertyNumber(name: string): number | undefined {
    return this.names.properties.get(name)
  }

  parent(o: number): number {
    return this.objs.parent(o)
  }

  child(o: number): number {
    return this.objs.child(o)
  }

  sibling(o: number): number {
    return this.objs.sibling(o)
  }

  hasAttribute(o: number, a: number): boolean {
    return this.objs.testAttr(o, a)
  }

  property(o: number, p: number): number {
    const f = this.objs.find(o, p)
    if (!f) return this.objs.defaultProp(p)
    return f.size === 1 ? this.mem.byte(f.data) : this.mem.word(f.data)
  }

  // ── where an address is ───────────────────────────────────────────────────

  /** The global an address belongs to, if it's in the globals table. */
  globalAt(address: number): number | undefined {
    const n = Math.floor((address - this.globalsBase) / 2)
    return address >= this.globalsBase && n < 240 ? n : undefined
  }

  /** The object whose entry or property table an address is in. */
  objectAt(address: number): number | undefined {
    const first = this.objectTable + (this.machine.version <= 3 ? 31 : 63) * 2
    const o = Math.floor((address - first) / this.entrySize) + 1
    if (address >= first && o >= 1 && o <= this.maxObject) return o
    return this.tables().find(t => address >= t.start && address < t.end)?.object
  }

  private propertyTables?: { object: number; start: number; end: number }[]
  /** Each object's property table, from its short name to past its last property (they don't move). */
  private tables() {
    this.propertyTables ??= this.story.objects.objects.map(o => {
      const last = o.properties.at(-1)
      return { object: o.number, start: o.propertyTable, end: last ? last.dataAddress + last.size + 1 : o.propertyTable + 2 }
    })
    return this.propertyTables
  }
}
