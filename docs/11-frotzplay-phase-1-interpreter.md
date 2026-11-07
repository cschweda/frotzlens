# frotzplay — Phase 1: The Interpreter (`@frotzinc/zmachine`)

**Document 11 · frotzplay Phase 1** (design: [`frotzplay-design.md`](frotzplay-design.md) §8.1, §9)
**Status:** done 2026-11-07. Approved with all six items in §10; what was built is in §11.
**Deliverable:** `@frotzinc/zmachine` runs every v3/4/5/8 opcode from decoded `zcode` instructions, with the §8 screen model, suspendable input, ZVM-compatible random and hooks; a Node runner prints normalized transcripts; every sample's walkthrough transcript equals seeded ZVM's.

> **Exit criteria:** `pnpm -r test` green, including opcode tests for every opcode per version and every item in the kickoff's rule 6; every walkthrough in `samples/walkthroughs/` gives the same normalized transcript as `runReplay` with the same seed; no `eval`/`new Function` anywhere in the package (a test greps for them); no DOM types in the package's `tsconfig` (`lib: ["ES2023"]`).

---

## 1. Packages

| Package | Licence | What |
|---|---|---|
| `packages/zmachine` (`@frotzinc/zmachine`) | MIT | The interpreter. Depends on `@frotzinc/zcode` only. Runs in Node, a worker, or the main thread. |
| `packages/zmachine-oracle` | GPL-3.0-or-later, `"private": true`, never published | **Test-only.** The ZVM harness, vendored from frotzsmith (`replayCore`, `ZmachineEngine`, `glk`, `headless-glkote`, `headless-dialog`, `normalizeTurnOutput`, `parseScript`, `StoryEngine`) at a named commit, with `ifvms` 1.1.6 and `glkote-term` 0.4.4 (both MIT) as its dependencies. `zmachine`'s differential tests import it as a dev dependency. |

**Why a separate oracle package, not the sibling checkout.** CI checks out only this repo, so `../frotzsmith` isn't there. Vendoring into `zmachine/test/` would put GPL files inside an MIT package's directory. A private GPL workspace package keeps the line clean: it is an app-side, test-only dependency, never bundled, never published. Noted in `LICENSING.md`.

## 2. Top-level types

