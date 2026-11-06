# Changelog

All notable changes to `@frotzinc/inform6-wasm`. Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-06

First release, extracted from [Frotzsmith](https://frotzsmith.com).

- Inform 6.44 in WebAssembly, with the Inform Standard Library 6.12.8 and PunyInform.
- `compile(source, { version, library, debug, extensions, locateFile, instantiate })` returning the story file, diagnostics, stats, and `gameinfo.dbg`.
- `@frotzinc/inform6-wasm/library`: the library files.
