# Changelog

All notable changes to `@frotzinc/zcode-ui`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.1.0] - 2026-11-08

The first release: frotzlens's story views, moved out of the app (and relicensed MIT by their author) so frotztrace can show a running story with the same components.

### Added
- **Views:** `ObjectTree`, `GlobalsView`, `MapView`, `SearchPalette`, and `AppNav`, which now takes the app's list of views (`views`, `active`) instead of building frotzlens's.
- **New, split out of frotzlens's views:** `Disassembly` (from the routine view) and `HexPane` (from the memory view; `v-model:top`, `notes`, `inRange`).
- **Parts:** `RefLink`, `Referrers`, `ViewHeader`, `CopyText`, `StatTile`, `NotFound`.
- **Composables and utils:** `useHashRoute`, `useSymbols`, `activeSymbols`, the naming and routing utils (`hex`, `idRoute`, `idLabel`, `routineName`, …), `useLimit`, `storyIndex`, `layoutMap`.
- **`MachineView`**, the type of the optional `live` prop the views take; a placeholder until `@frotzinc/zmachine` exports the real one. A view given no `live` (or one, in this release) renders as before.
