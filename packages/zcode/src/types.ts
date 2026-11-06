/**
 * The @frotzinc/zcode model: plain data, no classes or methods, so it crosses
 * a postMessage boundary by structured clone and serializes to JSON.
 *
 * Section references (§) are to the Z-Machine Standards Document 1.1.
 */

export type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Stable IDs: the app routes on these (`#object/47`, `#dict/1ca3`). Byte
 * addresses in IDs are lowercase hex with no prefix.
 */
export type Id =
  | `object:${number}`
  | `dict:${string}`
  | `global:${number}`
  | `abbrev:${number}`
  | `string:${string}`
  | `routine:${string}`
  | `segment:${string}`

// ── The whole file ────────────────────────────────────────────────

export interface StoryFile {
  /** The story itself (once Blorb unwrap lands, the unwrapped story). */
  bytes: Uint8Array
  container: 'bare' | 'blorb'
  header: Header
  memory: MemoryMap
  /** 96 entries (v2+), by index; empty in v1. */
  abbreviations: ZString[]
  dictionary: Dictionary
  objects: ObjectTable
  /** 240 (§6.2). */
  globals: Global[]
  // Phase 2:  routines, strings, grammar, xrefs
  // Phase 5:  symbols, fingerprint, rooms
  errors: ParseError[]
}

// ── Header (§11) ───────────────────────────────────────────────────

export interface Header {
  version: Version
  /** Byte 0x01. */
  flags1: number
  release: number
  /** Byte address where high memory starts (0x04). */
  highMemory: number
  /** 0x06: where execution starts (a byte address; v6 stores a packed routine). */
  initialPc: number
  dictionary: number
  objects: number
  globals: number
  /** Byte address where static memory starts (0x0E): the size of dynamic memory. */
  staticMemory: number
  /** Word 0x10. */
  flags2: number
  /** Six ASCII characters (0x12). */
  serial: string
  abbreviations: number
  /** In bytes: the stored word × 2 (v1–3), × 4 (v4–5) or × 8 (v6–8) (§11.1.6). */
  fileLength: number
  /** As stored (0x1C). */
  checksum: number
  /** The sum of bytes 0x40 up to fileLength, mod 0x10000, equals `checksum` (§11.1.6). */
  checksumOk: boolean
  /** v6–7 only (0x28, 0x2A); never set otherwise. */
  routinesOffset?: number
  stringsOffset?: number
  /** v5+ (0x2E); 0 means none. */
  terminatingChars?: number
  /** The terminating characters listed in that table (ZSCII codes), v5+. */
  terminatingKeys?: number[]
  /** v5+ (0x34); 0 means the default alphabets. */
  alphabetTable?: number
  /** 0x36, when non-zero. The Standard defines it for v5+; Inform writes it in every version. */
  headerExtension?: {
    address: number
    /** Every word after the length word, in order (§11.1.7). */
    words: number[]
    /** Word 3: the Unicode translation table, when non-zero. */
    unicodeTable?: number
  }
  /** Inform's compiler version, ASCII in 0x3C–0x3F (e.g. "6.44"). Not in the Standard. */
  inform?: { compilerVersion: string }
}

// ── Memory map ────────────────────────────────────────────────────

export interface Segment {
  id: Id
  kind:
    | 'header'
    | 'abbreviations'
    | 'objects'
    | 'properties'
    | 'globals'
    | 'dictionary'
    | 'dynamic'
    | 'static'
    | 'high'
  /** [start, end) in bytes. */
  start: number
  end: number
  label: string
}

export interface MemoryMap {
  size: number
  /** Dynamic, static and high memory (§1.1). Static and high may overlap. */
  regions: Segment[]
  /** The located tables, by address. Routines and strings arrive in Phase 2. */
  segments: Segment[]
}

// ── Text (§3) ──────────────────────────────────────────────────────

export interface ZString {
  /** `string:<addr>`, or `abbrev:<n>` for an abbreviation. */
  id: Id
  address: number
  /** Bytes consumed, through the word with the end bit. */
  length: number
  /** Decoded, as Unicode. */
  text: string
}

// ── Dictionary (§13) ───────────────────────────────────────────────

export interface Dictionary {
  address: number
  /** The word-separator characters, as stored. */
  separators: string[]
  /** Bytes per entry: the encoded word (4 or 6) plus its data. */
  entryLength: number
  entries: DictEntry[]
}

export interface DictEntry {
  id: Id
  /** 1-based, in stored order. */
  index: number
  address: number
  /** Decoded (truncated as stored: 6 or 9 Z-characters). */
  word: string
  /** The bytes after the encoded word. */
  data: number[]
  /** Inform's #dict_par1 flags, when the file is Inform's. */
  inform?: { verb: boolean; meta: boolean; plural: boolean; preposition: boolean; noun: boolean }
}

// ── Objects (§12) ──────────────────────────────────────────────────

export interface Property {
  number: number
  /** Address of the size byte(s). */
  address: number
  dataAddress: number
  /** Data length in bytes (§12.4.1, §12.4.2). */
  size: number
  data: Uint8Array
}

export interface ZObject {
  id: Id
  number: number
  /** The set attribute numbers, ascending. */
  attributes: number[]
  /** 0 means none. */
  parent: number
  sibling: number
  child: number
  propertyTable: number
  shortName: ZString
  /** In stored (descending) order. */
  properties: Property[]
}

export interface ObjectTable {
  address: number
  /** 31 (v1–3) or 63 (v4+) words (§12.2). */
  propertyDefaults: number[]
  /** Index 0 is object 1. */
  objects: ZObject[]
}

// ── Globals (§6.2) ────────────────────────────────────────────────

export interface Global {
  /** `global:<n>`, n = 0..239 (variable 16 + n). */
  id: Id
  number: number
  address: number
  value: number
}

// ── Errors: never thrown past the core ─────────────────────────────

export interface ParseError {
  code:
    | 'truncated'
    | 'bad-header'
    | 'unsupported-version'
    | 'blorb-unsupported'
    | 'bad-address'
    | 'bad-object'
    | 'bad-property'
    | 'bad-dictionary'
    | 'bad-text'
    | 'checksum'
  message: string
  /** A checksum mismatch is a warning; the rest stop the table they're in. */
  severity: 'error' | 'warning'
  address?: number
}

export interface ParseOptions {
  /** Called as each stage finishes. */
  onProgress?: (stage: string, done: number) => void
}
