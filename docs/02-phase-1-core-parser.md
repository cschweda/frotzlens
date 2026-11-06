# Frotzlens — Phase 1: Core Parser

**Document 02 · Phase 1**
**Deliverable:** `@frotzinc/zcode` parses the static, non-code half of a story file — header, memory map, text and abbreviations, dictionary, object table, globals — for versions 3, 4, 5 and 8. The `frotzlens` CLI prints it in `infodump`'s format.

> **Exit criterion:** `npx frotzlens --objects dark-cellar.z5` matches `infodump -o dark-cellar.z5`, and the same holds for the header (`-i`), abbreviations (`-a`), object tree (`-t`) and dictionary (`-d`) across every fixture, except for differences that are deliberate and documented in the test.

---

## 1. Scope

**In:** container detection (bare story vs Blorb — detection and an error only; unwrapping is Phase 5), header, memory map, ZSCII text with abbreviations and the Unicode translation table, dictionary, object table, globals (values only; referrers need Phase 2's disassembly), the error policy, fixtures, golden `infodump` output, the CLI's `--header`, `--abbreviations`, `--objects`, `--tree`, `--dict`, `--json`.

**Out (later phases):** routines, strings beyond the object short names and abbreviations, grammar, cross-references (Phase 2); Blorb unwrap, `gameinfo.dbg` symbols, Inform fingerprinting beyond the header's compiler version (Phase 5).

**Versions:** 3, 4, 5, 8 are parsed. 1, 2, 6, 7 yield a model with the header parsed and an `unsupported-version` error; nothing else is attempted.

## 2. Standard 1.1 sections implemented

| § | What | Where |
|---|---|---|
| 1 | Memory map: dynamic/static/high; §1.2.3 packed addresses (×2 v1–3, ×4 v4–5, ×8 v8) | `memory.ts`, `address.ts` |
| 2 | Numbers: 16-bit big-endian words, signed interpretation | `bytes.ts` |
| 3 | Text: Z-characters, alphabets A0–A2, shift (v3+ single shifts), abbreviations (§3.3, no nesting), ZSCII escape (§3.4), ZSCII output (§3.8), Unicode translation table (§3.8.5) | `text.ts` |
| 6.2 | Globals: 240 words at the header's global table | `globals.ts` |
| 11 | Header, incl. the header extension table (§11.1.7: Unicode table address) | `header.ts` |
| 12 | Objects: property defaults, entries (9 bytes v1–3 / 14 bytes v4+), attributes (32/48), short name, property lists with the v1–3 vs v4+ size-byte encodings (§12.4) | `objects.ts` |
| 13 | Dictionary: separators, entry length, count, 4-byte (v1–3) / 6-byte (v4+) encoded words | `dictionary.ts` |

Inform's compiler version (header `0x3C–0x3F`, ASCII, e.g. `6.44`) is read too. The Standard treats `$38–$3F` as reserved; the comment says so. Every non-obvious rule above carries its section number in a comment.

## 3. The model (proposed — for review before code)

```ts
// ── The whole file ────────────────────────────────────────────────
export interface StoryFile {
  bytes: Uint8Array            // the story itself (unwrapped, once Blorb lands)
  container: 'bare' | 'blorb'
  header: Header
  memory: MemoryMap
  abbreviations: ZString[]     // 96 entries (v2+), by index
  dictionary: Dictionary
  objects: ObjectTable
  globals: Global[]            // 240
  // Phase 2:  routines: Routine[]; strings: ZString[]; grammar?: GrammarTable; xrefs: XrefIndex
  // Phase 5:  symbols?: Symbols; fingerprint?: Fingerprint; rooms?: RoomGraph
  errors: ParseError[]
}

export type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

// ── Stable IDs (the app routes on these: #object/47, #dict/1ca3) ─────
export type Id =
  | `object:${number}` | `dict:${string}` | `global:${number}`
  | `abbrev:${number}` | `string:${string}` | `routine:${string}` | `segment:${string}`
// Addresses in IDs are lowercase hex byte addresses, no prefix: `routine:1b22`.

// ── Header (§11) ───────────────────────────────────────────────────
export interface Header {
  version: Version
  release: number
  serial: string               // 6 ASCII characters
  checksum: number             // as stored; `checksumOk` is computed (§11.1.6, file length × scale)
  checksumOk: boolean
  fileLength: number           // in bytes (stored value × 2/4/8)
  flags1: number; flags2: number
  highMemory: number; initialPc: number
  dictionary: number; objects: number; globals: number; staticMemory: number
  abbreviations: number
  routinesOffset?: number; stringsOffset?: number          // v6–7 only; never set in v1
  terminatingChars?: number; alphabetTable?: number         // v5+
  headerExtension?: { address: number; words: number[]; unicodeTable?: number }
  inform?: { compilerVersion: string }                      // bytes 0x3C–0x3F when they read as d.dd
}

// ── Memory map: what the Overview bar and the Memory view draw ─────
export interface MemoryMap {
  size: number
  regions: Segment[]           // dynamic, static, high (§1.1)
  segments: Segment[]          // header, abbreviation table, object table, property tables,
                               // globals, dictionary, … (routines and strings arrive in Phase 2)
}
export interface Segment {
  id: Id                       // `segment:objects`
  kind: 'header' | 'abbreviations' | 'objects' | 'properties' | 'globals' | 'dictionary'
      | 'dynamic' | 'static' | 'high' | 'unknown'
  start: number; end: number   // [start, end)
  label: string
}

// ── Text (§3) ──────────────────────────────────────────────────────
export interface ZString {
  id: Id                       // `string:<addr>`, or `abbrev:<n>` for abbreviations
  address: number
  length: number               // bytes consumed, through the word with the end bit
  text: string                 // decoded, Unicode
  zchars?: number[]            // kept only when asked (Memory view annotation)
}

// ── Dictionary (§13) ───────────────────────────────────────────────
export interface Dictionary {
  address: number
  separators: string[]
  entryLength: number
  entries: DictEntry[]         // sorted as stored
}
export interface DictEntry {
  id: Id                       // `dict:<addr>`
  index: number; address: number
  word: string                 // decoded (truncated as stored: 6 or 9 Z-chars)
  data: number[]               // the bytes after the encoded word
  inform?: { verb: boolean; noun: boolean; meta: boolean; plural: boolean; preposition: boolean;
             verbNumber?: number }   // when the file is Inform
}

// ── Objects (§12) ──────────────────────────────────────────────────
export interface ObjectTable {
  address: number
  propertyDefaults: number[]   // 31 (v1–3) or 63 (v4+)
  objects: ZObject[]           // index 0 is object 1
}
export interface ZObject {
  id: Id                       // `object:<n>`
  number: number
  attributes: number[]         // the set attribute numbers, ascending
  parent: number; sibling: number; child: number      // 0 = none
  propertyTable: number
  shortName: ZString
  properties: Property[]       // in stored (descending) order
}
export interface Property {
  number: number
  address: number              // of the size byte(s)
  dataAddress: number
  size: number                 // data length in bytes (§12.4.1 / §12.4.2)
  data: Uint8Array
}

// ── Globals (§6.2) ────────────────────────────────────────────────
export interface Global {
  id: Id                       // `global:<n>`, n = 0..239 (variable 16 + n)
  number: number
  address: number
  value: number
}

// ── Errors: never thrown past the core ─────────────────────────────
export interface ParseError {
  code: 'truncated' | 'bad-header' | 'unsupported-version' | 'blorb-unsupported'
      | 'bad-address' | 'bad-object' | 'bad-property' | 'bad-dictionary' | 'bad-text' | 'checksum'
  message: string
  severity: 'error' | 'warning'   // checksum mismatch is a warning; the rest stop that table
  address?: number
}

// ── Entry point ───────────────────────────────────────────────────
export function parseStory(bytes: Uint8Array, opts?: { onProgress?: (stage: string, done: number) => void }): StoryFile
```

Design points in this shape, for review:

1. **Plain data, no classes, no methods.** It crosses a `postMessage` boundary (worker → app) by structured clone, and it serializes to JSON for the CLI. The `Uint8Array`s survive structured clone; `--json` prints them as hex.
2. **Every addressable thing has an `id`** in the routing format from the master design (`object:47`, and byte addresses as lowercase hex). The app never builds IDs itself.
3. **Errors stop one table, not the parse.** A bad object table yields `objects.objects = []` and a `bad-object` error; the header, dictionary and abbreviations still come back. Nothing throws past `parseStory`.
4. **Phase 2 and 5 fields are reserved by name** (commented above) so the shape doesn't change for the app; they're added as optional fields when their phase lands.
5. **Raw where it's cheap, decoded where it matters.** Property `data` stays bytes (Phase 2 decides which are routines or strings); dictionary `data` stays bytes with an optional Inform decoding.

## 4. Package layout

```
packages/zcode/
├── src/
│   ├── index.ts          parseStory, the types
│   ├── types.ts
│   ├── bytes.ts          readers with bounds checks → ParseError, never a throw
│   ├── address.ts        packed-address scaling (§1.2.3)
│   ├── container.ts      bare vs Blorb (FORM…IFRS)
│   ├── header.ts  memory.ts  text.ts  dictionary.ts  objects.ts  globals.ts
│   └── format/           infodump-format text (used by the CLI, and "copy as text" later)
│       ├── header.ts  abbreviations.ts  objects.ts  tree.ts  dictionary.ts
├── test/
│   ├── fixtures/src/     .inf sources (copied from Frotzsmith; Chris's own)
│   ├── fixtures.ts       compiles them with @frotzinc/inform6-wasm at test time (cached per run)
│   ├── golden/           infodump output per fixture + PROVENANCE.md
│   └── *.test.ts
└── package.json          MIT; @frotzinc/inform6-wasm as a devDependency only
```

The text formatters live in the MIT core, not the GPL CLI, so the web app's "copy as text" and any third-party tool get the same output; the CLI is argument parsing and printing.

## 5. Fixtures

Built at test time by `@frotzinc/inform6-wasm`, each with `Serial "000000";` injected before the first line so the output is byte-for-byte deterministic (Inform otherwise stamps the compile date; the checksum then changes too).

| Fixture | Built as |
|---|---|
| `dark-cellar` | v5 (+ `.dbg`), and v3, v4, v8 |
| `puny-dark-cellar` | v5 against PunyInform |
| `locked-chest`, `hermit`, `demo`, `mingus-1`, `architect-legacy` | v5 |
| `grammar`, `list-exits`, `magic-8-ball` | v5 (they compile standalone) |
| `minimal` | v5, `[ Main; @quit; ];`, no library |
| `gv1` | v5, a small game with `Constant Grammar__Version 1;` (used from Phase 2) |
| `corrupt-truncated`, `corrupt-badheader` | generated in the test from `dark-cellar.z5` |

`haunted-house` is excluded (derived from a 1979 commercial game). No ZIL fixtures.

## 6. Golden output from Ztools

Ztools has no license, so nothing of it enters the repo (decision recorded in `00-master-design.md` §11). Instead:

- `scripts/golden.sh <ztools-dir>` (in the repo) builds every fixture, runs `infodump -i`, `-a`, `-o`, `-t`, `-d` on each, and writes `packages/zcode/test/golden/<fixture>.<opt>.txt`. You build `infodump` yourself, from Ztools 7/3.1a (the 2024 modern-C update) at a path outside the repo.
- `test/golden/PROVENANCE.md` records the Ztools version and archive SHA-256, the exact build command, the command per file, and the date.
- Two Ztools quirks the script handles: the Unix makefile omits Ztools' own `getopt.c` (build: `cc -O2 -o infodump infodump.c showhead.c showdict.c showobj.c showverb.c txio.c infinfo.c symbols.c getopt.c`), and `tx_printf` formats into an 80-byte stack buffer, so a long story path overflows it and `infodump` dies silently — the script runs it from the fixture's directory with a bare filename.
- The tests compare our formatter's output with the golden text line by line. Where we differ on purpose (e.g. Unicode output where `infodump` prints `?`), the test says so, with the reason.

## 7. Order of work

1. `packages/zcode` scaffold; types; byte readers and error policy.
2. Header + memory map; fixtures harness; golden script and the first golden files.
3. Text and abbreviations.
4. Objects and the tree; then the dictionary; then globals.
5. Formatters to infodump parity, fixture by fixture.
6. CLI (`packages/cli`): `frotzlens [--header|--abbreviations|--objects|--tree|--dict|--json] file`.
7. Corrupt-file tests; a property-based fuzz pass (random truncations and byte flips of `dark-cellar.z5`: `parseStory` never throws).

**Checkpoint:** the exit criterion above, then review.

---

## 8. As built (2026-11-06)

**Exit criterion met.** `frotzlens --objects dark-cellar.z5` is byte-identical to `infodump -o dark-cellar.z5` (pinned in `packages/cli/test/cli.test.ts`, running the real binary). The same holds for `-i -a -o -t -d` on all 15 fixtures (75 golden files), for combined options (`-io`, `-oti`, `-iaotd`), and for several files in one run. 186 tests in `@frotzinc/zcode`, 18 in the CLI.

**Changes from the plan above:**

- **v3 and v4 fixtures are the PunyInform port.** The Standard Library 6.12 targets v5+ only: v3 runs out of properties and call arguments, v4 lacks `tokenise`, `save_undo` and `check_arg_count`. So the set is `puny-dark-cellar` as v3, v4 and v5, and `dark-cellar` as v5 and v8.
- **`-m` (memory map), `-g` (grammar) and infodump's full `-f` move to Phase 2.** infodump's map labels Inform's grammar, action and identifier tables, which need the grammar decoder. Until then `frotzlens -f` is `-iaotd`, and its help says so.
- **The formatters were written from infodump's output, not its source** (clean-room). What the fixtures never show was observed black-box: one header byte or table patched at a time in a copy of a fixture, and infodump's output recorded. `packages/zcode/test/format.test.ts` pins each case: every flag bit's name, every terminating key's, the custom alphabet layout, header extension lengths 0–6, and when the "Inform Version" line appears.
- **One deliberate difference:** for v3 flags2 bits 5–8, infodump's `Unknown (0x…)` shows the next-lower bit's mask (bit 6 as `0x0020`). We print the bit's own.
- **infodump behaviours worth knowing** (all reproduced): output wraps at 79 columns by breaking at the last space and dropping it, so a property longer than 20 bytes continues at column 0; the dictionary prints as many `[nnnn] word` cells per row as fit in 80 columns, padded to the entry length (which infodump calls "word size"); with flags1 bit 0 set, infodump refuses the file ("wrong game or version"), so that case has no reference output.
- **CI builds before it typechecks**, since the CLI typechecks against `@frotzinc/zcode`'s `dist/`.
