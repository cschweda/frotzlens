# frotztrace — Kickoff Prompt

## Before you paste (setup checklist for Chris)

frotztrace is built **inside the existing `frotzlens` monorepo**, beside frotzlens and frotzplay. Revised 8 November 2026 (design Draft 2): the interpreter Draft 1 planned to build already exists as `@frotzinc/zmachine`, made for frotzplay. Before starting:

1. ~~Finish or park Frotzlens Phase 6.~~ Done (the decompiler's Source view shipped in frotzlens 0.3.0).
2. **Start from the `frotztrace` branch** in the `frotzlens` repo (where these documents landed), or branch from it, one branch per phase. Nothing goes to `main` without your say.
3. ~~Have Frotzsmith cloned as a sibling.~~ Not needed: the ZVM oracle is vendored in `packages/zmachine-oracle`.
4. **Start Claude Code in the `frotzlens` directory.**
5. **`gh` logged in; npm 2FA ready.** Phase 0 publishes `@frotzinc/zcode-ui` and the `frotztrace` placeholder; Phase 1 and Phase 5 publish minor versions of `@frotzinc/zmachine`; Phase 5 publishes `frotztrace` 0.1.0.
6. **Netlify:** Phase 4 needs a third site on the monorepo with base `apps/trace`; you connect it. Production deploys cost credits (15 each) and Deploy Previews are free, so every phase is a pull request checked on its preview, merged only when you say so.
7. ~~Two licensing questions (Praxix and Czech).~~ Settled by frotzplay (`LICENSING.md`).

Then paste everything below the line into the session.

---

You are the lead engineer on **frotztrace**, a debugger for Z-machine story files, the fourth frotz, Inc. product after frotzsmith (the IDE), frotzlens (the inspector) and frotzplay (the player). I'm Chris Schweda (GitHub `cschweda`). You write the code, I review and direct. Work in phases, stop at each checkpoint for my review, and ask before making any architectural decision not settled below. The full design is in `docs/frotztrace-design.md`; this prompt is its imperative form.

## What frotztrace is

Open a story file (plus, optionally, its `gameinfo.dbg` and its `.inf` source) and the game runs under observation: every view Frotzlens shows statically — Objects, Globals, Memory, Routines, Map — is live, with what changed since the last stop lit in amber. A call stack with named locals. Breakpoints on addresses, routines, source lines, Inform actions, printed text, and property/attribute writes. Watches. A call/write/print trace. Step into/over/out, step by source line, run to the next input, run to a turn, and **step backwards**, by snapshot and deterministic replay. With symbols and source it is a source-level Inform 6 debugger; without them it is a bytecode debugger for any v3/4/5/8 story. Nothing is uploaded.

**Not in v1:** Frotzsmith integration (designed for; the components are shared so it's wiring later), Glulx, version 6, sound, replacing Parchment in Frotzlens's Play view, an interactive terminal REPL.

## Git and Netlify (standing rule)

**Never push to `main` and never merge a pull request into `main` unless I say so in so many words.** Each phase is a branch and a pull request; Netlify builds a free Deploy Preview of it, and that is where I check the work. A merge to `main` is a production deploy and costs Netlify credits (15 per site; a change to `zmachine` deploys frotzplay too), so when one comes up, say so before doing anything. No AI co-author trailers in commit messages.

## What already exists (read it before you plan)

This repo is the frotzlens monorepo. Reuse, don't rewrite:

- **`packages/zmachine`** (`@frotzinc/zmachine` 0.1.1, on npm, MIT): **the interpreter is already built**, by frotzplay (docs 11 and 12). `Machine.create(story, { seed, hooks, header, undoDepth })`; `step()` (one instruction, returns a `StopReason` or null); `run(budget)`; `resume(input)`; public plain-data `state` (`memory`, `pc`, `frames`, `random`, `screen`, `input`, `streams`, `counters`, `undo`); `snapshot()` and `Machine.fromSnapshot()`; `Hooks` on `write`, `call`, `return`, `branch`, `print`, `input`; Quetzal (`readQuetzal`, `writeQuetzal`); `play()`; the `zmachine-run` script runner. Versions 3, 4, 5, 8. Its tests: opcodes (with a test assembler, `test/asm.ts`), walkthroughs, the ZVM differential, Czech and Praxix conformance, saves, timed input, random. **frotztrace adds a `Debugger` to this package. It does not write another interpreter.**
- **`packages/zmachine-oracle`** (private, GPL, test-only): frotzsmith's headless ZVM `runReplay`, vendored. The oracle for every differential test.
- **`packages/player`** (`@frotzinc/player`, MIT): the accessible player as Vue components (`ZPlayer`, `ZUpperWindow`, `ZRuns`, `ZTranscript`, `ZCommandLine`, `ZStatusBar`, …) and `useMachine`, under the contract in `docs/accessibility.md`. frotztrace's Screen pane is built from these.
- **`apps/play`** (frotzplay): the app on those two packages, and the model for `apps/trace`'s `netlify.toml`, including its `ignore` rule.
- **`packages/zcode`** (`@frotzinc/zcode`): `decode.ts` turns bytes at an address into a typed `Instruction` for every opcode form; `objects.ts`, `dictionary.ts`, `globals.ts`, `memory.ts`, `header.ts` give the tables; `debug.ts` reads `gameinfo.dbg` into `Symbols`; `fingerprint.ts` identifies the compiler, library and veneer without symbols; `rooms.ts` builds the `RoomGraph`. **One decoder in the family**: if the debugger needs something from the decoder, it goes into `zcode`.
- **`apps/web`** (frotzlens): the shell (`AppNav`, `SearchPalette`, `ViewHeader`, …), the views (`ObjectTree`, `RoutinesView`, `MemoryView`, `GlobalsView`, `MapView`, `SymbolsView`), `RefLink`, the composables, the worker wiring with `@frotzinc/worker-rpc`, the Playwright + axe tests, `netlify.toml` with CSP. frotztrace's UI is this, with a running machine behind it.
- **`packages/nuxt-base`**: the family look as a Nuxt layer. All apps extend it. Do not add colors or fonts anywhere else.
- **`packages/inform6-wasm`** and `scripts/build-samples.mjs`: how fixtures are compiled (`Serial "000000"` for reproducibility; the sample list is in `samples/README.md`). frotztrace's fixtures are the same stories.
- `docs/00-master-design.md` records frotzlens's decisions; `docs/frotzplay-design.md` and docs 10–16 record frotzplay's. They stand.

## Licensing (settled)

Apps GPL-3.0-or-later, libraries MIT; dependencies point apps → libraries; no library bundles GPL code. Existing: `@frotzinc/zmachine` MIT (the `Debugger` goes in it), `@frotzinc/player` MIT, `@frotzinc/zmachine-oracle` GPL, private and test-only. New: `@frotzinc/zcode-ui` MIT (Chris's own code, relicensed on extraction as in frotzlens Phase 0), `apps/trace` GPL, `frotztrace` CLI GPL. The interpreter is a clean-room implementation from the *Z-Machine Standards Document 1.1* (ZVM's xorshift `@random` excepted, copied with attribution). `LICENSING.md` gets the new packages.

## Stack (settled — do not revisit)

- Everything the monorepo already uses: Nuxt 4.6.x, Nuxt UI 4.12, TypeScript strict, pnpm, Vitest, Playwright, the same ESLint/Prettier/CI.
- **Changed package:**
  - `packages/zmachine` — `@frotzinc/zmachine`: gains the `Debugger`, additively (see the rules below). Still pure TypeScript, zero DOM, zero Vue, **zero `eval`/`Function`**.
- **New packages:**
  - `packages/zcode-ui` — `@frotzinc/zcode-ui`: Vue components and composables extracted from `apps/web`, with Vue and Nuxt UI as peer dependencies. Each view component takes an optional **live** prop (a `MachineView` from `zmachine`: current PC, current frame, the set of addresses/objects/globals changed since the last stop) and lights what changed when it's present.
  - `packages/trace-cli` — `frotztrace`: headless runs with scripts, traces, breakpoints, watches, Quetzal in/out. Exit codes for CI.
  - `apps/trace` — the Nuxt app, static, Netlify, at `frotztrace.frotzinc.com`. Extends `@frotzinc/nuxt-base`. The machine runs in a worker via `@frotzinc/worker-rpc` with a per-`run` instruction budget. **No `/play/` sandbox and no `'unsafe-eval'`**: there is no JIT here, which is the point.
- **Story, `.dbg` and `.inf` files** arrive by drop, file picker, or `postMessage` from an opener (Frotzlens's "Debug this story" button, Phase 5), using the ready/handshake pattern Frotzlens's Play iframe already uses.

## Architecture rules

1. **The UI is Frotzlens's UI.** Same shell, same nav, same views, same tokens, same keyboard palette, same About menu and footer. All Frotz, Inc. apps share one look and feel; a user moving between Frotzsmith, Frotzlens and frotztrace must see no seam. Anything visual that isn't already in `nuxt-base` or `zcode-ui` goes into one of them, never into `apps/trace` alone. Dark by default.
2. **`zmachine` decodes with `zcode`,** as it already does. One decoder in the family.
2a. **`zmachine` changes are additive.** frotzplay and frotzsmith use the published package, and frotzplay autosaves `MachineSnapshot`s in its players' browsers. New exports and optional options or hooks only; no changed signatures or meanings; `MachineSnapshot` version 1 always restores; frotzplay's unit, contract and export suites stay green; a hook nobody attached costs nothing measurable. Each change is a minor release with a changelog entry.
3. **All machine state is serializable.** Dynamic memory, stack frames, PC, random state, screen model, input state, counters. That's what makes snapshots, Quetzal, undo and rewind one mechanism.
4. **Deterministic by default.** Seeded random (`@random` with the seed in the state); same story + script + seed → identical trace. Rewind is "restore nearest snapshot, replay to instruction N," and is only possible because of this.
5. **Hooks, not special cases.** Every memory write and every call/return/branch/print/input passes through one hook. Watchpoints, the trace, the changed-set for the UI, and the Inform layer all attach there.
6. **Byte-accurate against the Standard,** cited in comments where it bites: `@je` with one operand, `@inc_chk`/`@dec_chk` signedness, `@art_shift` vs `@log_shift`, indirect variables via `@load`/`@store`/`@pull`, `@aread` text-buffer conventions by version, `@print_table`, `@tokenise` with a custom dictionary, `@encode_text`, `@check_arg_count`, `@catch`/`@throw`, header flags on `@restart`, timed input (`@aread` time/routine), the v3 status line.
7. **Differential testing against ZVM** stays the gate for the interpreter: `zmachine`'s existing differential, walkthrough and conformance tests run on every change.
8. **Graceful on bad input.** A corrupt story or an illegal instruction halts the machine with a `fault` the UI shows; nothing throws past the package boundary.
9. **No Infocom branding** anywhere. Fixtures are the existing samples.

## The interpreter, as it is

Read `packages/zmachine/src/types.ts` and `machine.ts` before planning; don't redesign them. The debugger owns its own loop over `step()`, so it can stop between any two instructions without the interpreter knowing about breakpoints; it creates the machine, so its `Hooks` are installed from the start and again after every `fromSnapshot`. Rewind is `snapshot()` / `fromSnapshot()` plus a log of every `resume()` input, replayed to an instruction count (`counters.instructions`). Anything the debugger needs that the interpreter doesn't give (a turn-start signal, object-table access through the machine), propose it as an additive change in Phase 1's plan; don't assume it.

## The debugger core, concretely

`Debugger` wraps a machine: `run`, `pause`, `stepInstruction`, `stepOver`, `stepOut`, `stepLine`, `runToInput`, `runToTurn(n)`, `continueTo(addr)`, `stepBack(n = 1)`, `goToInstruction(n)`. Breakpoints `{ kind: 'address'|'routine'|'line'|'action'|'text'|'write'|'attr', target, condition?, enabled, hits }`. Watches as expressions. An expression language over globals, locals, `obj.prop`, `obj has attr`, `parent(obj)`, arithmetic, comparisons, `&&`/`||`, with no side effects and no routine calls. A ring-buffer trace of `{ kind: 'call'|'return'|'write'|'print'|'input'|'branch', … }`. Snapshots at every turn boundary and every N instructions (N tuned on the big fixtures). An Inform layer: with `Symbols`, name frames and locals, map PC ↔ source line, decode `action`/`actor`/`noun`/`second` by name; with fingerprinting only, locate the library's `action` global by shape.

## UI (apps/trace)

Frotzlens's shell and nav. Two columns on desktop, stacked on phones: **Screen** (the game, drawn by `@frotzinc/player`'s components from the debugger's machine, with the command line) and the **views**: Stack, Source, Routines (live), Objects (live), Globals (live), Memory (live), Breakpoints, Watches, Trace, Timeline, Map (live). A toolbar under the header (Run, Pause, Step Into, Step Over, Step Out, **Step Back**, Run to Input, Restart; turn and instruction counters; the seed) and a status strip ("stopped at `ScoreTimer+12` · turn 7 · breakpoint action:Take"). Amber marks the PC, the current frame, and everything changed since the last stop. Keyboard: F5/F6/F10/F11/Shift+F11/**Shift+F10 (back)**/F8/F9, Ctrl/Cmd+K, with a shortcuts dialog. First load: the Frotzlens drop zone with three slots (story · debug file · source) and a sample button that loads Dark Cellar with its `.dbg` and `.inf`.

Accessibility as Frotzlens: AA, keyboard-operable everything, the Screen's lower window as `aria-live="polite"`, the toolbar as `role="toolbar"`, text equivalents for every highlight, axe in Playwright, NVDA before release.

## Fixtures and tests

- Stories: the existing `samples/` (built by `scripts/build-samples.mjs`), each with its `.dbg`, and their `.inf` sources for the Source view. Scripts: the ones `zmachine`'s walkthrough tests already use.
- Existing gates, run on every change to `zmachine` or `player`: opcode, walkthrough, differential (`zmachine-oracle`), conformance (Czech, Praxix), saves, timed input, random; frotzplay's unit, contract (Playwright, three browsers) and export suites.
- New: debugger unit tests (every breakpoint kind, step over/out, conditions, watches, the trace) on hand-assembled routines (`test/asm.ts`) and on the samples.
- Determinism: same story + script + seed twice → identical trace. Rewind: step back to instruction N → `snapshot()` equal to the first pass at N.
- Snapshot compatibility: a `MachineSnapshot` written by `zmachine` 0.1.x restores after every change.
- App: Playwright loads the sample, sets `action:Take`, runs, asserts the stop, steps back, asserts state; axe on every view.

## Phases

Write the phase doc in `docs/` (continuing the numbering: the next is 17) before the code of each phase. Each phase is a branch and a pull request, checked on its Deploy Preview; I merge.

**Phase 0 — `@frotzinc/zcode-ui`.** Extract from `apps/web`: `RefLink`, `ObjectTree`, the disassembly renderer in `RoutinesView`, `MemoryView`'s hex pane, `GlobalsView`, `MapView`, `SearchPalette`, `ViewHeader`, `CopyText`, `StatTile`, the shell (parameterized by product), and the composables they need. Add the optional `live` prop (typed `MachineView`, which Phase 3 adds to `zmachine`; until then a placeholder type in `zcode-ui`, inert when absent). Frotzlens imports the package; its Playwright and axe suite must pass unchanged. Publish `zcode-ui` 0.1.0 and the `frotztrace` npm placeholder (GPL, correct scope, no `infocom` keyword). Show me the diff before pushing. Deliverable: Frotzlens green on `zcode-ui`; two packages on npm.

**Phase 1 — The debugger's foundations.** `Debugger` in `zmachine`: the stepping loop over `step()`; run, pause, step into/over/out, run to input, run to turn; address and routine breakpoints; the trace ring buffer from the hooks; the input log. `packages/trace-cli`: `frotztrace game.z5 --script walk.txt` plays the script (as `zmachine-run` does), with `--trace calls` and `--break Routine`. A minor release of `zmachine`. Deliverable: the CLI stops on a routine in a sample and prints its stack; every existing `zmachine` and frotzplay suite green.

**Phase 2 — Time.** Snapshots at turn boundaries and every N instructions, deterministic replay, `stepBack`/`goToInstruction`, the Timeline's data. Deliverable: the determinism, rewind and snapshot-compatibility tests pass.

**Phase 3 — The Inform layer.** Names, line mapping, `action`/`actor`/`noun`/`second`; line, action, text, write and attribute breakpoints; the expression language, conditions and watches; `MachineView` for the UI. CLI gains `--break action:Take`, `--watch`, `--seed`, `--save-at`, `--quetzal`. Deliverable: `frotztrace dark-cellar.z5 --script walk.txt --break action:Take` stops at the right instruction and prints a named stack.

**Phase 4 — The app.** `apps/trace` on `nuxt-base`, `zcode-ui` and `player`: drop zone, worker wiring, the Screen pane (first, propose how `player` draws a machine the debugger owns, additively; I approve), toolbar, status strip, Stack, Routines/Objects/Globals/Memory live, Breakpoints, Trace, hash routes. The site already exists (`apps/trace`: a placeholder page, `netlify.toml` modelled on `apps/play`'s, `.nvmrc`, the social card and icons): replace the page, and add the packages it now uses to `netlify.toml`'s `ignore` include-list. Deliverable: play the sample in the browser, hit a breakpoint, inspect, continue, on the Deploy Preview.

**Phase 5 — Source, time, polish.** Source view with gutter breakpoints, Watches, Timeline with step-back and the scrubber, Map live, shortcuts dialog, accessibility audit, light-mode pass, README and docs. Frotzlens gets a "Debug this story" button that opens frotztrace and hands over the file by `postMessage`. Publish `@frotzinc/zmachine` (minor) and `frotztrace` 0.1.0. Deliverable: frotztrace 0.1.0 at frotztrace.frotzinc.com, after I merge.

## Before you write any code

1. Run `git branch --show-current`; if it isn't `frotztrace` or a branch from it, stop and tell me. Confirm the pinned Nuxt/Nuxt UI versions match `apps/web` and `apps/play`.
2. Read `docs/frotztrace-design.md` (Draft 2), `docs/00-master-design.md`, `docs/frotzplay-design.md`, docs 11 and 12 (the interpreter's phases), `packages/zmachine/src/types.ts` and `machine.ts`, `packages/player/src/composables/useMachine.ts`, `packages/zcode/src/decode.ts`, and `apps/web/app/components/`. Summarize in ten lines what you'll reuse from each.
3. List, file by file, what Phase 0 moves out of `apps/web` into `zcode-ui`, what stays, and how the `live` prop is typed. I approve before anything moves.
4. Propose the `Debugger`'s public types (`Debugger`, `Breakpoint`, `Watch`, `TraceEvent`, `MachineView`) and any additive changes to `Machine` at the start of Phase 1, not before Phase 0.

Ask me anything ambiguous. Don't guess on architecture; do guess on naming and layout and tell me what you picked.
