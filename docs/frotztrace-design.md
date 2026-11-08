# frotztrace — Design Document

**Status:** Draft 2, 8 November 2026. Draft 1 (7 November) planned to build a Z-machine interpreter; frotzplay has since built and published one, `@frotzinc/zmachine` 0.1.1, along with `@frotzinc/player`. This draft starts from that code. What changed is listed in §13.
**Author:** Christopher Schweda
**Companion:** `frotztrace-kickoff-prompt.md` (the imperative version, pasted into Claude Code)
**Lives in:** the `frotzlens` monorepo, as `apps/trace` and `packages/trace-cli`, with the debugger core in `packages/zmachine` · **Site:** frotztrace.frotzinc.com · **Family:** frotz, Inc.

---

## 1. What it is, in one paragraph

frotztrace is a debugger for Z-machine story files. You open a story (and, if you have them, its `gameinfo.dbg` and its Inform 6 source), press Run, and the game plays in front of you while every view Frotzlens shows statically — objects, globals, memory, routines — is *live*: the object tree changes as the player moves, globals highlight as they're written, the disassembly shows the program counter, and the call stack shows who called whom with every local's value. You set breakpoints on routines, on object property changes, on actions; you step by instruction, by line, or by turn; and you step *backwards*, because the machine records enough to rewind. With debug symbols and source, it is a source-level debugger for Inform 6. Without them, it is a bytecode debugger for any version 3, 4, 5 or 8 story. Nothing is uploaded.

## 2. Why build it

**Nothing like it exists.** Z-machine interpreters play games; Ztools and Frotzlens inspect dead files. The only debugging an Inform 6 author has ever had is `print` statements and Inform's `-k` debug file read by hand. Inform 7 had Skein and transcripts; Inform 6 has had nothing. Infocom's own developers had a debugger on their PDP-10; no one else ever did.

**The pieces are built, most of them twice over.** Frotzlens proved the views: `@frotzinc/zcode` decodes every instruction into a typed `Instruction`, and its tests match `txd` byte for byte. frotzplay then built the machine a debugger needs: `@frotzinc/zmachine` (0.1.1, on npm) executes one decoded instruction per `step()`, keeps all its state as plain data, snapshots and restores the whole machine, saves Quetzal, keeps an undo ring, draws random numbers from a seed, and calls a hook on every memory write, call, return, branch, print and input. It matches ZVM transcript for transcript on every sample and passes the Czech and Praxix conformance suites. `@frotzinc/player` draws its screen accessibly. What frotztrace adds is the debugger on top of that machine, rewind, the shared views made live, and the app.

**It completes the family.** frotzsmith compiles; frotzlens inspects; frotzplay plays; frotztrace runs under observation. An author who compiles in Frotzsmith should be one click from stepping through their own source. v1 is standalone; the Frotzsmith integration is the designed-for, not-yet-built item at the top of §12.

**It's the kind of thing that gets written up.** "Step through a 1980s text adventure's parser, backwards, in a browser tab" is a sentence people share.

## 3. Scope

### Already built (by frotzplay), and used as is

- **The interpreter**, `@frotzinc/zmachine` (MIT, 0.1.1 on npm): versions 3, 4, 5 and 8; every opcode in Standard 1.1 §14–15 for them; the text screen model (lower window as styled runs, upper window as a grid, the v3 status line); `read` and `read_char` with timed input; Quetzal save and restore; `save_undo`/`restore_undo`; seeded, deterministic random; `snapshot()`/`fromSnapshot()` of the whole machine; hooks on write, call, return, branch, print and input. No sound, no graphics, no v6.
- **The oracle**, `@frotzinc/zmachine-oracle` (GPL, private, test-only): frotzsmith's headless ZVM `runReplay`, vendored. The differential tests run every sample's walkthrough through both.
- **Conformance:** Czech 0.8 in every version and Praxix, compiled at test time, passing and printing exactly what ZVM prints. Their licences are settled (`LICENSING.md`).
- **The player**, `@frotzinc/player` (MIT): Vue components for the game's screen (`ZUpperWindow`, `ZRuns`, `ZTranscript`, `ZCommandLine`, `ZStatusBar`) under an accessibility contract (`docs/accessibility.md`).

