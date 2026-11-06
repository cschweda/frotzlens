/**
 * Cross-references, both ways: for every routine, string, object, global and
 * dictionary word, what refers to it (`from`) and what it refers to (`to`).
 *
 * Instructions refer by their operands, read the way txd reads them (see
 * operands.ts): a call's routine, a string's packed address, an object in an
 * object position, a dictionary word, a global read or written. Objects refer
 * by property values: a property word that is exactly a known routine's or
 * string's packed address (Inform's `before`, `description`, …). A verb's
 * dictionary word refers by its grammar lines: to their prepositions and to
 * their action and parsing routines.
 *
 * The index is sparse: something nothing refers to, and that refers to
 * nothing, has no entry.
 */
import { unpack } from './address.js'
import type { Instruction } from './decode.js'
import { operandKind } from './operands.js'
import type { Routine } from './routines.js'
import type { Grammar } from './grammar.js'
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

/**
 * The most references the index records. A crafted grammar (many synonyms ×
 * many lines × many tokens) could otherwise ask for an enormous index; real
 * stories record a few thousand (Mingus I: ~12,000). Past it, the index is cut
 * and parseStory warns.
 */
export const MAX_XREFS = 1_000_000

class XrefsFull extends Error {}

export function buildXrefs(
  version: Version,
  routines: Routine[],
  strings: ZString[],
  objects: ObjectTable,
  dictionary: Dictionary,
  grammar?: Grammar,
): { xrefs: Xrefs; full: boolean } {
  const out: Xrefs = {}
  const entry = (id: Id) => (out[id] ??= { from: [], to: [] })
  // `to` stays an ordered list in the model; a Set beside it keeps each link O(1).
  const toSets = new Map<Id, Set<Id>>()
  let links = 0
  const link = (from: Id, at: number, to: Id) => {
    if (++links > MAX_XREFS) throw new XrefsFull()
    entry(to).from.push({ id: from, address: at })
    let seen = toSets.get(from)
    if (!seen) toSets.set(from, (seen = new Set()))
    if (!seen.has(to)) {
      seen.add(to)
      entry(from).to.push(to)
    }
  }
  try {
    build()
  } catch (e) {
    if (!(e instanceof XrefsFull)) throw e
    return { xrefs: out, full: true }
  }
  return { xrefs: out, full: false }

  function build() {

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
      } else if (kind === 'paddr') {
        // print_paddr names a string whatever the constant's size.
        const s = stringIds.get(unpack(o.value, version))
        if (s) link(r.id, ins.address, s)
      } else if (kind === 'any' && o.kind === 'large') {
        const s = stringIds.get(unpack(o.value, version))
        if (s) link(r.id, ins.address, s)
        const w = wordIds.get(o.value)
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
  // The grammar: a verb's lines refer, from its dictionary word, to their prepositions' words and to
  // the routines they name (the action's routine, and any parsing routine a token calls).
  if (grammar) {
    const wordByText = new Map(dictionary.entries.map(e => [e.word, e.id]))
    const prepositionWord = (data: number) =>
      grammar.version === 2 ? wordIds.get(data)
      : grammar.version === 3 ? wordIds.get(grammar.prepositions[data]?.address ?? -1)
      : wordIds.get(grammar.prepositions.find(p => p.number === data)?.address ?? -1)
    const parsingRoutine = (data: number) =>
      grammar.version === 1 ? grammar.parsingRoutines[data] : grammar.version === 2 ? unpack(data, version) : undefined
    for (const verb of grammar.verbs) {
      // What the verb's lines name — worked out once, then given to each of its words (the verb
      // and its synonyms), which all refer through the same lines.
      const targets: { at: number; to: Id }[] = []
      for (const line of verb.lines) {
        const action = routineIds.get(grammar.actions[line.action] ?? -1)
        if (action) targets.push({ at: line.address, to: action })
        for (const t of line.tokens) {
          if (t.kind === 'preposition') {
            const prep = prepositionWord(t.data)
            if (prep) targets.push({ at: line.address, to: prep })
          } else if (t.kind === 'routine' || t.kind === 'noun-routine' || t.kind === 'scope-routine') {
            const at = parsingRoutine(t.data)
            const routine = at !== undefined ? routineIds.get(at) : undefined
            if (routine) targets.push({ at: line.address, to: routine })
          }
        }
      }
      for (const verbWord of verb.words) {
        const from = wordByText.get(verbWord)
        if (from) for (const t of targets) link(from, t.at, t.to)
      }
    }
  }
  }
}
