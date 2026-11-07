# Changelog

All notable changes to `frotzlens`, the frotzlens CLI. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.3.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, Inc. (the README, comments and any text shown).

## [0.3.0] - 2026-11-07

- `--inform`: the story decompiled to Inform 6 (Phase 6), each routine checked by compiling the whole again with Inform 6.44 (`@frotzinc/inform6-wasm`, now a dependency, loaded only for this) and comparing it with the story's. Names from `--symbols` if given, else made up; the library found by compiling it alone. Says on stderr how many routines came back the same; exits 1 if any didn't.

## [0.2.0] - 2026-11-07

- `-g` / `--grammar` on a ZIL story (ZILF's, or Infocom's): its syntax tables, each line as its `SYNTAX` form reads, then the action and pre-action routines and the prepositions. A preposition shown as `#238` is a number no word has: ZILF compiles a `SYNTAX` naming a word before a later `SYNONYM` gives that word another's number (Mingus I's ONTO and INTO), so those lines can't be matched by what a player types.

## [0.1.0] - 2026-11-06

First release. (0.0.1 was an MIT-licensed placeholder; from 0.1.0 the CLI is GPL-3.0-or-later.)

- With no options, the whole disassembly as Ztools' `txd` prints it; `-n` (`txd -n`), `--routine <addr>`, `--no-grammar` (`txd -g`).
- `infodump`'s sections, as `infodump` prints them: `-i -m -a -o -t -g -d`, `-f` for all, bundled like `-oti`. Byte for byte the same on every Standard Library and library-free test story.
- `--symbols <gameinfo.dbg>`: routines, globals, locals, attributes and properties by their source names.
- `--info`: what made the story (compiler, library, Inform's veneer routines), and a Blorb's contents.
- `--rooms`: the map, from the debug file: rooms, exits, doors, routine exits and the start.
- `--json`: the parsed model (with `--symbols` and `--rooms`, those too).
- Blorb files (`.zblorb`, `.zlb`) are unwrapped; PunyInform's grammar is read correctly where Ztools misreads it.
