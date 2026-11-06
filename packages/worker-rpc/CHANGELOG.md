# Changelog

All notable changes to `@frotzinc/worker-rpc`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [0.1.0] - 2026-11-06

First release, extracted from [Frotzsmith](https://frotzsmith.com).

- `createWorkerRpc`: one long-lived Web Worker, request IDs, timeouts (with `clockStartsAfter`), dead-worker recovery, and explicit `ok | error | unavailable | timeout` outcomes.
- `@frotzinc/worker-rpc/testing`: `makeWorkerSpy`, a Vitest Worker mock.