```ts
/** What run() stopped for. */
type StopReason =
  | { kind: 'input-line'; maxLength: number; timeout?: Timeout; preloaded: string }
  | { kind: 'input-char'; timeout?: Timeout }
  | { kind: 'budget' }                                // instruction budget spent; call run() again
  | { kind: 'quit' }
  | { kind: 'save' | 'restore'; }                     // host supplies bytes or cancels (Phase 2 fills these in)
  | { kind: 'fault'; fault: Fault }

interface Timeout { tenths: number; routine: number }  // @aread/@read_char time and interrupt routine (packed)

interface Fault { code: 'illegal-opcode' | 'bad-address' | 'stack-underflow' | 'stack-overflow' | 'bad-variable' | 'write-to-static' | 'division-by-zero' | 'bad-object' | 'bad-story' | 'bad-save'; message: string; pc: number }

interface Frame {
  returnPC: number
  locals: number[]          // up to 15, 16-bit
  evalStack: number[]
  storeVariable: number | null   // null: the result is thrown away (call_*n)
  argCount: number          // for @check_arg_count
  /** Set when this frame is an interrupt routine's (a timed-input interrupt). */
  interrupt?: boolean
}

interface RandomState {
  /** 'session': the session's own PRNG (mulberry32), standing in for ZVM's Math.random.
   *  'xorshift': ZVM's xorshift after the game seeds it with @random -n. */
  mode: 'session' | 'xorshift'
  session: number           // mulberry32 state
  xorshift: number          // ZVM's xorshift_seed
}

interface MachineState {
  /** The whole story, dynamic memory live. Static and high memory are never written (§1.1). */
  memory: Uint8Array
  pc: number
  frames: Frame[]           // frames[0] is the main routine's (v6's main routine isn't ours)
  random: RandomState
  screen: ScreenModel
  input: InputState
  streams: StreamState      // 1–4: which are on, stream 3's table stack (nested up to 16, §7.1.2.1.1)
  counters: { instructions: number; turns: number }
  undo: Snapshot[]          // save_undo ring (Phase 2 fills it)
}

interface Snapshot { /** Serialized MachineState minus the story bytes: dynamic memory, frames, pc, random, screen, streams. */ }

interface ScreenModel {
  width: number; height: number            // in characters; the header's screen size
  lower: { runs: StyledRun[]; current: StyledRun[]; bufferMode: boolean }
  upper: { rows: number; grid: Cell[][]; cursor: { row: number; col: number } }
  window: 0 | 1                            // @set_window
  style: TextStyle; colours: { fg: number; bg: number }; font: 1 | 4
  statusLine?: { location: string; score?: number; moves?: number; hours?: number; minutes?: number } // v3, for the announcer
}
interface StyledRun { text: string; style: TextStyle; fg: number; bg: number; font: 1 | 4 }
interface Cell { ch: string; style: TextStyle; fg: number; bg: number }
type TextStyle = number                    // the @set_text_style bits: 1 reverse, 2 bold, 4 italic, 8 fixed

interface Hooks {
  write?(address: number, value: number, size: 1 | 2): void
  call?(routine: number, args: number[], frame: Frame): void
  return?(value: number, frame: Frame): void
  branch?(at: number, taken: boolean): void
  print?(text: string, window: 0 | 1, stream: number): void
  input?(kind: 'line' | 'char', value: string | number): void
}

interface MachineOptions {
  seed: number
  /** Header values the interpreter writes (§11). Tests pin them to what ZVM writes (§5). */
  header?: { interpreterNumber?: number; interpreterVersion?: number; standard?: [number, number]; screen?: { width: number; height: number } }
  hooks?: Hooks
}

class Machine {
  static create(story: Uint8Array, options: MachineOptions): Machine | { fault: Fault }  // never throws
  readonly state: MachineState
  run(budget: number): StopReason           // steps until a stop
  step(): StopReason | null                 // one instruction (frotztrace will use it)
  resume(input: { line: string } | { char: number } | { timeout: true }): void
  snapshot(): Snapshot; restoreSnapshot(s: Snapshot): void   // Phase 2 builds Quetzal and undo on these
  flushText(): string                       // the Node runner: lower window since last call, as normalizeTurnOutput expects
}
```

Hosts (Phase 3 on): `runCooperative(machine, { budget, yield })` drives `run()` on the main thread, yielding between budgets; `@frotzinc/zmachine/worker` hosts a `Machine` behind `@frotzinc/worker-rpc`.

## 3. How it uses `zcode`

