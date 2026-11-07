# Changelog

All notable changes to `@frotzinc/zmachine`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

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