### In scope for v1

- **A debugger core**, `Debugger`, added to `@frotzinc/zmachine` as a new export (a minor version; nothing existing changes): run/pause/step (into, over, out, to turn, to input), breakpoints (address, routine, line, action, printed text, property-write and attribute-change watchpoints, with conditions), watches (globals, locals, properties, memory ranges, expressions), an instruction and call trace, and **reverse stepping** via snapshots plus deterministic replay.
- **Inform awareness**: with `gameinfo.dbg`, routine and variable names, source line mapping, action names; the current `action`, `actor`, `noun`, `second` shown by name. With the `.inf` source files, a Source view with the current line and breakpoints set by clicking a line. Without symbols, frotzlens's fingerprinting labels the veneer and library.
- **The shared views**, `@frotzinc/zcode-ui` (MIT), extracted from `apps/web`, with an optional live prop.
- **The app**, `apps/trace` (GPL), at frotztrace.frotzinc.com: the frotzlens shell and look, with a Screen pane (the game, from the player's components), a Debug toolbar, and the live views.
- **The CLI**, `frotztrace` (GPL, unscoped), in `packages/trace-cli`: headless runs with a command script and trace output (`--trace calls`, `--break Routine`, `--watch score`), which is also the engine frotzcheck will use. It grows out of `zmachine-run`, the interpreter's own script runner.

### Out of scope for v1 (designed for, not built)

- **Frotzsmith integration** (Debug button after compile; the debugger as an embeddable component set). v1 builds the components in shared packages so this is wiring, not rewriting.
- **Glulx.** Different VM; Frotzsmith's Glulx target gets its own engine later behind the same debugger interface.
- **Version 6.** Graphics windows. No.
- **Sound.** `sound_effect` is a logged no-op.
- **Replacing Parchment in Frotzlens's Play view** with frotzplay. Separate decision. (Frotzsmith already plays in frotzplay: docs/16.)
- **An interactive terminal debugger** (gdb-style REPL in the CLI). The CLI is headless in v1.

## 4. Product principles

1. **Everything Frotzlens shows, frotztrace shows live.** Same views, same links, same stable IDs (`#routine/27f8`), with a running machine behind them. A user who knows Frotzlens knows frotztrace.
2. **Time runs both ways.** Step back is a first-class control, not a trick. If you can't rewind, it's not finished.
3. **Deterministic by default.** Same story, same script, same seed, same trace, every time. Randomness is a setting you turn on.
4. **Symbolic when it can be, honest when it can't.** Names from the debug file; otherwise addresses. The debugger never invents a name.
5. **The interpreter is a library first.** No DOM, no Vue, no `eval`. It runs in a worker, in Node, in a test, and (later) inside Frotzsmith.
6. **No Infocom branding.** "The Z-machine," "1980s story files." Fixtures are our own.
7. **Accessible by construction.** The same WCAG 2.2 AA bar as Frotzlens, which Frotzlens already meets; the Screen pane is a live region, the toolbar is a toolbar, and every control has a keyboard shortcut (F5/F10/F11, with reverse as Shift+).

## 5. Architecture

### 5.1 Where it lives

Inside the existing `frotzlens` monorepo, which already holds frotzlens and frotzplay. The interpreter frotztrace extends is here, the views it makes live are here, and frotzplay, which runs on the same interpreter, is here: a change to `zmachine` is tested against both in one pull request. One workspace, one CI, one lockfile. (The repo may deserve a family-wide name later; not now.)

```
frotzlens/
├── packages/
│   ├── zcode/            @frotzinc/zcode            MIT   (exists) decoder, model, symbols, decompiler
│   ├── zmachine/         @frotzinc/zmachine         MIT   (exists) interpreter; GAINS the Debugger
│   ├── zmachine-oracle/  @frotzinc/zmachine-oracle  GPL   (exists, private, test-only) ZVM replay
│   ├── player/           @frotzinc/player           MIT   (exists) the accessible player components
│   ├── zcode-ui/         @frotzinc/zcode-ui         MIT   NEW  Vue components extracted from apps/web
│   ├── worker-rpc/       @frotzinc/worker-rpc       MIT   (exists)
│   ├── nuxt-base/        @frotzinc/nuxt-base        MIT   (exists) the look, as a Nuxt layer
│   ├── inform6-wasm/     @frotzinc/inform6-wasm     MIT   (exists) fixtures
│   ├── cli/              frotzlens                  GPL   (exists)
│   └── trace-cli/        frotztrace                 GPL   NEW
└── apps/
    ├── web/              frotzlens                  GPL   (exists; imports zcode-ui after extraction)
    ├── play/             frotzplay                  GPL   (exists)
    └── trace/            frotztrace                 GPL   NEW
```

Dependencies point one way, apps → libraries. `zmachine` depends on `zcode`; `zcode-ui` depends on `zcode` and `zmachine` (for the `MachineView` type) and, as peers, Vue and Nuxt UI; `apps/trace` depends on all of them and on `player`.

### 5.2 `@frotzinc/zmachine` — the interpreter, as it is

**Why not ZVM** (unchanged from Draft 1, and why frotzplay built this): ZVM compiles each routine to JavaScript, which is fast, needs `'unsafe-eval'`, and can't be stopped between two instructions. `@frotzinc/zmachine` executes one decoded instruction at a time.

**What a debugger gets from it today** (`packages/zmachine/src/types.ts`, `machine.ts`):

- `Machine.create(story, options)` → a machine or a `{ fault }`; never throws. `options.seed` makes random deterministic; `options.hooks` attaches the hooks.
- `step()` runs one instruction and returns a `StopReason` or null; `run(budget)` steps until one: `input-line`, `input-char`, `save`, `restore`, `budget`, `quit`, `fault`. The debugger runs its own loop over `step()`, so it can stop between any two instructions without the interpreter knowing about breakpoints.
- `resume(input)` supplies a line, a key, a timer's expiry, or a save or restore result.
- `state` is public and plain data: `memory`, `pc`, `frames` (each with `returnPC`, `locals`, `evalStack`, `storeVariable`, `argCount`), `random`, `screen`, `input`, `streams`, `counters` (`instructions`, `turns`), `undo`.
- `snapshot()` → a `MachineSnapshot` (version 1) of the whole machine; `Machine.fromSnapshot(story, snapshot, options)` restores it exactly. Rewind is built on these two.
- `Hooks`: `write(address, value, size)`, `call(routine, args, frame)`, `return(value, frame)`, `branch(at, taken)`, `print(text, window)`, `input(kind, value)`. Every watchpoint, the trace, and the UI's changed-set attach here.
- `readQuetzal`/`writeQuetzal`, `play()` (a whole script, used by the tests), `normalizeTurn`, and the `zmachine-run` binary.

**Rules for changing it.** frotzplay and frotzsmith depend on the published package, and frotzplay autosaves `MachineSnapshot`s in its players' browsers. So:

1. **Additive only.** New exports, new optional options and hooks, never a changed signature or a changed meaning. Each release is a minor version with a changelog entry.
2. **`MachineSnapshot` version 1 stays readable.** If the debugger needs more in a snapshot, it keeps that beside the snapshot, or the format goes to version 2 with version 1 still accepted by `fromSnapshot`.
3. **frotzplay's suites stay green** on every change: its unit, contract (Playwright, three browsers) and differential tests.
4. **No cost when unused.** A hook nobody attached costs one optional call; frotzplay's speed doesn't change.

What the debugger may need that isn't there (to be confirmed in Phase 1's plan, not assumed): a hook or flag for the start of a turn (today `counters.turns` counts them); read access to the object table and dictionary through the machine (today through `zcode` over `state.memory`); an input log for replay (the debugger can keep one itself, since all input passes through `resume()`).

