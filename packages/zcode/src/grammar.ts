/**
 * Inform's grammar table (Inform Technical Manual §8), versions 1, 2 and 3. Not
 * part of the Z-machine Standard: it's how Inform's parser library stores
 * verbs. A story from another compiler has none, and `grammar` is undefined.
 *
 * Layout, from the start of static memory (where Inform puts it):
 *   the grammar pointer table: one word per verb (verb 255, 254, …), each the
 *     address of that verb's grammar;
 *   each verb's grammar: a byte, the number of lines, then the lines;
 *   the action table: one packed routine per action;
 *   GV1 only: the parsing-routine table (one per general-parsing routine) and
 *     the preposition table (a count word, then a dictionary address and a
 *     preposition number per entry); GV2 keeps an empty preposition table.
 *
 * A GV1 line is 8 bytes: the number of tokens, six token bytes, the action.
 * A GV2 line is an action word (bits 0–9 the action, bit 10 "reverse"), then
 * 3-byte tokens (a type byte and a data word), ended by 15 (ENDIT).
 * A GV3 line (Inform 6.42+, PunyInform's compact form) is an action word whose
 * top 5 bits count its tokens, then 2-byte tokens: the GV2 type byte and a data
 * byte (for a preposition, its index in the preposition table).
 *
 * The preposition table sits right before the dictionary: a count word, then
 * per entry a dictionary address and its number (GV1, 4 bytes) or a dictionary
 * address (GV3, 2 bytes); GV2's is just a count of 0. The action table runs
 * from the end of the grammar to it (in GV1, the parsing-routine table between).
 *
 * Which version a story uses isn't recorded, so each layout is tried and the
 * one whose pointer table chains — each verb's grammar ending where the next
 * begins — is taken. (Ztools guesses differently, and reads PunyInform's GV3
 * as GV1.)
 */
import { unpack } from './address.js'
import { Bytes, Malformed, OutOfBounds } from './bytes.js'
import type { DictEntry, Dictionary, Version } from './types.js'

export type TokenKind = 'elementary' | 'preposition' | 'noun-routine' | 'attribute' | 'scope-routine' | 'routine' | 'unknown'

export interface GrammarToken {
  kind: TokenKind
  /** GV2: the type byte. GV1: the token byte. */
  type: number
  /** GV2: the data word (an elementary token's number, a dictionary address, an attribute, a packed routine). GV3: the data byte. GV1: the routine or attribute number. */
  data: number
  /** GV2: a preposition joined to the previous one by "/" (type bit 4). */
  alternative?: boolean
}

export interface GrammarLine {
  address: number
  /** The line's bytes as stored (what infodump prints in brackets). */
  bytes: number[]
  action: number
  /** GV2: the "reverse" flag (bit 10 of the action word). */
  reverse?: boolean
  tokens: GrammarToken[]
}

export interface GrammarVerb {
  /** 255 for the first, counting down (the dictionary's verb number for its words). */
  number: number
  address: number
  /** Its dictionary words, in dictionary order: the first is the verb, the rest its synonyms. */
  words: string[]
  lines: GrammarLine[]
}

export interface Grammar {
  version: 1 | 2 | 3
  /** The grammar pointer table's address. */
  address: number
  verbs: GrammarVerb[]
  /** Each action's routine (a byte address), by action number. */
  actions: number[]
  /** GV1: each general parsing routine (a byte address), by number. */
  parsingRoutines: number[]
  /** GV1: the prepositions, by number (255 down). GV3: by index (number = index). GV2's table is empty. */
  prepositions: { number: number; word: string; address: number }[]
  /** The tables' extents, [start, end) — for the memory map. */
  tables: {
    pointers: [number, number]
    data: [number, number]
    actions: [number, number]
    parsingRoutines?: [number, number]
    prepositions: [number, number]
  }
}

/** GV1 token bytes (Inform Technical Manual §8.1, and as infodump names them). */
export function gv1Token(b: number, prepositions: Map<number, unknown>): GrammarToken {
  if (b <= 9) return { kind: 'elementary', type: b, data: b }
  if (b >= 0x10 && b <= 0x2f) return { kind: 'noun-routine', type: b, data: b - 0x10 }
  if (b >= 0x30 && b <= 0x4f) return { kind: 'routine', type: b, data: b - 0x30 }
  if (b >= 0x50 && b <= 0x7f) return { kind: 'scope-routine', type: b, data: b - 0x50 }
  if (prepositions.has(b)) return { kind: 'preposition', type: b, data: b }
  if (b >= 0x80 && b <= 0xb3) return { kind: 'attribute', type: b, data: b - 0x80 }
  return { kind: 'unknown', type: b, data: b }
}

