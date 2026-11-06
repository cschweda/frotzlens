# Frotzlens — Phase 2: Disassembler

**Document 03 · Phase 2**
**Deliverable:** `@frotzinc/zcode` decodes every routine, string and Inform grammar table, and indexes cross-references. The `frotzlens` CLI prints Ztools' `txd` disassembly and the rest of `infodump` (`-m`, `-g`, full `-f`).

> **Exit criterion — met:** `frotzlens --routine <addr> dark-cellar.z5` prints exactly that routine's block from `txd dark-cellar.z5`. Pinned for all 405 routines, in both modes, and through the real CLI binary (`packages/zcode/test/txd.test.ts`).

---

## 1. What was built

| | Module | Standard / source |
|---|---|---|
| Opcode table, v3–5 and v8, with txd's names | `opcodes.ts` | §14, §15 |
| Instruction decoding: long, short, variable and extended forms; operand types; store; branch (1- and 2-byte, return-true/false); inline text; `jump` offsets | `decode.ts` | §4, §4.7 |
| Routines: header (locals, v1–4 initial values), validation, end detection | `routines.ts` | §5 |
| The code-area sweep and the string area | `routines.ts`, `strings.ts` | §1.2.3 (alignment) |
| Inform grammar, versions 1, 2 and 3 | `grammar.ts` | Inform Technical Manual §8; Inform 6.42+ (GV3) |
| Cross-references, both ways | `xrefs.ts` | — |
| `txd` and `txd -n` text, `--routine` | `format/txd.ts` | observed |
| `infodump -g`, `-m` | `format/grammar.ts`, `format/map.ts` | observed |

The model gains `code` (`routines`, `main`, `analysisStart`, `end`), `strings`, `grammar` (Inform stories) and `xrefs` (by Id: `from` sites and `to` Ids).

## 2. How it's checked

Byte-for-byte against Ztools, as in Phase 1, and learned from their output, not their source:

- **`txd` and `txd -n`, whole files,** on every fixture and every non-PunyInform sample — 19 stories, v5 and v8, Standard Library and library-free, including the grammar notes ("Action routine for:"). Committed as gzipped golden files (`*.txd.txt.gz`, `*.txd-n.txt.gz`; 2.2 MB for 13.7 MB of text). The diff tool used during development compared 335,341 instruction lines across the samples before the grammar notes were added; all matched.
- **`infodump -g` and `-m`** on the same stories; **`-f`** is now `infodump -f` exactly.
- **Live re-checks:** `INFODUMP=… TXD=… pnpm test` compares every sample (34 stories) with the real binaries.

## 3. Rules learned from txd's output

- Routines are found by a **linear sweep** from the end of the dictionary: the first aligned address that decodes as a routine, then each one after, until one doesn't. A routine must decode completely, use no local beyond its count, and end with a terminating instruction past every forward branch. This finds exactly txd's routines in all 34 samples.
- **Strings** are the area after the code, read in order at aligned addresses to the end of the file (the "unreferenced string" scan of the design is this, as txd does it: no heuristic threshold needed — open question 6 closed).
- **Operand kinds** (`operands.ts`): per opcode and position, whether txd prints a number, a string (`S###`), a dictionary word, an object's name, a variable named by number, a routine, a text style, a stream, or a character. Worked out by tallying how txd rendered every constant operand across the samples, then probing the rest black-box.
- **Dictionary words** for a constant that is a whole number of entries from the first, up to *and including* the entry count — txd's off-by-one decodes whatever follows the dictionary, and so do we.
- **Wrapping** at 79 columns; a routine header's initial values and grammar notes wrap with their lines indented (25 and 8).
- **The header lines:** "high address" is where the second-to-last routine ends; "N bytes of data before code" appears when the gap between the dictionary and the first routine is more than alignment (PunyInform).
- **Shifts:** a space leaves a pending shift in place (`4 0 17` is " L"), found by the live check.

## 4. Inform grammar

Three versions, told apart by trying each layout and keeping the one whose verb pointers chain:

- **GV1** (old Inform; library-free fixture `gv1`): 8-byte lines, a parsing-routine table, a preposition table of 4-byte entries. Token bytes rendered as infodump does (`NOUN`, `TEXT [parse n]`, …).
- **GV2** (the Standard Library): an action word, 3-byte tokens, ENDIT.
- **GV3** (PunyInform, Inform 6.42+): an action word counting its tokens, 2-byte tokens; prepositions by index. **Ztools misreads GV3 as GV1** — infodump stops with "Fatal: game file read error" and txd prints garbage grammar notes (and stops partway on two v3 stories). There is no reference output, so GV3 is rendered as GV2 is, and the PunyInform comparisons leave grammar out.

The table is found at the start of static memory (Standard Library) or by scanning for a pointer table that points just past itself (PunyInform keeps it in dynamic memory). The preposition table sits right before the dictionary; the action table runs from the grammar's end to it.

## 5. Deliberate differences from Ztools

- PunyInform's grammar (above).
- `infodump -m` on a story with an empty property-names table (`minimal`): infodump sizes it as 0x20000 bytes; we print its true size.
- The Phase 1 differences still stand (v3 flags2 masks; raw header bytes and unsafe Unicode-table characters as `?`; dictionary words read as their entry's bytes).

## 6. The CLI

`frotzlens game.z5` now prints the `txd` disassembly — the default the design always had (Phase 1 defaulted to the header while there was no disassembler). `-n`/`--addresses`, `--routine <addr>`, `--no-grammar`, and infodump's `-i -m -a -o -t -g -d -f`.

## 7. Left for later

- **Symbols** (`gameinfo.dbg`) and **Inform fingerprinting** — Phase 5.
- **txd's `-a` (Inform syntax) and `-d` (hex dump)** — not needed by the app; can follow if asked.
- **Versions 6 and 7** — out of scope for v1.