### 5.3 The debugger core

New, in `@frotzinc/zmachine`, as `Debugger`, wrapping a machine it creates (so its hooks are installed from the start and reinstalled on every `fromSnapshot`):

- **Control:** `run`, `pause`, `stepInstruction`, `stepOver` (run until the current frame's depth is restored), `stepOut`, `stepLine` (with source mapping: run until the source line changes), `runToTurn(n)`, `runToInput`, `continueTo(address)`.
- **Breakpoints:** `{ kind: 'address' | 'routine' | 'line' | 'action' | 'text' | 'write' | 'attr', … , condition? }`. Address and routine are PC checks. Line breakpoints resolve through the debug file to the first instruction of that line. Action breakpoints fire when Inform's `action` global is written to the named action (the global is identified by the debug file, or by fingerprinting the library's `action` global without one). Text breakpoints fire when printed output contains a string. Write and attribute watchpoints fire from the memory-write hook, decoded against the object table so "property `description` of `lantern` changed" is what the user sees, not an address. Conditions are small expressions over globals, locals, properties and attributes (`score > 10 && lantern has on`), parsed and evaluated by the core.
- **Watches:** the same expression language, re-evaluated after each stop, with change highlighting.
- **Trace:** a ring buffer of events (`call`, `return`, `write`, `print`, `input`, `branch`), filterable, exportable as text. The call trace alone is the thing people have wanted since 1993.
- **Rewind:** a `snapshot()` at every turn boundary (and every N thousand instructions within a turn), plus the log of every `resume()` input. Stepping backwards calls `fromSnapshot` on the nearest earlier snapshot and replays forward to the target instruction count (`counters.instructions`). Because random is seeded and its state is in the snapshot, replay is exact. The user experiences it as Step Back and a timeline scrubber; the implementation is "restore and re-run," which is why §4 principle 3 exists.
- **Inform layer:** given symbols, it resolves `action`/`actor`/`noun`/`second`, names locals in frames, and maps PC ↔ source line. Given fingerprinting only, it still finds the library's `action` global and the parser's entry points by shape.

