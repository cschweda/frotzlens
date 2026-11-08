# Changelog

All notable changes to `frotztrace`, the command line. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.0.2] - 2026-11-08

The first working version (frotztrace Phase 1), not yet published: npm holds 0.0.1, the name's placeholder.

### Added
- `frotztrace story --script file` plays a command script under `@frotzinc/zmachine`'s `Debugger`, turn by turn.
- `--trace calls|all` prints every call and return (and with `all`, writes, branches and input), indented by depth.
- `--break <routine>` (a name from `--symbols`, a txd name, or an address) stops at the routine and prints the stack, innermost first, with each frame's locals (named, with `--symbols`).
- `--seed N`; exit codes 0 (done), 1 (fault or usage), 2 (breakpoint), 3 (quit early).
