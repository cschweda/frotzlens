# Changelog

All notable changes to `@frotzinc/zcode-ui`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.2.0] - 2026-11-08

The views light a running machine (frotztrace Phase 4). Without `live` or `breakpoints`, each renders exactly as before.

### Added
- **`Disassembly`**: with `live`, the PC's line is marked (with "current instruction" for screen readers); with `breakpoints`, a gutter button per line (`aria-pressed`) emits `toggleBreakpoint`.
- **`GlobalsView`**: with `live`, a "Now" column read from the running machine's memory, and the globals changed since the last stop marked "changed".
- **`MapView`**: with `live`, the player's room (`real_location`, or `location`) is marked and the visited rooms shaded, with "you are here" and "visited" in the list.
- **`useSymbols().symbolsText`**: the debug file's text as read, so frotzlens can hand it to frotztrace.
- **`ObjectTree`** and **`HexPane`**: with `live`, what changed is lit, with a "changed" badge or count as its text equivalent. Give `ObjectTree` a story whose objects are read live (`zcode`'s `liveTables`) to show the tree as it is now.

## [0.1.1] - 2026-11-08

### Changed
- `MachineView` is now the Debugger's own type from `@frotzinc/zmachine` (0.2.0), re-exported; the same shape as the placeholder it replaces. `@frotzinc/zmachine` is a new dependency, for the type.

## [0.1.0] - 2026-11-08

The first release: frotzlens's story views, moved out of the app (and relicensed MIT by their author) so frotztrace can show a running story with the same components.

### Added
- **Views:** `ObjectTree`, `GlobalsView`, `MapView`, `SearchPalette`, and `AppNav`, which now takes the app's list of views (`views`, `active`) instead of building frotzlens's.
- **New, split out of frotzlens's views:** `Disassembly` (from the routine view) and `HexPane` (from the memory view; `v-model:top`, `notes`, `inRange`).
- **Parts:** `RefLink`, `Referrers`, `ViewHeader`, `CopyText`, `StatTile`, `NotFound`.
- **Composables and utils:** `useHashRoute`, `useSymbols`, `activeSymbols`, the naming and routing utils (`hex`, `idRoute`, `idLabel`, `routineName`, …), `useLimit`, `storyIndex`, `layoutMap`.
- **`MachineView`**, the type of the optional `live` prop the views take; a placeholder until `@frotzinc/zmachine` exports the real one. A view given no `live` (or one, in this release) renders as before.
