# frotztrace (the CLI)

A debugger for Z-machine story files, on the command line: play a command script under observation, trace every call, and stop on a routine with its stack. Part of [frotztrace](https://frotztrace.frotzinc.com), from [frotz, Inc.](https://frotzinc.com). GPL-3.0-or-later.

> **In development** (frotztrace Phase 1 of 5): not on npm yet beyond the name; `frotztrace` 0.1.0 is published when the debugger is finished.

```sh
frotztrace game.z5 --script walk.txt                      # play it, turn by turn
frotztrace game.z5 --script walk.txt --trace calls        # with every call and return, by depth
frotztrace game.z5 --script walk.txt --break R0097        # stop there and print the stack
frotztrace game.z5 --script walk.txt --symbols gameinfo.dbg --break ScoreTimer
```

The script is `zmachine-run`'s: one command per line, `!` comments, `[timeout]` for a timed read running out, `[key x]` for a key press. `--break` takes a name from `--symbols`, a txd name (`R0097`), or an address (`0x27f8`), and may be given more than once. `--seed N` (default 1) makes the run repeatable; it is anyway, given the same seed.

```
[breakpoint] R0097 · turn 1 · instruction 7627 · pc a4bd
Stack (innermost first):
  #0  R0097 (a4bc)  at a4bd  L00=4496
  #1  R0052 (6364)  at 63cd  L00=4127 L01=4496 L02=0 L03=64 …
  …
  #8  (main)  at 27f6
```

**Exit codes, for CI:** 0 the script ran to the end; 1 the story faulted, or a usage error; 2 a breakpoint was hit; 3 the story quit before the script ended.

Built on [`@frotzinc/zmachine`](../zmachine)'s `Debugger` and [`@frotzinc/zcode`](../zcode). Coming (docs/frotztrace-design.md §10): breakpoints on actions (`--break action:Take`), lines, printed text and property writes, `--watch`, `--save-at`, and rewind.
