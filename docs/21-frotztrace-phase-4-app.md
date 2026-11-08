# frotztrace — Phase 4: The App

**Document 21 · frotztrace Phase 4** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md) §5.4, §5.5, §6)
**Deliverable:** at frotztrace.frotzinc.com (first on the staging deploy): pick a sample or drop a story, play it, hit a breakpoint, inspect the stack, routines, objects, globals and memory, live, and continue. The rest of the views (Source, Watches, Timeline, Map live) are Phase 5.

> **Status: built** (2026-11-08), on Chris's approval of both decisions below (A, the main thread; B, `useScreen` from `@frotzinc/player`). Found while building: an action breakpoint fired a second time when `begin_action` restored the previous action (also Take) at its end; it now fires once per call. Not in this phase: the Source, Watches and Timeline views and the Map (Phase 5); names without a debug file in the browser (inferring them needs WebAssembly, which frotztrace's CSP doesn't allow; a decision for Phase 5).

---

## 1. Decision A: the machine on the main thread, not in a worker

The design (§5.5) put the machine in a Web Worker. I propose the **main thread, run in slices**, as frotzplay does (Chris decided the same for frotzplay, docs/14 §5):

- **The views need the machine, synchronously, at every stop:** memory for the hex pane, the object table for the tree, the globals, the stack with its locals, the symbols, `view()`'s changed sets, watches, the expression language for hovers. In a worker, every stop would copy all of that across (a structured clone of dynamic memory, frames, screen) or every hover would be a round trip.
- **Rewind replaces the machine** (`fromSnapshot`); on the main thread that's a reference swap, in a worker it's another full transfer.
- **Responsiveness is already solved:** the Debugger runs in budgets; the app runs 20 000 instructions, yields to the page, and goes on (frotzplay's loop). Pause lands between slices. The interpreter runs ~15 million instructions a second, so a slice is about a millisecond.
- **What a worker would buy** is isolation from a runaway story, which the budget already gives, and nothing else here.

The story file and the symbols are parsed once (zcode, in frotzlens's parse worker if large; the samples are small).

## 2. Decision B: the Screen pane, from `@frotzinc/player`, additively

`ZPlayer` owns its machine (`useMachine` creates and drives it). frotztrace's Debugger must own it. The screen components themselves are already driven by props (`ZTranscript :turns`, `ZUpperWindow :rows`, `ZStatusBar :left :right`, `ZCommandLine` events, `ZRuns :runs`), so the change is small:

1. **Extract the recorder.** `useMachine` both drives the machine and records the screen (turn blocks of styled runs from the print hook, the status line, the upper window, the phase). The recording part becomes its own exported composable, **`useScreen()`**: `print(text, window)`, `beginTurn(kind, command)`, `endTurn(stop, screen)`, `restore(runs)` (after a rewind: the story so far as one block), and a reactive `state` of the same `MachineState` shape. `useMachine` is rewritten on top of it, with **no change in behaviour** (frotzplay's contract suite, three browsers, is the check).
2. **Export the screen components:** `ZTranscript`, `ZUpperWindow`, `ZStatusBar`, `ZCommandLine`, `ZRuns`, `ZAnnouncer`, `ZMessages`.
3. frotztrace's Screen pane composes those with `useScreen()`, fed by the Debugger (its host `print` hook, and each stop). It's the same reading order, live region and keyboard behaviour as frotzplay's, by construction.

A `@frotzinc/player` minor release (0.3.0), additive: nothing existing changes for frotzplay or frotzsmith.

**After a rewind** the transcript shows the story so far as one block (the lower window as the machine had it there, exactly as frotzplay's "Continue" shows a restored game), then new turns as they're played.

## 3. The rest of the phase (no decision needed: the design settles it)

- **`apps/trace`** extends `@frotzinc/nuxt-base` and `@frotzinc/zcode-ui`, the family shell, dark by default; its `netlify.toml` `ignore` list gains `zcode`, `zcode-ui`, `zmachine`, `player`, `inform6-wasm`, `samples` and `scripts`.
- **Samples (Chris, 2026-11-08)**: a row of frotzsmith's sample games on the start page, each compiled at build time from `samples/src` with `@frotzinc/inform6-wasm` and `-k`, so each has its story, debug file and source; `?sample=<id>` opens one. Dark Cellar first, then the Locked Chest, the Hermit, Magic 8-Ball and a PunyInform one.
- **Start page**: the samples, and a drop zone with three slots: story (required), debug file, sources.
- **Layout**: two columns on desktop, the Screen on the left; on the right the views, tabbed with the shared `AppNav`. A toolbar under the header (Run, Pause, Step Into, Step Over, Step Out, Step Back, Restart; turn and instruction counters) and a status strip ("stopped at ScoreTimer+12 · turn 7 · breakpoint action Take"). F5/F6/F10/F11/Shift+F11/Shift+F10 as the design (§6.4).
- **Views this phase**: Stack (frames, named, locals, source line), Routines (the shared `Disassembly`, with the PC marked and a click to set a breakpoint), Objects (`ObjectTree`, live), Globals (`GlobalsView`, live), Memory (`HexPane`, live), Breakpoints (list, add by kind, conditions, hit counts), Trace (filterable). The shared views gain their `live` behaviour: the PC line, changed rows lit (`view()`), each with a text equivalent ("changed").
- **Hash routes** for every view (`#stack`, `#routine/27f8`, `#object/47`, …), as frotzlens.
- **Tests**: Playwright on the built site under its CSP: open the Dark Cellar sample, set `action:Take`, play to it, assert the stop and the named stack, step back, assert, continue; axe on every view; frotzplay's suites unchanged.