### 5.4 `@frotzinc/zcode-ui` — the shared views

Extracted from Frotzlens's `apps/web/app/components/`: `RefLink`, `ObjectTree`, the routine disassembly renderer inside `RoutinesView`, `MemoryView`'s hex pane, `GlobalsView`, `SearchPalette`, `ViewHeader`, `CopyText`, `StatTile`, and the `useHashRoute` / `useSymbols` composables. The extraction follows the Phase 0 pattern from Frotzlens: move, make Frotzlens import them, prove Frotzlens unchanged, publish. The components gain an optional **live source** prop (a reactive machine view: current PC, changed addresses, current frame) so the same `ObjectTree` renders a dead file in Frotzlens and a running one in frotztrace, highlighting what changed since the last stop.

Vue and Nuxt UI are peer dependencies. The package is MIT (Chris's own code, relicensed on extraction, as before). The live prop's type, `MachineView`, comes from `@frotzinc/zmachine` (open question 4, settled that way).

**The Screen pane** is not new code: it is `@frotzinc/player`'s components (`ZUpperWindow`, `ZRuns`, `ZTranscript`, `ZCommandLine`, `ZStatusBar`) drawing the debugger's machine, so frotztrace's game looks, reads aloud and behaves exactly like frotzplay's. Today `ZPlayer` and its `useMachine` composable create and own their machine; letting them draw one the debugger owns is an additive change to `@frotzinc/player`, designed at the start of Phase 4 (open question 6).

### 5.5 The app

`apps/trace`: Nuxt 4, Nuxt UI 4, `@frotzinc/nuxt-base` as the layer, static, Netlify, same `netlify.toml` shape as frotzplay's (`apps/play/netlify.toml`): no `/play/` CSP exception, since there's no `eval` anywhere in frotztrace and so no sandbox; and an `ignore` include-list like frotzplay's, so the site builds only when `apps/trace` or a package it is built from changes. The machine runs in a worker via `@frotzinc/worker-rpc` with a per-`run` instruction budget so a runaway story can't hang the tab). Hash routes for every view. Story, `.dbg` and `.inf` files arrive by drop, by a file picker, or by `postMessage` from an opener (how Frotzlens's "Debug this story" button hands a file across origins; Frotzlens's Play iframe already uses this pattern).

### 5.6 The CLI

`frotztrace game.z5 --script walk.txt` plays the script and prints the transcript, as `zmachine-run` does today (same script format: one command per line, `!` comments, `[timeout]`, `[key x]`). `--trace calls|writes|all` prints the event trace alongside; `--break Routine|addr|action:Take` stops and dumps the stack; `--watch score,lantern.on` prints changes; `--seed N`; `--save-at 12 out.qzl`; `--quetzal in.qzl` to inspect a save. Exit codes make it usable in CI, which is frotzcheck's foundation.

