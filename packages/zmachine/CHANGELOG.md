# Changelog

All notable changes to `@frotzinc/zmachine`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- The interpreter (frotzplay Phase 1, [docs/11](../../docs/11-frotzplay-phase-1-interpreter.md)): every opcode of versions 3, 4, 5 and 8, run from `@frotzinc/zcode`'s decoded instructions; the §8 screen model as data; line, character and timed input that suspends the machine; ZVM-compatible seeded random; undo; hooks on writes, calls, returns, branches, prints and input; faults instead of exceptions.
- `play(story, commands, options)` and the `zmachine-run` command: normalized transcripts, turn by turn.
- Differential tests against ZVM: every sample, every version built, the same transcript and the same header.
