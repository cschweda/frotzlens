# frotztrace — Phase 1: The Debugger's Foundations

**Document 18 · frotztrace Phase 1** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md) §5.3, §10)
**Deliverable:** a `Debugger` in `@frotzinc/zmachine` (additive; a minor release, 0.2.0), and the `frotztrace` CLI in `packages/trace-cli`, which plays a script, traces calls, and stops on a routine and prints its stack. Every existing `zmachine` and frotzplay suite stays green.

> **Status: built** (2026-11-08). Chris approved the types below; exit codes 0/1/2/3 and publishing only `zmachine` 0.2.0 now (the CLI at Phase 5) were taken as proposed. Two changes in the building: the CLI's debug-file flag is `--symbols`, as the frotzlens CLI's is, and `runToTurn` behaves as `run` until Phase 2 can replay to a turn from the input log (a turn needs input, which only the host or a replay can give).

---

## 1. What the interpreter already gives (read, not assumed)

- `step()` runs one instruction and returns a `StopReason` or null; `run(budget)` loops over it. The debugger runs **its own loop over `step()`**, so it can stop between any two instructions without the interpreter knowing about breakpoints.
- `Hooks`: `call(routine, args, frame)` (after the frame is pushed; `routine` is the unpacked address), `return(value, frame)`, `write(address, value, size)` (every byte and word write to memory, globals included; locals and the stack are not memory), `branch(at, taken)`, `print(text, window)`, `input(kind, value)`.
- `state.counters`: `instructions` (incremented before each instruction runs) and `turns` (incremented when a line of input is finished).
- `state.frames`: `returnPC`, `locals`, `evalStack`, `storeVariable`, `argCount`, `interrupt?`. **A frame doesn't record which routine it belongs to.**

## 2. One additive change to the interpreter

**`Frame.routine?: number`**: the routine's address, set by `callRoutine` (and left undefined for the main routine's frame, which v1–5 start without a routine header). It's what a stack needs ("frame 3 is `ScoreTimer`") and what survives `snapshot()`/`fromSnapshot()` (Phase 2's rewind), which a debugger-kept parallel stack would not.

Why it's safe, against the rules in the design (§5.2): an optional field, so no signature or meaning changes; a `MachineSnapshot` version 1 written by 0.1.x restores (its frames just lack it); frotzplay never reads it; it costs one property write per call. The Quetzal writer ignores it (Quetzal has no such field), so save files are byte for byte the same; the saves tests prove it. Frames restored from a Quetzal save don't have it.

**Turn boundaries need no hook** (open question 7, decided): the debugger sees every `input-line` stop and every `resume()`, which is where a turn begins and ends, and `counters.turns` already counts them.

Nothing else changes in `Machine`.

## 3. The proposed public types

```ts
/** A debugger over a machine it creates (so its hooks are there from the first instruction). */
export class Debugger {
  static create(story: Uint8Array, options: DebuggerOptions): Debugger | { fault: Fault }

  /** The machine being debugged: read its `state` freely; drive it only through the debugger. */
  readonly machine: Machine

  // ── control: each runs until a stop, or until `budget` instructions have run ──
  // (the budget lets a host — the app's worker — run in slices and stay responsive)
  run(budget?: number): DebugStop               // until a breakpoint, input, quit or fault
  stepInstruction(): DebugStop                 // exactly one instruction
  stepOver(budget?: number): DebugStop         // one instruction; a call runs to its return
  stepOut(budget?: number): DebugStop          // until the current routine returns
  runToInput(budget?: number): DebugStop       // until the story asks for input (breakpoints still stop it)
  runToTurn(turn: number, budget?: number): DebugStop  // until `counters.turns` reaches `turn` and input is wanted
  continueTo(address: number, budget?: number): DebugStop
  /** Stop at the next instruction boundary (a host calls this between slices). */
  pause(): void

  /** Give the story what it's waiting for; logged, for replay (Phase 2). Same contract as Machine.resume. */
  resume(input: InputValue): Fault | null
  readonly inputLog: readonly InputValue[]

  // ── breakpoints ──
  addBreakpoint(spec: BreakpointSpec): Breakpoint
  removeBreakpoint(id: number): void
  setBreakpointEnabled(id: number, enabled: boolean): void
  readonly breakpoints: readonly Breakpoint[]

  // ── what's there now ──
  stack(): StackFrame[]                         // innermost last, as state.frames
  readonly trace: TraceBuffer
}

export interface DebuggerOptions extends MachineOptions {
  /** Events kept in the trace ring buffer (default 10 000) and which kinds (default calls and returns). */
  trace?: { capacity?: number; kinds?: TraceKind[] }
  /** Instructions per control call when no budget is given (default 10 000 000). */
  budget?: number
}

/** Why a control call returned: the machine's own reasons, plus the debugger's. */
export type DebugStop =
  | StopReason                                            // input-line, input-char, save, restore, budget, quit, fault
  | { kind: 'breakpoint'; breakpoint: Breakpoint }        // at breakpoint.address, before it runs
  | { kind: 'step' }                                      // a step finished
  | { kind: 'paused' }

/** Phase 1 builds `address` and `routine`; the others arrive in Phase 3 (§5.3), with `condition`. */
export type BreakpointSpec =
  | { kind: 'address'; address: number }                  // stops before the instruction at `address` runs
  | { kind: 'routine'; routine: number }                  // stops at the routine's first instruction, every call

export type Breakpoint = BreakpointSpec & { id: number; enabled: boolean; hits: number }

export interface StackFrame {
  /** The routine's address (undefined for the main routine's frame). */
  routine?: number
  /** Where this frame is: the current PC for the innermost frame, else the next frame's return address. */
  pc: number
  locals: number[]
  evalStack: number[]
  argCount: number
}

export type TraceKind = 'call' | 'return' | 'write' | 'print' | 'input' | 'branch'
export type TraceEvent =
  | { kind: 'call'; at: number; routine: number; args: number[]; depth: number }
  | { kind: 'return'; at: number; routine?: number; value: number; depth: number }
  | { kind: 'write'; at: number; address: number; value: number; size: 1 | 2 }
  | { kind: 'print'; at: number; text: string; window: 0 | 1 }
  | { kind: 'input'; at: number; value: string | number }
  | { kind: 'branch'; at: number; address: number; taken: boolean }
// `at` is counters.instructions when it happened: the trace's clock, and Phase 2's rewind target.

export interface TraceBuffer {
  readonly capacity: number
  kinds: Set<TraceKind>
  events(): TraceEvent[]   // oldest first
  clear(): void
}
```