## 6. User interface

### 6.1 Direction

The same product as Frotzlens, running. Frotzsmith's and Frotzlens's shared look applies unchanged: dark by default, the `@frotzinc/nuxt-base` tokens (ground `#0e1116`, ink `#e6dfcf`, panel, rule, the family amber `#f0a830` as `lamp`, `#8a5208` as light-mode `lamp-text`), Segoe UI Variable Display/Text → Open Sans, Cascadia Code → JetBrains Mono → Courier Prime for data, big type. The header, footer, About menu, nav, and command palette are the Frotzlens ones from `zcode-ui`. A user switching between the three apps should not notice a seam. **frotztrace looks exactly like frotzsmith and frotzlens, dark by default** (Chris, 2026-11-08): it extends `@frotzinc/nuxt-base` for the look and the shell and `@frotzinc/zcode-ui` for the views, and defines no colors, fonts or chrome of its own; anything visual it needs goes into one of those two packages.

What's new is the **debugger chrome**, kept small: a toolbar under the header (Run ▶, Pause, Step Into, Step Over, Step Out, Step Back ◀, Run to Input, Restart; a turn/instruction counter; the seed) and a **status strip** (stopped at `ScoreTimer+12` · turn 7 · 48,211 instructions · breakpoint "action Take"). The amber marks the current PC, the current frame, and anything that changed since the last stop; the "lit" metaphor carries over: what the machine just touched is what glows.

### 6.2 First load

The Frotzlens drop zone, with three slots instead of one: **story** (required), **debug file** (optional, "for names and source lines"), **source** (optional, one or more `.inf`, "for the Source view"). **Samples, so no one needs a story of their own** (Chris, 2026-11-08): a row of frotzsmith's sample games, as frotzplay's start page has (Dark Cellar first, then the Locked Chest, the Hermit, Magic 8-Ball and a PunyInform one), each loaded with its `.dbg` and `.inf` so breakpoints on actions and lines, source stepping and rewind all work at once. They're compiled at build time from `samples/src` with `@frotzinc/inform6-wasm` (with `-k`, so each has its debug file), as frotzplay copies its samples, and `?sample=<id>` opens one. One sentence under it. Nothing else.

### 6.3 Layout after load

Two columns on desktop. **Left, the Screen**: the game, drawn from the screen model (upper window grid, lower window scrollback), with the command line at the bottom. It's a real player; you can just play. **Right, the debugger views**, tabbed, with the nav from Frotzlens:

| View | Live content | From Frotzlens? |
|---|---|---|
| **Stack** | Frames top-down: routine (named), PC, source line, locals with values; click a frame to view it | new |
| **Source** | The `.inf` with the current line marked, breakpoints in the gutter, hover for values | new (Frotzlens's Source view is the decompiler's, different thing) |
| **Routines** | Disassembly with the PC marker and taken-branch arrows; click a line to set a breakpoint | zcode-ui |
| **Objects** | The tree as it is *now*; changed objects and properties lit; the player's location pinned | zcode-ui + live prop |
| **Globals** | Values now; changed since last stop lit; Inform names and the action/noun/second decoded | zcode-ui + live prop |
| **Memory** | Dynamic memory hex with changed bytes lit; static/high read-only | zcode-ui + live prop |
| **Breakpoints** | The list, with hit counts and conditions; add by kind | new |
| **Watches** | Expressions and values; change highlighting | new |
| **Trace** | The event log, filterable (calls / writes / prints / all), exportable | new |
| **Timeline** | Turns as a strip with snapshots; drag to any turn; the instruction scrubber within a turn | new |
| **Map** | Frotzlens's room graph, with the player's room lit and the visited rooms shaded | zcode-ui + live prop |

On a phone the two columns stack, Screen first.

### 6.4 Keyboard

F5 run/continue, F6 pause, F10 step over, F11 step into, Shift+F11 step out, **Shift+F10 step back**, F8 run to input, Ctrl/Cmd+K palette, F9 toggle breakpoint on the current line. Shown in a shortcuts dialog (Frotzsmith has one to copy).

### 6.5 Accessibility

