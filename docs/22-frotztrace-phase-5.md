# frotztrace — Phase 5: Source, Time, Polish

**Document 22 · frotztrace Phase 5** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md) §6, §10)

> **Status: built** (2026-11-08), except the release itself: publishing `@frotzinc/zmachine` and `frotztrace` 0.1.0 waits for Chris's merge of `staging` into `main`.

## What it adds

- **Source**: the game's own `.inf`, with line numbers, ▶ on the line the machine is on, and a gutter button on each line a statement starts on (from the debug file's sequence points) to set a line breakpoint. Needs the source and the debug file; the samples have both.
- **Watches**: expressions (`lantern in player`, `score`, `location == Cellar`) re-evaluated at every stop, the changed ones marked. One that doesn't parse is refused, in words; one that can't be evaluated now is kept (it may be later).
- **Timeline**: every turn with what was typed and "Go here"; a scrubber over every instruction to the furthest point; Step back; To the furthest point. Going forward replays what happened; typing something new in the past starts a new timeline (docs/19).
- **Map, live**: frotzlens's map with the player's room marked (Inform's `real_location`, since in the dark `location` is the darkness object) and the visited rooms shaded, with "you are here" and "visited" in the list too.
- **Keys**: F8 (run to input) and F9 (a breakpoint on the current line) join F5/F6/F10/F11 and their Shift forms; `?` (or the toolbar's keyboard button) opens the shortcuts.
- **frotzlens → frotztrace**: frotzlens's header gains **Debug**, which opens frotztrace in a new tab and hands it the story (and the debug file, if one is loaded) by `postMessage` once frotztrace says it's ready. Nothing is uploaded. frotztrace takes a story only from frotzlens's origins (production, staging, Deploy Previews; localhost only when it runs locally itself). On staging, frotzlens opens staging's frotztrace.

## Found while building

- **A slice isn't a stop.** The app runs the Debugger in slices; a slice running out was treated as a stop, so watches and `view()` compared with the slice before (a value changed early in a turn looked unchanged at its end), and a breakpoint exactly where a slice ended was skipped. Fixed in `zmachine`, with tests for both.
- **The Timeline's "Go here"** had an accessible name that didn't contain its visible text (axe, `label-content-name-mismatch`); it's "Go here (turn 3)" now.

## Accessibility

axe (WCAG 2.2 AA) on every view in dark and light, under the real CSP: the start page, Stack, Source, Code, Objects, Globals, Memory, Map, Watches, Timeline, Breakpoints, Trace, the shortcuts dialog and the report dialog. Every highlight has a text equivalent ("current instruction", "changed", "you are here"); the toolbar is a toolbar with arrow keys; the scrolling panes are focusable regions. NVDA by hand before release (Chris's checklist).

## Not done

- **Names for a dropped story with no debug file**, in the browser: it would compile the library with WebAssembly, which frotztrace's CSP doesn't allow (`'wasm-unsafe-eval'`). The CLI does it; the app shows routine numbers (R0012) and addresses until Chris decides.
- **A "turn so far" that streams while running**: a stopped turn's text so far is shown; while running, the screen updates at the end of the turn.
