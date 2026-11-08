# Changelog

All notable changes to `@frotzinc/zmachine`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.2.0] - 2026-11-08

frotztrace's debugger, added beside the interpreter, with rewind and the Inform layer; nothing that was there changes.

### Added
- **`Debugger`**: a machine run under observation. `run`, `stepInstruction`, `stepOver`, `stepOut`, `runToInput`, `runToTurn`, `continueTo` and `pause`, each in slices (a budget) so a host stays responsive; address and routine breakpoints, with hit counts, that can be disabled or removed; `stack()`, each frame named by its routine; a ring-buffer trace of calls, returns, writes, prints, input and branches, each stamped with the instruction count; and the log of every input it passes on. With nothing set, a story plays exactly as on a plain `Machine` (tested on the Dark Cellar walkthrough: the same text and the same memory at the end).
- **Rewind** (frotztrace Phase 2): `stepBack(n)`, `goToInstruction(n)`, `goToTurn(t)` and `timeline()`. Checkpoints at every prompt and every `checkpointEvery` instructions (default 100 000), sharing the transcript and undo ring instead of copying them, and the input log (each input with the instruction count it was given at) replayed exactly. Behind the furthest point reached, running forward replays the logged future; a new input there starts a new timeline. Going to any point of a 2-million-instruction game takes a few milliseconds. `inputLog` entries are `{ at, input }`.
- **The Inform layer** (frotztrace Phase 3): give the Debugger `symbols` (zcode's `readSymbols`, or `inferSymbols` without a debug file) and it names things. `inform()` gives `action`/`actor`/`noun`/`second` by name; `sourceLine()` and `stepLine()` work from the sequence points. New breakpoints: `line`, `action` (stops when the library begins the action, with noun and second set), `text`, `write`, `property` and `attribute`, each with an optional `condition`; a breakpoint that can't fire says why in `error`. Watches (`addWatch`), `evaluate()`, and `view()`, the `MachineView` the UI lights: the PC, the frame, and the addresses, globals and objects written since the last stop.
- **The expression language** (`parseExpr`, `evaluateExpr`): globals, locals and objects by name, `obj.prop`, `has`/`hasnt`/`in`, `parent()`/`child()`/`sibling()`, `##Action`, arithmetic and comparisons (16-bit, signed), `&&`/`||`/`!`. No side effects: no assignment, no calls.
- **`Frame.routine`**: each frame a call makes records the routine's address, so a debugger can name it and it survives `snapshot()`. Undefined for the main routine's frame, for frames restored from a Quetzal save (Quetzal has no such field), and in a 0.1.x snapshot, which still restores. Save files are unchanged, byte for byte.

## [0.1.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, Inc. (the README, comments and any text shown).

## [0.1.0] - 2026-11-07

The first release: the interpreter behind frotzplay. (On npm once published.)

### Added
- **Saves (Phase 2, [docs/12](../../docs/12-frotzplay-phase-2-state.md)):** `@save` and `@restore` stop for the host (`save` with a Quetzal 1.4 file, `restore`), finished with `resume({ saved })` / `resume({ restore })`. Saves are byte-compatible with ZVM's; a bad file is a `bad-save` notice in words and a failed restore. `readQuetzal`/`writeQuetzal` exported. `play()` takes `files`.
- **Snapshots:** `machine.snapshot()` and `Machine.fromSnapshot(story, snapshot, options)`, the whole machine as plain data.
- **Conformance:** Czech 0.8 (v3/4/5/8) and Praxix, compiled at test time, pass and match ZVM.
- `header.standard` (default 1.1).

### Fixed
- `@print_char 0` prints nothing in any stream (§3.8.2.1); it was written into stream 3.
- The interpreter (frotzplay Phase 1, [docs/11](../../docs/11-frotzplay-phase-1-interpreter.md)): every opcode of versions 3, 4, 5 and 8, run from `@frotzinc/zcode`'s decoded instructions; the §8 screen model as data; line, character and timed input that suspends the machine; ZVM-compatible seeded random; undo; hooks on writes, calls, returns, branches, prints and input; faults instead of exceptions.
- `play(story, commands, options)` and the `zmachine-run` command: normalized transcripts, turn by turn.
- Differential tests against ZVM: every sample, every version built (v3, v4, v5, v8), played through with its walkthrough under two seeds, gives the same transcript; the same header.
- Opcode tests with a small test assembler: every rule-6 item named and cited; every opcode of every version run (a coverage test).
- Command scripts: `[timeout]` (a timed read's interval ran out) and `[key x]` (a key for `@read_char`); timed input tested with a compiled Inform 6 fixture.