**Rules the implementation keeps.** A stop is always *between* instructions, before the one at the PC runs. A breakpoint at the PC the debugger is resting on doesn't fire again until the machine moves (so Continue from a breakpoint isn't stuck). `stepOver`/`stepOut` count frames, not decode instructions, so they're right for every call opcode, interrupts and `@throw` alike. A routine breakpoint fires from the `call` hook, so it catches every call, including indirect ones. The trace and the breakpoints cost nothing measurable when unused: the hooks are the debugger's own, and frotzplay doesn't create a debugger. Host hooks passed in `options.hooks` still run, after the debugger's.

## 4. The CLI (`packages/trace-cli`, `frotztrace`, GPL)

```
frotztrace game.z5 [--script walk.txt] [--seed N] [--symbols gameinfo.dbg]
                   [--trace calls|all] [--break <routine|0xADDR|name>]...
```

- Plays the script as `zmachine-run` does (same format: one command per line, `!` comments, `[timeout]`, `[key x]`), printing each turn.
- `--trace calls` prints each call and return, indented by depth: `  ScoreTimer(1, 0)` / `  ← 1`.
- `--break` stops at the first hit and prints the stack, innermost first: routine (name from `--symbols`, else txd's `R0012` name via `@frotzinc/zcode`), PC, locals. Names from the debug file are Phase 3's job in full; Phase 1 uses them only for `--break` and the stack, since `zcode` already reads them.
- **Exit codes, for CI:** `0` the script ran to the end; `1` the story faulted, or the CLI was used wrongly; `2` a breakpoint was hit; `3` the story quit before the script ended.

## 5. Tests

- **Debugger unit tests** on hand-assembled routines (`test/asm.ts`): an address breakpoint stops before the instruction; a routine breakpoint stops at the first instruction of every call; step over a call lands after it; step out lands in the caller after the call; `runToTurn`/`runToInput`; `pause` between slices; a disabled breakpoint doesn't fire; hits are counted; resuming from a breakpoint goes on.
- **On the samples:** a routine breakpoint in Dark Cellar stops, and its stack's routines are the ones the call trace shows.
- **Unchanged behavior:** every `zmachine` suite (opcodes, walkthroughs, differential, conformance, saves, timed, random) and frotzplay's (unit, contract, export) pass; a debugger with no breakpoints plays every walkthrough to the same transcript as `play()`.
- **CLI:** `frotztrace dark-cellar.z5 --script walk.txt --break <routine>` exits 2 and prints the stack; with no break, exits 0 with the same transcript as `zmachine-run`.

## 6. Questions for Chris

1. **The types above** (and `Frame.routine?` as the one change to `Machine`): approve, or change?
2. **Exit codes** (§4): fine as 0/1/2/3?
3. **Release:** `zmachine` 0.2.0 and `frotztrace` 0.1.0 on npm at the end of this phase, or hold the CLI until Phase 3 (when `--break action:Take` works)? The plan says publish `frotztrace` 0.1.0 at Phase 5; I'd keep that and publish only `zmachine` 0.2.0 now.
