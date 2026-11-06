/**
 * Cross-references, both ways: for every routine, string, object, global and
 * dictionary word, what refers to it (`from`) and what it refers to (`to`).
 *
 * Instructions refer by their operands, read the way txd reads them (see
 * operands.ts): a call's routine, a string's packed address, an object in an
 * object position, a dictionary word, a global read or written. Objects refer
 * by property values: a property word that is exactly a known routine's or
 * string's packed address (Inform's `before`, `description`, …).
 */
import { unpack } from './address.js'
import type { Instruction } from './decode.js'
import { operandKind } from './operands.js'
import type { Routine } from './routines.js'
import type { Dictionary, Id, ObjectTable, Version, ZString } from './types.js'

/** Where a reference is made: the routine (or object) it's in, and the instruction (or property) address. */
export interface XrefSite {
  id: Id
  address: number
}

export interface XrefEntry {
  /** What refers to this. */
  from: XrefSite[]
  /** What this refers to (each once, in the order first seen). */
  to: Id[]
}

/** By Id; an Id with no references either way has no entry. */
export type Xrefs = Record<string, XrefEntry>

export function buildXrefs(
  version: Version,
  routines: Routine[],
  strings: ZString[],
  objects: ObjectTable,
  dictionary: Dictionary,
): Xrefs {
  const out: Xrefs = {}
  const entry = (id: Id) => (out[id] ??= { from: [], to: [] })
  const link = (from: Id, at: number, to: Id) => {
    entry(to).from.push({ id: from, address: at })
    const e = entry(from)
    if (!e.to.includes(to)) e.to.push(to)
  }

  const routineIds = new Map(routines.map(r => [r.address, r.id]))
  const stringIds = new Map(strings.map(s => [s.address, s.id]))
  const wordIds = new Map(dictionary.entries.map(e => [e.address, e.id]))
  const nObjects = objects.objects.length
  const global = (v: number) => (v >= 16 ? (`global:${v - 16}` as const) : undefined)

  const instructionRefs = (r: Routine, ins: Instruction) => {
    ins.operands.forEach((o, i) => {
      if (o.kind === 'variable') {
        const g = global(o.value)
        if (g) link(r.id, ins.address, g)
        return
      }
      const kind = operandKind(ins, i)
      if (kind === 'ref') {
        const g = global(o.value)
        if (g) link(r.id, ins.address, g)
      } else if (kind === 'routine') {
        const id = routineIds.get(unpack(o.value, version))
        if (id) link(r.id, ins.address, id)
      } else if (kind === 'obj') {
        if (o.value >= 1 && o.value <= nObjects) link(r.id, ins.address, `object:${o.value}`)
      } else if ((kind === 'any' || kind === 'paddr') && o.kind === 'large') {
        const s = stringIds.get(unpack(o.value, version))
        if (s) link(r.id, ins.address, s)
        const w = kind === 'any' ? wordIds.get(o.value) : undefined
        if (w) link(r.id, ins.address, w)
      } else if (kind === 'low' && o.kind === 'large') {
        const w = wordIds.get(o.value)
        if (w) link(r.id, ins.address, w)
      }
    })
    if (ins.store !== undefined) {
      const g = global(ins.store)
      if (g) link(r.id, ins.address, g)
    }
  }
  for (const r of routines) for (const ins of r.instructions) instructionRefs(r, ins)

  // Property values: every word that is exactly a routine's or string's packed address.
  for (const o of objects.objects) {
    for (const p of o.properties) {
      for (let i = 0; i + 1 < p.data.length; i += 2) {
        const packed = (p.data[i]! << 8) | p.data[i + 1]!
        const at = unpack(packed, version)
        const target = routineIds.get(at) ?? stringIds.get(at)
        if (target) link(o.id, p.dataAddress + i, target)
      }
    }
  }
  return out
}