- **Memory is one `Uint8Array`**, a copy of the story; writes go into it in place, only below the static-memory base (`write-to-static` fault otherwise, §1.1.2). The decoder reads it through `new Bytes(memory)`, so it sees live memory.
- **Decoded instructions are cached by address**, for addresses at or above the static base only (code there can't change). Code in dynamic memory, which is legal but rare, is decoded every time.
- **Text: one addition to `zcode` (needs approval).** zcode's `decodeZchars` returns display text: unknown codes become `?`, strings are capped at 65,536 characters and the whole story has a text budget. That's right for an inspector and wrong for an interpreter: output stream 3 writes ZSCII into memory, and nothing may be cut. Proposal: add `decodeZscii(ctx, zchars): number[]` to `zcode/text.ts` (the same shift and abbreviation rules, returning ZSCII codes, no caps), and make `decodeZchars` a wrapper over it, so the family still has one text decoder. Additive; `zcode` minor version. The interpreter ignores `Instruction.text.text` and decodes from `text.address` itself.
- **Not in zcode's opcode table:** `@buffer_screen` (EXT 29, new in Standard 1.1). Inform 6 never emits it; add it to the table and implement as "accepted, no effect" for completeness.

## 4. Random (corrects the design doc, which assumed a seed could simply start ZVM's xorshift)

ZVM resets its xorshift seed to 0 on start, restart and restore (`update_header` in `zvm/io.js`), and seed 0 means `Math.random()`. So:

- `session` mode (start, restart, restore, and after `@random 0`): `1 + ((r() * range) | 0)`, where `r` is a mulberry32 stream from the session seed: ZVM's own formula, with a seeded `r` instead of `Math.random`.
- `@random -n`: switch to `xorshift`, seed `n` (negative, as ZVM stores it); then ZVM's exact sequence, signed shifts included (`s ^= s << 13; s ^= s >> 17; s ^= s << 5`, result `1 + ((s & 0x7FFF) % range)`). MIT, attributed in a comment.
- **The oracle** replaces `Math.random` with the same mulberry32 stream for the duration of a run, so ZVM and frotzplay draw identical numbers in both modes.

The design doc's §8.1 Random paragraph is updated to this when the phase lands.

## 5. Header (§11)

ZVM sets no interpreter number or version and reports an 80 × 25 screen (headless GlkOte). Rather than guess, the oracle test boots each story in ZVM, reads back the header bytes ZVM wrote (0x01 flags, 0x1E–0x1F interpreter, 0x20–0x27 screen, 0x32–0x33 standard revision), and asserts frotzplay writes the same under the test pins. Players get Standard 1.1 values (interpreter number 6, our version letter, standard 1.1, the real window size), set by the host.

## 6. The Standard, section by section

| § | Topic | Phase 1 |
|---|---|---|
| 1 | Memory map | ✓ (writes checked against the static base) |
| 2 | Numbers, arithmetic | ✓ (16-bit signed/unsigned, division and remainder toward zero, divide-by-zero is a fault) |
| 3 | Text | ✓ via `zcode` + `decodeZscii`; custom alphabets, Unicode table |
| 4 | Instructions | `zcode`'s decoder |
| 5 | Routines | ✓ (v3/4 local initial values, v5+ zeroed; packed addresses by version, v8 ×8) |
| 6 | Stack, variables, calls | ✓ (variable 0 in place for `@load`/`@store`/`@pull`/`@inc`/`@dec`; `@catch`/`@throw`) |
| 7 | Output streams 1–4 | ✓ (3 nests to 16 deep; 4 echoes input to the command script) |
| 8 | Screen model | ✓ (lower/upper windows, split/erase/cursor, styles, colours, buffer mode, v3 status line) |
| 9 | Sound | `@sound_effect` 1 and 2 (beeps) as an event; others ignored. Out of scope otherwise. |
| 10 | Input | ✓ (`@sread`/`@aread` buffer layouts by version, the v5 zero-length buffer case, terminators, `@read_char`, timed input and interrupt routines) |
| 11 | Header | ✓ (flags negotiation on start, what `@restart` preserves: transcript and fixed-pitch bits, §11.1) |
| 12 | Objects | ✓ (v3 and v4+ layouts, property sizes, `get_prop_len 0`) |
| 13 | Dictionary, lexical analysis | ✓ (`@tokenise` with a custom dictionary and the skip flag; `@encode_text`) |
| 14–15 | Opcodes | all, per version (below) |
| 16 | Font 3 | not drawn; `@set_font 3` answers "unavailable" (0) |
| Quetzal | Save/restore | Phase 2 |

**Opcodes per version** (from `zcode`'s table, distinct opcodes):

| | 0OP | 1OP | 2OP | VAR | EXT | Total |
|---|---|---|---|---|---|---|
| v3 | 14 | 15 | 24 | 15 | 0 | **68** |
| v4 | 13 | 16 | 25 | 24 | 0 | **78** |
| v5 / v8 | 12 | 16 | 28 | 32 | 10 (+ `buffer_screen`) | **98 (+1)** |

## 7. Walkthroughs and fixtures

- `samples/walkthroughs/<name>.txt` in `parseScript` format, one per sample: every room and verb the game has, or to the end. Written by playing each in ZVM; each walkthrough states its seed.
- `scripts/build-samples.mjs` gains v4 builds of `puny-dark-cellar` and `puny-locked-chest` (PunyInform supports v4).
- Timed input (`puny-timed-candle` uses daemons, not real time) needs a purpose-built fixture: a small `timed.inf` using `@aread` with a timeout, checked by opcode tests and recorded timer events, not by the oracle (which runs no timers).

## 8. The Node runner

`packages/zmachine/bin/run.mjs`: `node run.mjs story.z5 script.txt [--seed N]` prints the normalized transcript, turn by turn, the same shape `runReplay` returns, so the two diff directly. It is also what the differential test calls.

## 9. Tests

- **Opcodes:** a tiny assembler in `zmachine/test/asm.ts` builds minimal story files around a few instructions; one test file per opcode family; every rule-6 item has its own named test, citing the Standard section.
- **Differential:** every walkthrough × every version the sample is built for, frotzplay vs the oracle, same seed; a failing turn prints both outputs and the first differing line.
- **Header:** as §5.
- **Random:** frotzplay's sequence equals ZVM's for `@random` with positive, zero and negative arguments.
- **Hygiene:** no `eval`/`new Function`/`Function(` in `src/`; `create()` on truncated, corrupt and v6 stories returns a fault, never throws.

## 10. To approve

1. `packages/zmachine-oracle` as a private, GPL, test-only workspace package (§1).
2. The types in §2.
3. Adding `decodeZscii` to `zcode`, and `buffer_screen` to its opcode table (§3).
4. The random design in §4, replacing the design doc's.
5. Pinning the header to what ZVM writes, read back from ZVM by the test (§5).
6. v4 builds of two PunyInform samples, and a purpose-built timed-input fixture (§7).

## 11. Done

- **The exit criteria hold.** `pnpm -r test` green (zmachine: 210 tests). Every sample, every version built (v3, v4, v5, v8: 36 story files), played through with its walkthrough under two seeds, gives the same normalized transcript as ZVM turn by turn; the long games (*Architect Legacy*, *Mingus I* and *II*) reach their endings. The header bytes an interpreter sets match ZVM's on every sample. No `eval` in `src/`; the build's `lib` is `ES2023` only.
- **Every opcode of every version has run**, checked by a coverage test over the opcode tests and the walkthroughs. Every rule-6 item has a named opcode test citing the Standard.
- **Walkthroughs** weren't written from scratch: frotzsmith already had one for every sample game (its Solutions), so they are copied into `samples/walkthroughs/` with their commit.
- **Timed input** is tested with `test/fixtures/timed.inf`, compiled by the test with `@frotzinc/inform6-wasm` (not a sample: it's a test of a mechanism). Command scripts gained two non-typed commands: `[timeout]` (the timer fired: the recorded timer event of design §6) and `[key x]` (a key press for `@read_char`).
- **Header profiles.** `header.profile: 'zvm'` writes what ZVM writes (for the tests); the default, `'standard'`, writes what frotzplay is (Standard 1.1, timed input, interpreter number 6).
- **Found on the way:** ZVM runs inside the story buffer it's given (its dynamic memory *is* that buffer), so the oracle is always handed a copy; the interpreter keeps its own copy of the original too. And a turn is normalized with its command echo in place, then the echo dropped, as a screen and frotzsmith's transcripts do, so a centred title keeps its leading spaces.
- **Not yet:** save and restore to files (Phase 2: Quetzal) fail as the Standard allows; `save_undo`/`restore_undo` work.
