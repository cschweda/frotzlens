/**
 * ZIL's grammar: the syntax tables ZILF writes (and Infocom's ZIL compiler wrote) for the "old"
 * parser. Learned from ZILF's source (Compilation.Syntax.cs, OldParserVocabFormat.cs,
 * OldParserWord.cs, ScopeFlags.cs), not from Ztools, which looks for these tables where ZILF
 * doesn't put them and reads past the end of the file.
 *
 *   VTBL  255 words, for verb numbers 255 down to 1: each 0, or the address of that verb's
 *         syntax table. The global VERBS starts out holding VTBL's address.
 *   ST    one per verb: a count byte, then that many syntax lines, last-defined first. A line is
 *         8 bytes (nobj prep1 prep2 find1 find2 opts1 opts2 action), or, with COMPACT-SYNTAXES?,
 *         2 to 7 (prep1|nobj<<6, action, then find1 opts1 for an object, prep2 find2 opts2 for two).
 *   ATBL  the action routines, a packed address per action number (the global ACTIONS).
 *   PATBL the pre-action routines, the same length (or, with COMPACT-PREACTIONS?, pairs of action
 *         number and routine ending in -1) (the global PREACTIONS).
 *   PRTBL the prepositions: a count word, then each a dictionary word and its preposition number
 *         (the global PREPOSITIONS).
 *
 * The tables are found without symbols: among the globals' starting values, the one that is a
 * verb table every one of whose entries reads as a syntax table, and so on for the rest.
 */
import { packedScale } from './address.js'
import type { Bytes } from './bytes.js'
import type { Routine } from './routines.js'
import type { Dictionary, Global, Version } from './types.js'

/** A word's part-of-speech flags (the first data byte), as ZILF and Infocom's compiler write them. */
export const PART = { buzzword: 4, preposition: 8, direction: 16, adjective: 32, verb: 64, object: 128 } as const
const FIRST_MASK = 3
const VERB_FIRST = 1
const ADJECTIVE_FIRST = 2
const DIRECTION_FIRST = 3

export interface ZilSyntaxLine {
  /** Where the line starts. */
  address: number
  /** Its bytes, as stored. */
  bytes: number[]
  objects: 0 | 1 | 2
  /** The preposition number before each object (0: none). */
  prepositions: [number, number]
  /** The FIND flag (an attribute number) for each object, or 0. */
  find: [number, number]
  /** The search options for each object (bits; their meaning is the library's). */
  options: [number, number]
  /** An object that is a TOPIC (ZILF's extended format). */
  topic: [boolean, boolean]
  action: number
}

export interface ZilVerb {
  /** Its verb number: 255 for the first verb defined, downwards. */
  number: number
  /** Its syntax table. */
  address: number
  /** The dictionary words with this verb number. */
  words: string[]
  lines: ZilSyntaxLine[]
}

export interface ZilGrammar {
  /** 8-byte syntax lines (ZILF's default, Infocom's fixed format), or COMPACT-SYNTAXES? lines. */
  format: 'fixed' | 'compact'
  verbTable: number
  verbs: ZilVerb[]
  actionTable: number
  /** Routine addresses, by action number. */
  actions: number[]
  preactionTable?: number
  /** Pre-action routine addresses by action number (0: none). */
  preactions: number[]
  prepositionTable?: number
  /** Preposition numbers, each with its words. */
  prepositions: { number: number; words: string[] }[]
  /** The names of the search options' bits, when the library is known: zillib's, or Infocom's. */
  searchFlags: Record<number, string>
}

/** zillib's search options (parser.zil's NEW-SFLAGS), as ZILF 1.x builds them. */
export const ZILLIB_SEARCH_FLAGS: Record<number, string> = {
  1: 'HAVE', 2: 'MANY', 4: 'TAKE', 8: 'IN-ROOM', 16: 'CARRIED', 32: 'EVERYWHERE', 64: 'TOUCH',
}
/** Infocom's original search options (ZILF's ScopeFlags.Original). */
export const INFOCOM_SEARCH_FLAGS: Record<number, string> = {
  2: 'HAVE', 4: 'MANY', 8: 'TAKE', 16: 'ON-GROUND', 32: 'IN-ROOM', 64: 'CARRIED', 128: 'HELD',
}