const GV2_KIND: Record<number, TokenKind> = {
  1: 'elementary',
  2: 'preposition',
  3: 'noun-routine',
  4: 'attribute',
  5: 'scope-routine',
  6: 'routine',
}

function readGv2Line(bytes: Bytes, at: number): GrammarLine {
  const w = bytes.word(at)
  const tokens: GrammarToken[] = []
  let a = at + 2
  for (;;) {
    const type = bytes.byte(a)
    if (type === 15) {
      a++
      break
    }
    if (tokens.length >= 32) throw new Malformed('a grammar line with no end', at)
    const data = bytes.word(a + 1)
    const t: GrammarToken = { kind: GV2_KIND[type & 0x0f] ?? 'unknown', type, data }
    if (type & 0x10) t.alternative = true
    tokens.push(t)
    a += 3
  }
  const line: GrammarLine = { address: at, bytes: [...bytes.slice(at, a - at)], action: w & 0x3ff, tokens }
  if (w & 0x400) line.reverse = true
  return line
}

function readGv3Line(bytes: Bytes, at: number): GrammarLine {
  const w = bytes.word(at)
  const n = w >> 11
  const tokens: GrammarToken[] = []
  for (let i = 0; i < n; i++) {
    const type = bytes.byte(at + 2 + 2 * i)
    const t: GrammarToken = { kind: GV2_KIND[type & 0x0f] ?? 'unknown', type, data: bytes.byte(at + 3 + 2 * i) }
    if (type & 0x10) t.alternative = true
    tokens.push(t)
  }
  const line: GrammarLine = { address: at, bytes: [...bytes.slice(at, 2 + 2 * n)], action: w & 0x3ff, tokens }
  if (w & 0x400) line.reverse = true
  return line
}

function readGv1Line(bytes: Bytes, at: number): GrammarLine {
  const raw = [...bytes.slice(at, 8)]
  const count = raw[0]!
  if (count > 6) throw new Malformed(`a GV1 line with ${count} tokens`, at)
  return { address: at, bytes: raw, action: raw[7]!, tokens: [] } // tokens filled once prepositions are known
}

/** The verbs' grammar under one version's layout; Malformed if the pointers don't chain. */
function readVerbs(bytes: Bytes, table: number, count: number, version: 1 | 2 | 3) {
  const pointers = Array.from({ length: count }, (_, i) => bytes.word(table + 2 * i))
  if (pointers[0] !== table + 2 * count) throw new Malformed('the first verb does not follow the pointer table', table)
  const verbs: { address: number; lines: GrammarLine[] }[] = []
  let end = pointers[0]!
  for (let i = 0; i < count; i++) {
    const at = pointers[i]!
    if (at !== end) throw new Malformed(`verb ${255 - i}'s grammar is not where the previous one ends`, at)
    const n = bytes.byte(at)
    const lines: GrammarLine[] = []
    let a = at + 1
    for (let j = 0; j < n; j++) {
      const line = version === 2 ? readGv2Line(bytes, a) : version === 3 ? readGv3Line(bytes, a) : readGv1Line(bytes, a)
      lines.push(line)
      a += line.bytes.length
    }
    verbs.push({ address: at, lines })
    end = a
  }
  return { verbs, end }
}

/**
 * The grammar, or undefined when the story has none that reads as Inform's
 * (no verb words in the dictionary, or tables that don't chain either way).
 */
