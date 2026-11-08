# frotztrace — Phase 2: Time

**Document 19 · frotztrace Phase 2** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md) §4.2, §5.3 "Rewind", §10)
> **Status: built** (2026-11-08). One rule was settled while building (§2): at a count where input was given, `goToInstruction`/`stepBack` land after it (the latest state at that count), and `goToTurn` lands at the prompt before it.

**Deliverable:** the `Debugger` steps backwards: checkpoints at every turn boundary and every N instructions, deterministic replay from the input log, `stepBack` / `goToInstruction` / `goToTurn`, and the Timeline's data. Done when the determinism, rewind and snapshot-compatibility tests pass.

---

## 1. How it works (settled in the design, §5.3)

Rewind is **restore and re-run**. The debugger keeps checkpoints (a `MachineSnapshot` and what it shares, below) and the log of every input with the instruction count it was given at. To go to instruction *n*: restore the latest checkpoint at or before *n*, then step forward to *n*, giving each logged input at the count it was first given. Random is seeded and its state is in the snapshot, timed input's interval running out is a logged input, and save/restore results are logged too, so the replay is exact.

**Checkpoints:** instruction 0; every input stop (a turn boundary, or a key press); and every `checkpointEvery` instructions within a turn (default 100 000; §4). At most `maxCheckpoints` (default 5 000) are kept; past that the oldest within-turn checkpoint goes (turn boundaries stay), so a long session costs a slower replay, not unbounded memory.

**What a checkpoint shares instead of copying.** `MachineSnapshot` deep-copies the lower window's runs (everything printed since the last erase) and the undo ring (`save_undo` states, up to 10 copies of dynamic memory). Copied at every turn, a long session would grow quadratically. Neither changes once made: a run is only appended to while it's the last, and an undo entry is cloned when restored, never mutated. So a checkpoint keeps the run array's prefix and the undo entries by reference, copies only the last run, and puts both back on restore. Dynamic memory (at most 64 KB) is copied per checkpoint.

## 2. Time, as the user sees it

- **Step back** goes back one instruction (`stepBack(n)` for *n*); the Timeline goes to any instruction or turn.
- **Going back doesn't lose the future.** The furthest point reached is the *head*. Behind the head, running forward replays the logged future: inputs are given again automatically, at the same counts, and breakpoints fire as usual. At the head, the debugger is live again and waits for input as before.
- **Changing the past starts a new timeline.** Behind the head, at a point where the story is waiting for input that the log has an answer for, giving a *different* input (or the same one: `resume()` is the act of answering) cuts the future from that point: its log entries, checkpoints and turn marks go, and the head moves back to here. This is how every time-travel debugger behaves; it's the one rule here that wasn't written down in the design.
- **Going somewhere is silent.** `goToInstruction`/`goToTurn`/`stepBack` don't fire breakpoints, count hits, or add to the trace on the way; trace events after the target are dropped, since they're the future now.

## 3. The additions to the Debugger (additive to Phase 1's approved types)

```ts
class Debugger {
  stepBack(n?: number): DebugStop                 // to counters.instructions - n (default 1); 'step'
  goToInstruction(n: number): DebugStop           // anywhere in [0, head]; 'step', or a fault
  goToTurn(turn: number): DebugStop               // to where turn `turn` asked for its line (0: the first prompt)
  runToTurn(turn: number, budget?: number): DebugStop  // now: goToTurn if the turn's been reached, else run
  timeline(): Timeline

  /** Changed in Phase 2 (unpublished, so no compatibility to keep): each input with when it was given. */
  readonly inputLog: readonly LoggedInput[]
}

interface DebuggerOptions { checkpointEvery?: number; maxCheckpoints?: number }

interface LoggedInput { at: number; input: InputValue }   // at: counters.instructions when given
interface Timeline {
  /** The instruction count now, and the furthest reached (behind it, the future replays). */
  current: number
  head: number
  /** Each turn: where its line was asked for, and what was typed (none yet for the turn at the head). */
  turns: { turn: number; instruction: number; line?: string }[]
  /** Where checkpoints are: the app draws them on the scrubber. */
  checkpoints: number[]
}
```

## 4. The checkpoint interval (open question 2, settled)

Measured on the big fixtures' walkthroughs (Node 22, an M-series Mac; 200 jumps to random instructions, then 50 single steps back), the interpreter runs about 15 million instructions a second, so replaying even the longest turn takes milliseconds:

| Fixture | Instructions, turns | Every 100 000: checkpoints, memory | Go to an instruction: average, worst | Step back: worst |
|---|---|---|---|---|
| architect-legacy.z5 | 1 277 355, 49 | 62, 0.5 MB | 0.9 ms, 3.0 ms | 1.4 ms |
| mingus-1.z5 | 1 952 776, 71 | 91, 0.9 MB | 1.0 ms, 5.4 ms | 0.8 ms |
| mingus-2.z8 | 2 057 680, 75 | 96, 0.9 MB | 0.9 ms, 4.2 ms | 2.2 ms |

Every 25 000 halves the worst case and doubles the memory; turn boundaries alone are within 7 ms. **The default stays 100 000**: every jump far under the 100 ms that feels instant, under 1 MB for a whole game. (A browser is slower than Node, and a worker adds a message's round trip; still well inside it.)

## 5. Tests

- **Determinism:** the same story, script and seed twice → identical traces (every kind) and identical final snapshots.
- **Rewind:** run to instruction N and take `snapshot()`; run on across several turns; `goToInstruction(N)` → `snapshot()` equal to the first, every field (memory, PC, frames, random, screen with its runs, input, streams, counters, undo).
- **Step back** one instruction at a time from the middle of a turn, and across a turn boundary into the previous turn.
- **Forward in the past** replays the future: back to turn 2, run → reaches the head's state exactly, inputs fed; a breakpoint on the way fires; at the head it waits for input.
- **A new timeline:** back to turn 2, a different command → the log, checkpoints and turns after it are gone, and the story goes on from the new command.
- **Silence:** a goTo past a breakpoint doesn't stop or count; the trace has no events after the target.
- **The timeline's data:** turns, their lines, head, current, checkpoints.
- **Snapshot compatibility:** a `MachineSnapshot` without `Frame.routine` (0.1.x) still restores (Phase 1's test, kept).
- On the samples: the Dark Cellar walkthrough, rewound to every turn in turn, gives each turn's state as first played.