/**
 * The verb number a dictionary entry carries, or undefined if it isn't a verb. ZILF writes the
 * flags byte, then the values of (at most) two parts of speech in this order: preposition and
 * buzzword first, then adjective (v3), direction and verb, the one marked "first" moved to the
 * front, and the object's (always 0) first when nothing is marked.
 */
export function verbNumber(data: readonly number[], version: Version): number | undefined {
  const pos = data[0] ?? 0
  if (!(pos & PART.verb)) return undefined
  const first = pos & FIRST_MASK
  const parts: string[] = []
  const place = (part: string, isFirst: boolean) => (isFirst ? parts.unshift(part) : parts.push(part))
  if (pos & PART.adjective && version < 4) place('adjective', first === ADJECTIVE_FIRST)
  if (pos & PART.direction) place('direction', first === DIRECTION_FIRST)
  place('verb', first === VERB_FIRST)
  if (pos & PART.object) place('object', first === 0)
  if (pos & PART.buzzword) parts.unshift('buzzword')
  if (pos & PART.preposition) parts.unshift('preposition')
  const i = parts.indexOf('verb')
  return i < 2 ? data[1 + i] : undefined
}

/** A syntax table's lines at `at`, or undefined if those bytes can't be one. */
function readSyntaxTable(bytes: Bytes, at: number, format: 'fixed' | 'compact', limit: number): ZilSyntaxLine[] | undefined {
  if (at <= 0 || at >= limit) return undefined
  const n = bytes.byte(at)
  if (n < 1 || n > 64) return undefined
  const lines: ZilSyntaxLine[] = []
  let a = at + 1
  for (let i = 0; i < n; i++) {
    if (format === 'fixed') {
      if (a + 8 > limit) return undefined
      const b = Array.from({ length: 8 }, (_, k) => bytes.byte(a + k))
      const nobj = b[0]! & 3
      // Bits other than the count and the two TOPIC bits are reserved (zero); 3 objects is invalid.
      if (nobj === 3 || b[0]! & ~(3 | 4 | 16)) return undefined
      lines.push({
        address: a,
        bytes: b,
        objects: nobj as 0 | 1 | 2,
        prepositions: [nobj >= 1 ? b[1]! : 0, nobj >= 2 ? b[2]! : 0],
        find: [b[3]!, b[4]!],
        options: [b[5]!, b[6]!],
        topic: [!!(b[0]! & 4), !!(b[0]! & 16)],
        action: b[7]!,
      })
      a += 8
    } else {
      if (a + 2 > limit) return undefined
      const head = bytes.byte(a)
      const nobj = head >> 6
      if (nobj === 3) return undefined
      const size = nobj === 0 ? 2 : nobj === 1 ? 4 : 7
      if (a + size > limit) return undefined
      const b = Array.from({ length: size }, (_, k) => bytes.byte(a + k))
      lines.push({
        address: a,
        bytes: b,
        objects: nobj as 0 | 1 | 2,
        prepositions: [nobj >= 1 ? head & 63 : 0, nobj >= 2 ? b[4]! & 63 : 0],
        find: [nobj >= 1 ? b[2]! : 0, nobj >= 2 ? b[5]! : 0],
        options: [nobj >= 1 ? b[3]! : 0, nobj >= 2 ? b[6]! : 0],
        topic: [false, false],
        action: b[1]!,
      })
      a += size
    }
  }
  return lines
}

/**
 * The verb table at `at`, in a format: the syntax tables of every verb number with one, or
 * undefined if any entry doesn't read as a syntax table (or there are none).
 */
function readVerbTable(bytes: Bytes, at: number, format: 'fixed' | 'compact', limit: number): { number: number; address: number; lines: ZilSyntaxLine[] }[] | undefined {
  if (at + 510 > limit) return undefined
  const out: { number: number; address: number; lines: ZilSyntaxLine[] }[] = []
  for (let i = 0; i < 255; i++) {
    const st = bytes.word(at + 2 * i)
    if (!st) continue
    const lines = readSyntaxTable(bytes, st, format, limit)
    if (!lines) return undefined
    out.push({ number: 255 - i, address: st, lines })
  }
  return out.length ? out : undefined
}

