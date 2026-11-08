# Changelog

All notable changes to `frotztrace`, the command line. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.1.0] - 2026-11-08

The first release on npm: `npm install -g frotztrace`. Everything from 0.0.2 and 0.0.3, built on `@frotzinc/zcode` 0.5.0, `@frotzinc/zmachine` 0.2.0 and `@frotzinc/inform6-wasm` 0.1.1.

### Changed
- No longer private; `publish.sh trace-cli` releases it, with a smoke test that compiles a game and stops at an action breakpoint, with the debug file and without.

## [0.0.3] - 2026-11-08

The Inform layer (frotztrace Phase 3).

### Added
- `--break action:Take` (stops when the library begins the action, with noun and second set), `--break line:story.inf:42` (with `--symbols`), `--break text:"Taken."`, and `--if <condition>` on the `--break` before it.
- `--watch 'score, lantern in player'` prints each change, turn by turn.
- `--save-at 3 out.qzl` types SAVE after turn 3 and writes the story's own save file; `--quetzal in.qzl` reads one: where it stopped, the named stack and the globals.
- Without `--symbols`, names are worked out from the story (compiling its library with `@frotzinc/inform6-wasm` to compare, a second or two) when something needs them. The stack names every routine and local, and shows each frame's source line with `--symbols`.

## [0.0.2] - 2026-11-08

The first working version (frotztrace Phase 1), not yet published: npm holds 0.0.1, the name's placeholder.

### Added
- `frotztrace story --script file` plays a command script under `@frotzinc/zmachine`'s `Debugger`, turn by turn.
- `--trace calls|all` prints every call and return (and with `all`, writes, branches and input), indented by depth.
- `--break <routine>` (a name from `--symbols`, a txd name, or an address) stops at the routine and prints the stack, innermost first, with each frame's locals (named, with `--symbols`).
- `--seed N`; exit codes 0 (done), 1 (fault or usage), 2 (breakpoint), 3 (quit early).
