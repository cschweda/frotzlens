# Changelog

All notable changes to `@frotzinc/inform6-wasm`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, inc.](https://frotzinc.com).

## [0.1.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, inc. (the README, comments and any text shown).

## [0.1.0] - 2026-11-06

First release, extracted from [frotzsmith](https://frotzsmith.com).

- Inform 6.44 in WebAssembly, with the Inform Standard Library 6.12.8 and PunyInform.
- `compile(source, { version, library, debug, extensions, locateFile, instantiate })` returning the story file, diagnostics, stats, and `gameinfo.dbg`.
- `@frotzinc/inform6-wasm/library`: the library files.