/**
 * Decode ZIL's syntax tables, or undefined when no global leads to them (an Inform story, or a
 * ZIL game written for the new parser). `limit` is where static memory ends (the tables are all
 * below high memory).
 */
export function parseZilGrammar(
  bytes: Bytes,
  version: Version,
  globals: Global[],
  dictionary: Dictionary,
  routines: Routine[],
  limit: number,
  searchFlags: Record<number, string>,
): ZilGrammar | undefined {
  const end = Math.min(limit, bytes.size)
  const values = [...new Set(globals.map(g => g.value).filter(v => v >= 64 && v < end))]

  // The verb table: a global's value whose 255 words are all syntax tables (fixed, else compact).
  let found: { at: number; format: 'fixed' | 'compact'; verbs: NonNullable<ReturnType<typeof readVerbTable>> } | undefined
  for (const format of ['fixed', 'compact'] as const) {
    for (const v of values) {
      const verbs = readVerbTable(bytes, v, format, end)
      if (verbs && (!found || verbs.length > found.verbs.length)) found = { at: v, format, verbs }
    }
    if (found) break
  }
  if (!found) return undefined

  // The action table: a global's value whose first (highest action + 1) words are all routines.
  const scale = packedScale(version)
  const isRoutine = new Set(routines.map(r => r.address))
  const count = Math.max(...found.verbs.flatMap(v => v.lines.map(l => l.action))) + 1
  const words = (at: number, n: number) => (at + 2 * n <= end ? Array.from({ length: n }, (_, i) => bytes.word(at + 2 * i)) : undefined)
  const actionTable = values.find(v => words(v, count)?.every(w => w !== 0 && isRoutine.has(w * scale)))
  if (actionTable === undefined) return undefined
  const actions = words(actionTable, count)!.map(w => w * scale)

  // Pre-actions: the same length, each 0 or a routine (not the action table itself).
  // At least one is a routine: a run of zeros could be anything.
  const preactionTable = values.find(v => {
    const w = v !== actionTable ? words(v, count) : undefined
    return !!w && w.some(x => x !== 0) && w.every(x => x === 0 || isRoutine.has(x * scale))
  })
  const preactions = preactionTable !== undefined ? words(preactionTable, count)!.map(w => w * scale) : []

  // Prepositions: a count word, then each a dictionary word and its number (words, not compact).
  const entryAt = new Map(dictionary.entries.map(e => [e.address, e]))
  const prepositionTable = values.find(v => {
    const n = v + 2 <= end ? bytes.word(v) : 0
    return n > 0 && n < 256 && v + 2 + 4 * n <= end && Array.from({ length: n }, (_, i) => entryAt.has(bytes.word(v + 2 + 4 * i))).every(Boolean)
  })
  const byNumber = new Map<number, string[]>()
  if (prepositionTable !== undefined) {
    const n = bytes.word(prepositionTable)
    for (let i = 0; i < n; i++) {
      const word = entryAt.get(bytes.word(prepositionTable + 2 + 4 * i))!.word
      const number = bytes.word(prepositionTable + 4 + 4 * i)
      byNumber.set(number, [...(byNumber.get(number) ?? []), word])
    }
  }

  // Each verb's words: the dictionary words whose verb number is the verb's.
  const verbWords = new Map<number, string[]>()
  for (const e of dictionary.entries) {
    const n = verbNumber(e.data, version)
    if (n !== undefined) verbWords.set(n, [...(verbWords.get(n) ?? []), e.word])
  }

  return {
    format: found.format,
    verbTable: found.at,
    verbs: found.verbs.map(v => ({ ...v, words: verbWords.get(v.number) ?? [] })),
    actionTable,
    actions,
    ...(preactionTable !== undefined ? { preactionTable } : {}),
    preactions,
    ...(prepositionTable !== undefined ? { prepositionTable } : {}),
    prepositions: [...byNumber].sort((a, b) => b[0] - a[0]).map(([number, words]) => ({ number, words })),
    searchFlags,
  }
}
