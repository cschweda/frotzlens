# Changelog

All notable changes to `@frotzinc/worker-rpc`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, inc.](https://frotzinc.com).

## [0.1.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, inc. (the README, comments and any text shown).

## [0.1.0] - 2026-11-06

First release, extracted from [frotzsmith](https://frotzsmith.com).

- `createWorkerRpc`: one long-lived Web Worker, request IDs, timeouts (with `clockStartsAfter`), dead-worker recovery, and explicit `ok | error | unavailable | timeout` outcomes.
- `@frotzinc/worker-rpc/testing`: `makeWorkerSpy`, a Vitest Worker mock.