export function parseGrammar(
  bytes: Bytes,
  version: Version,
  staticMemory: number,
  globalsEnd: number,
  dictionary: Dictionary,
): Grammar | undefined {
  const verbWords = dictionary.entries.filter(e => e.inform?.verb && e.data.length >= 2)
  if (!verbWords.length) return undefined
  const lowest = Math.min(...verbWords.map(e => e.data[1]!))
  const count = 256 - lowest

  // Where the table is: the Standard Library's Inform puts it at the start of static memory;
  // PunyInform's leaves it in dynamic memory. A pointer table's first word points just past
  // itself (to the first verb's grammar), and its verbs must chain under one layout.
  const tryAt = (t: number) => {
    if (!bytes.has(t, 2) || bytes.word(t) !== t + 2 * count) return undefined
    for (const v of [2, 3, 1] as const) {
      try {
        return { table: t, gv: v, layout: readVerbs(bytes, t, count, v) }
      } catch (e) {
        if (!(e instanceof Malformed || e instanceof OutOfBounds)) throw e
      }
    }
    return undefined
  }
  let found = tryAt(staticMemory)
  for (let t = globalsEnd; !found && t + 2 * count < dictionary.address; t++) found = tryAt(t)
  if (!found) return undefined
  const { table, gv, layout } = found

  const byNumber = new Map<number, DictEntry[]>()
  for (const e of verbWords) {
    const list = byNumber.get(e.data[1]!) ?? []
    list.push(e)
    byNumber.set(e.data[1]!, list)
  }

  // The preposition table is right before the dictionary: find the count that fits.
  const entrySize = gv === 1 ? 4 : gv === 3 ? 2 : 0
  let prepAt = dictionary.address - 2
  if (entrySize) {
    for (let n = 0; n < 256; n++) {
      const at = dictionary.address - 2 - entrySize * n
      if (at < layout.end) break
      if (bytes.word(at) === n) {
        prepAt = at
        break
      }
    }
  }
  const nPreps = bytes.word(prepAt)
  const words = new Map(dictionary.entries.map(e => [e.address, e.word]))
  const prepositions: Grammar['prepositions'] = []
  for (let i = 0; i < nPreps; i++) {
    const entry = prepAt + 2 + entrySize * i
    const address = bytes.word(entry)
    prepositions.push({ number: gv === 1 ? bytes.word(entry + 2) : i, word: words.get(address) ?? '', address })
  }
  const prepEnd = prepAt + 2 + entrySize * nPreps

  // The action table runs from the end of the grammar to the preposition table; in GV1 the
  // parsing-routine table comes between, as many as the highest routine token names (+1).
  const all = layout.verbs.flatMap(v => v.lines)
  const actionsAt = layout.end
  let parsingRoutines: number[] = []
  let parsingRange: [number, number] | undefined
  let nActions = Math.max(0, Math.floor((prepAt - actionsAt) / 2))
  if (gv === 1) {
    // noun=Routine (0x10+n), general parsing routines (0x30+n) and scope=Routine (0x50+n) all
    // index this one table, so it is as long as the highest index any of them uses (+1).
    const indexes = all.flatMap(l => l.bytes.slice(1, 7)).flatMap(b =>
      b >= 0x10 && b <= 0x2f ? [b - 0x10] : b >= 0x30 && b <= 0x4f ? [b - 0x30] : b >= 0x50 && b <= 0x7f ? [b - 0x50] : [],
    )
    const nParsing = indexes.length ? Math.max(...indexes) + 1 : 0
    nActions = Math.max(0, nActions - nParsing)
    const parsingAt = actionsAt + 2 * nActions
    parsingRoutines = Array.from({ length: nParsing }, (_, i) => unpack(bytes.word(parsingAt + 2 * i), version))
    parsingRange = [parsingAt, parsingAt + 2 * nParsing]
  }
  const actions = Array.from({ length: nActions }, (_, i) => unpack(bytes.word(actionsAt + 2 * i), version))

  if (gv === 1) {
    const preps = new Map(prepositions.map(p => [p.number, p]))
    for (const line of all) {
      const n = line.bytes[0]!
      // The count is of noun parameters: prepositions along the way don't count (get off NOUN: 1).
      const tokens: GrammarToken[] = []
      let params = 0
      for (const b of line.bytes.slice(1, 7)) {
        if (params >= n) break
        const t = gv1Token(b, preps)
        tokens.push(t)
        if (t.kind !== 'preposition') params++
      }
      line.tokens = tokens
    }
  }

  const verbs: GrammarVerb[] = layout.verbs.map((v, i) => ({
    number: 255 - i,
    address: v.address,
    words: (byNumber.get(255 - i) ?? []).map(e => e.word),
    lines: v.lines,
  }))
  return {
    version: gv,
    address: table,
    verbs,
    actions,
    parsingRoutines,
    prepositions,
    tables: {
      pointers: [table, table + 2 * count],
      data: [table + 2 * count, layout.end],
      actions: [actionsAt, actionsAt + 2 * nActions],
      ...(parsingRange ? { parsingRoutines: parsingRange } : {}),
      prepositions: [prepAt, prepEnd],
    },
  }
}
