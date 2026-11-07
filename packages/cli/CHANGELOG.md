# Changelog

All notable changes to `frotzlens`, the Frotzlens CLI. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [0.1.0] - 2026-11-06

First release. (0.0.1 was an MIT-licensed placeholder; from 0.1.0 the CLI is GPL-3.0-or-later.)

- With no options, the whole disassembly as Ztools' `txd` prints it; `-n` (`txd -n`), `--routine <addr>`, `--no-grammar` (`txd -g`).
- `infodump`'s sections, as `infodump` prints them: `-i -m -a -o -t -g -d`, `-f` for all, bundled like `-oti`. Byte for byte the same on every Standard Library and library-free test story.
- `--symbols <gameinfo.dbg>`: routines, globals, locals, attributes and properties by their source names.
- `--info`: what made the story (compiler, library, Inform's veneer routines), and a Blorb's contents.
- `--rooms`: the map, from the debug file: rooms, exits, doors, routine exits and the start.
- `--json`: the parsed model (with `--symbols` and `--rooms`, those too).
- Blorb files (`.zblorb`, `.zlb`) are unwrapped; PunyInform's grammar is read correctly where Ztools misreads it.