Frotzlens's bar, kept. The Screen's lower window is an `aria-live="polite"` log; the upper window is a grid with a text alternative; the toolbar is `role="toolbar"` with arrow-key movement; the PC marker and "changed" highlights have text equivalents (a "changed" badge, a `▶` in the gutter); breakpoints are announced when hit. axe in the Playwright test as before; NVDA before release.

## 7. Testing strategy

What exists stays the gate: `zmachine`'s opcode tests (with their test assembler), the differential walkthroughs against `zmachine-oracle`, the Czech and Praxix conformance runs, the Quetzal round trips, and frotzplay's own unit, contract and export suites. Every change to `zmachine` or `player` runs all of them.

New for frotztrace:

- **Debugger unit tests** in `@frotzinc/zmachine`: each breakpoint kind stops at the right instruction on hand-assembled routines and on the samples; step over/out land where they should; conditions and watches evaluate correctly; the trace records what the hooks saw.
- **Determinism.** Same story + script + seed twice → identical trace.
- **Rewind.** Run to instruction N, record the state; run on; step back to N → the state equals the recorded one, byte for byte (`snapshot()` compared).
- **Snapshot compatibility.** A `MachineSnapshot` written by `zmachine` 0.1.x (frotzplay's autosave) still restores after every change.
- **CLI:** `frotztrace dark-cellar.z5 --script walk.txt --break action:Take` stops at the right instruction and prints a named stack; exit codes as documented.
- **App:** Playwright: load the sample, set a breakpoint on an action, run, assert the stop, step back, assert the state; axe on every view.

## 8. Licensing

Frotz, Inc. policy, unchanged: **apps GPL-3.0-or-later, libraries MIT.** `@frotzinc/zmachine` and `@frotzinc/zcode-ui` are MIT; `apps/trace` and the `frotztrace` CLI are GPL. Dependencies point apps → libraries. No library bundles GPL code. The interpreter is a clean-room implementation from the Standard; it does not derive from Frotz or any other interpreter's source, except ZVM's xorshift `@random`, copied with attribution (MIT), as `zmachine`'s README says. ZVM is otherwise used only as a test oracle, through `@frotzinc/zmachine-oracle` (GPL, private, never published or bundled). The Czech and Praxix conformance suites are test sources only (`LICENSING.md`).

## 9. Branding and deployment

- Icon: the family badge with the instrument — a stepped trace line (a square-wave-like step pattern) under the loupe's cousin. Not a lantern (that's the company's).
- Footer and About menu as Frotzlens.
- Social card in the house style; `og:` meta; canonical `https://frotztrace.frotzinc.com/`.
- Social card: `apps/trace/public/og-image.svg` (rendered to `og-image.png`); the logo and favicons are its instrument mark.
- **The site exists before the app** (2026-11-08, Chris): `apps/trace` holds a placeholder page, its `netlify.toml` (modelled on frotzplay's) and `.nvmrc`, so the Netlify site and domain are set up early. Phase 4 replaces the page with the debugger and widens the `ignore` include-list to the packages it then uses.
- Netlify: a third site on this repository, base `apps/trace`, with its own `netlify.toml` and `ignore` rule (§5.5). Chris connects it. **Production deploys cost Netlify credits (15 each); Deploy Previews are free.** Work happens in pull requests and their previews; nothing is merged to `main` until Chris says so. A merge that changes `zmachine` deploys both frotzplay and frotztrace.
- `frotztrace` is free on npm and reserved before Phase 0 with the same placeholder pattern as `frotzlens` was (GPL this time, correct scope, no `infocom` keyword).

## 10. Phases

Re-cut for what exists. Each phase is its own branch and pull request, checked on its Deploy Preview, merged only when Chris says so.

| Phase | Builds | Done when |
|---|---|---|
| **0** | Extract `@frotzinc/zcode-ui` from `apps/web`; frotzlens imports it unchanged; publish 0.1.0. Reserve `frotztrace` on npm. | frotzlens's Playwright and axe suite green on `zcode-ui`; package on npm |
| **1** | `Debugger` in `zmachine`: the stepping loop over `step()`, run/pause/step into, over, out/run to input/run to turn; address and routine breakpoints; the trace from the hooks; the input log. `packages/trace-cli`: `frotztrace` plays a script, with `--trace calls` and `--break Routine`. `zmachine` minor release. | The CLI stops on a routine in a sample and prints its stack; every existing `zmachine` and frotzplay suite green |
| **2** | Time: snapshots at turn boundaries and every N instructions, deterministic replay, `stepBack`/`goToInstruction`, the Timeline's data. | Determinism, rewind and snapshot-compatibility tests pass |
| **3** | The Inform layer and the expression language: names, line mapping, `action`/`noun`/`second`; line, action, text, write and attribute breakpoints with conditions; watches; `MachineView` for the UI. CLI gains `--break action:Take`, `--watch`, `--seed`, `--save-at`, `--quetzal`. | `frotztrace dark-cellar.z5 --script walk.txt --break action:Take` stops at the right instruction and dumps a named stack |
| **4** | The app: drop zone, worker wiring, the Screen pane from `@frotzinc/player`, toolbar, status strip, Stack, Routines/Objects/Globals/Memory live, Breakpoints, Trace; hash routes; `apps/trace/netlify.toml`; the Netlify site. | Play the sample in the browser, hit a breakpoint, inspect, continue, on the Deploy Preview |
| **5** | Source view, Watches, Timeline with step-back, Map (live), keyboard shortcuts dialog, accessibility audit, light-mode pass, docs. Publish `zmachine` (minor) and `frotztrace` 0.1.0. Frotzlens gets a "Debug this story" button that opens frotztrace with the file. | frotztrace 0.1.0 live at frotztrace.frotzinc.com |

## 11. Open questions

1. ~~Praxix/Czech licences.~~ Settled by frotzplay: both are in `packages/zmachine/test/conformance/` as test sources (`LICENSING.md`).
2. **Snapshot cadence.** Every turn plus every N instructions within a turn; N is tuned against the big fixtures (`architect-legacy`, `mingus`) so step-back feels instant.
3. **Expression language scope.** Globals, locals, `obj.prop`, `obj has attr`, arithmetic, comparisons, `&&`/`||`. Whether to allow routine calls in conditions (useful, but a condition with side effects breaks determinism) — lean no.
4. ~~Where the live-source prop lives.~~ A `MachineView` type exported by `zmachine`, which `zcode-ui` imports.
5. **Repo name.** The monorepo is `frotzlens` and will hold three apps. Rename to a family name, or leave it. Not urgent.
6. **The Screen pane and `@frotzinc/player`.** How the player's components draw a machine the debugger owns: a `machine` prop on `ZPlayer`, a lower-level composable beside `useMachine`, or the debugger feeding the player's state. Additive either way; decided at the start of Phase 4, with frotzplay's contract suite as the check.
7. **Turn boundaries.** Whether `zmachine` gains a hook for "a turn starts" or the debugger infers it from the input stops. Decided in Phase 1's plan.

## 12. Later

In order of likelihood: the **Frotzsmith Debug button** (compile → debug with source, in the IDE); **frotzplay in Frotzlens's Play view**, retiring Parchment there and dropping `'unsafe-eval'` and the sandbox; **frotzcheck** as a thin layer over the CLI; a gdb-style **interactive terminal debugger**; **Glulx** behind the same `Debugger` interface; **omniscient queries** over the trace ("when did `score` last change, and from where?").

## 13. What changed from Draft 1

- **The interpreter exists.** Draft 1's Phase 1 and most of Phase 2 (opcodes, screen model, input, random, Quetzal, undo, snapshots, conformance, the ZVM differential tests) were built by frotzplay as `@frotzinc/zmachine` 0.1.1. frotztrace adds the `Debugger` to it, additively, and must not break frotzplay.
- **The oracle is vendored** (`@frotzinc/zmachine-oracle`); no frotzsmith checkout is needed.
- **Conformance licences are settled**; open question 1 is closed.
- **The Screen pane reuses `@frotzinc/player`.**
- **Frotzsmith already plays in frotzplay** (docs/16), so "replacing ZVM in Frotzsmith's player" is off the out-of-scope list; Frotzlens's Play view is still Parchment.
- **Phases re-cut** (§10): 1 is the debugger's foundations and the CLI, 2 is rewind.
- **Deployment:** a third Netlify site with an `ignore` rule; pull requests and Deploy Previews, merged only on Chris's word, because production deploys cost credits.
