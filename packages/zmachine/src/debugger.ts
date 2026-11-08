/**
 * The Debugger (docs/18-frotztrace-phase-1-debugger.md): a machine run under observation. It owns
 * the machine (so its hooks are there from the first instruction) and runs its own loop over
 * step(), so it can stop between any two instructions without the interpreter knowing about
 * breakpoints. Every stop is between instructions, before the one at the PC runs.
 */
import { Machine } from './machine.js'
import type { Fault, Frame, Hooks, InputValue, MachineOptions, MachineSnapshot, Snapshot, StopReason, StyledRun } from './types.js'

export interface DebuggerOptions extends MachineOptions {
  /** Events kept in the trace's ring buffer (default 10 000), and which kinds (default calls and returns). */
  trace?: { capacity?: number; kinds?: TraceKind[] }
  /** Instructions a control call runs when it's given no budget (default 10 000 000). */
  budget?: number
  /** A checkpoint every this many instructions within a turn, for stepping back (default 100 000; docs/19 §4). */
  checkpointEvery?: number
  /** Checkpoints kept at most; past it, within-turn ones go first (default 5 000). */
  maxCheckpoints?: number
}

/** An input the debugger passed on, and when: `at` is counters.instructions when it was given. */
export interface LoggedInput {
  at: number
  input: InputValue
}

/** Where time is: for the Timeline. */
export interface Timeline {
  /** The instruction count now. */
  current: number
  /** The furthest reached on this timeline; behind it, running forward replays the logged inputs. */
  head: number
  /** Each turn: where its line was asked for, and the line given (none for a turn still waiting). */
  turns: { turn: number; instruction: number; line?: string }[]
  /** Where the checkpoints are. */
  checkpoints: number[]
}

/** Why a control call returned: the machine's own reasons, and the debugger's. */
export type DebugStop =
  | StopReason
  /** At `breakpoint`, before the instruction at the PC runs. */
  | { kind: 'breakpoint'; breakpoint: Breakpoint }
  /** A step (into, over, out, or to an address) finished. */
  | { kind: 'step' }
  /** pause() was called. */
  | { kind: 'paused' }

/** Phase 1: address and routine. Line, action, text, write and attribute breakpoints, and conditions, come in Phase 3. */
export type BreakpointSpec =
  /** Stops before the instruction at `address` runs. */
  | { kind: 'address'; address: number }
  /** Stops at the routine's first instruction, on every call to it. `routine` is its address (its header). */
  | { kind: 'routine'; routine: number }

export type Breakpoint = BreakpointSpec & { id: number; enabled: boolean; hits: number }

export interface StackFrame {
  /** The routine's address (undefined for the main routine's frame). */
  routine?: number
  /** Where the frame is: the PC for the innermost frame, else the address its call returns to. */
  pc: number
  locals: number[]
  evalStack: number[]
  argCount: number
}

export type TraceKind = 'call' | 'return' | 'write' | 'print' | 'input' | 'branch'

/** `at` is counters.instructions when it happened: the trace's clock. `depth` counts frames, the main routine's being 0. */
export type TraceEvent =
  | { kind: 'call'; at: number; routine: number; args: number[]; depth: number }
  | { kind: 'return'; at: number; routine?: number; value: number; depth: number }
  | { kind: 'write'; at: number; address: number; value: number; size: 1 | 2 }
  | { kind: 'print'; at: number; text: string; window: 0 | 1 }
  | { kind: 'input'; at: number; value: string | number }
  | { kind: 'branch'; at: number; address: number; taken: boolean }

export interface TraceBuffer {
  readonly capacity: number
  /** Which kinds are recorded; change it any time. */
  kinds: Set<TraceKind>
  /** Oldest first. */
  events(): TraceEvent[]
  clear(): void
}

class Ring implements TraceBuffer {
  private readonly buf: TraceEvent[] = []
  private start = 0
  kinds: Set<TraceKind>
  constructor(readonly capacity: number, kinds: TraceKind[]) {
    this.kinds = new Set(kinds)
  }
  push(e: TraceEvent): void {
    if (this.buf.length < this.capacity) this.buf.push(e)
    else {
      this.buf[this.start] = e
      this.start = (this.start + 1) % this.capacity
    }
  }
  events(): TraceEvent[] {
    return [...this.buf.slice(this.start), ...this.buf.slice(0, this.start)]
  }
  /** Drop the events after `at`: they're the future now. */
  truncateAfter(at: number): void {
    const keep = this.events().filter(e => e.at <= at)
    this.clear()
    for (const e of keep) this.push(e)
  }
  clear(): void {
    this.buf.length = 0
    this.start = 0
  }
}

const DEFAULT_BUDGET = 10_000_000
const DEFAULT_EVERY = 100_000
const DEFAULT_MAX_CHECKPOINTS = 5_000

/**
 * A point to rewind to: the machine's snapshot, with the lower window's runs and the undo ring
 * shared instead of copied (docs/19 §1). Runs before the last are never changed again, and undo
 * entries are cloned when restored, so keeping them by reference is safe.
 */
interface Checkpoint {
  at: number
  /** At an input stop: kept when checkpoints are thinned. */
  boundary: boolean
  snap: MachineSnapshot
  runs: StyledRun[]
  runsLength: number
  last: StyledRun | null
  undo: Snapshot[]
}

export class Debugger {
  private m!: Machine
  private readonly story: Uint8Array
  private readonly options: DebuggerOptions
  private readonly machineHooks: Hooks
  private readonly bps: Breakpoint[] = []
  private nextId = 1
  private readonly log: LoggedInput[] = []
  /** The next log entry to give when the story waits for it (behind the head); log.length when live. */
  private cursor = 0
  private readonly ring: Ring
  private readonly checkpoints: Checkpoint[] = []
  /** Where each turn asked for its line. */
  private marks: { turn: number; instruction: number }[] = []
  private head = 0
  /** Replaying to a point: no breakpoints, no trace, no host hooks, no pauses. */
  private silent = false
  /** A routine breakpoint the last call hit, reported once the call instruction has finished. */
  private routineHit: Breakpoint | null = null
  private pauseRequested = false
  /** The PC of the last stop: a breakpoint there doesn't fire again until the machine moves. */
  private restingAt: number | null = null

  private constructor(story: Uint8Array, options: DebuggerOptions) {
    this.story = story.slice()
    this.options = options
    this.ring = new Ring(Math.max(1, options.trace?.capacity ?? 10_000), options.trace?.kinds ?? ['call', 'return'])
    this.machineHooks = this.hooks(options.hooks)
  }

  /** A debugger over a new machine for `story`, or why the machine can't run it. Never throws. */
  static create(story: Uint8Array, options: DebuggerOptions): Debugger | { fault: Fault } {
    const d = new Debugger(story, options)
    d.silent = true // the machine writing its header isn't the story running
    const m = Machine.create(story, { ...options, hooks: d.machineHooks })
    d.silent = false
    if (!(m instanceof Machine)) return m
    d.m = m
    d.checkpoint(true)
    return d
  }

  /** The machine being debugged: read its state freely; drive it only through the debugger. Rewinding replaces it. */
  get machine(): Machine {
    return this.m
  }

  get breakpoints(): readonly Breakpoint[] {
    return this.bps
  }

  get inputLog(): readonly LoggedInput[] {
    return this.log
  }

  get trace(): TraceBuffer {
    return this.ring
  }

  // ── hooks ─────────────────────────────────────────────────────────────────

  /** The debugger's hooks, then the host's; none of them while replaying silently. */
  private hooks(host: Hooks | undefined): Hooks {
    const at = () => this.m?.state.counters.instructions ?? 0
    const depth = () => (this.m ? this.m.state.frames.length - 1 : 0)
    const want = (k: TraceKind) => !this.silent && this.ring.kinds.has(k)
    return {
      call: (routine, args, frame) => {
        if (this.silent) return
        if (want('call')) this.ring.push({ kind: 'call', at: at(), routine, args: [...args], depth: depth() })
        if (!this.routineHit) this.routineHit = this.bps.find(b => b.enabled && b.kind === 'routine' && b.routine === routine) ?? null
        host?.call?.(routine, args, frame)
      },
      return: (value, frame: Frame) => {
        if (this.silent) return
        // The frame has been popped: its depth was one more than what's left.
        if (want('return')) this.ring.push({ kind: 'return', at: at(), routine: frame.routine, value, depth: depth() + 1 })
        host?.return?.(value, frame)
      },
      write: (address, value, size) => {
        if (this.silent) return
        if (want('write')) this.ring.push({ kind: 'write', at: at(), address, value, size })
        host?.write?.(address, value, size)
      },
      branch: (address, taken) => {
        if (this.silent) return
        if (want('branch')) this.ring.push({ kind: 'branch', at: at(), address, taken })
        host?.branch?.(address, taken)
      },
      print: (text, window) => {
        if (this.silent) return
        if (want('print')) this.ring.push({ kind: 'print', at: at(), text, window })
        host?.print?.(text, window)
      },
      input: (kind, value) => {
        if (this.silent) return
        if (want('input')) this.ring.push({ kind: 'input', at: at(), value })
        host?.input?.(kind, value)
      },
    }
  }

  // ── breakpoints ───────────────────────────────────────────────────────────

  addBreakpoint(spec: BreakpointSpec): Breakpoint {
    const bp = { ...spec, id: this.nextId++, enabled: true, hits: 0 } as Breakpoint
    this.bps.push(bp)
    return bp
  }

  removeBreakpoint(id: number): void {
    const i = this.bps.findIndex(b => b.id === id)
    if (i >= 0) this.bps.splice(i, 1)
  }

  setBreakpointEnabled(id: number, enabled: boolean): void {
    const b = this.bps.find(x => x.id === id)
    if (b) b.enabled = enabled
  }

  // ── control ───────────────────────────────────────────────────────────────

  /** Stop at the next instruction boundary: the next control call returns `paused` at once. */
  pause(): void {
    this.pauseRequested = true
  }

  /** Until a breakpoint, input, a quit or a fault. Behind the head, logged input is given again on the way. */
  run(budget?: number): DebugStop {
    return this.loop(budget, () => false)
  }

  /** Exactly one instruction (breakpoints don't stop it; a call it makes to a routine with a breakpoint does). */
  stepInstruction(): DebugStop {
    return this.loop(1, () => true, true)
  }

  /** One instruction; if it calls a routine, run until that call returns. */
  stepOver(budget?: number): DebugStop {
    const depth = this.m.state.frames.length
    return this.loop(budget, () => this.m.state.frames.length <= depth, true)
  }

  /** Until the current routine returns to its caller. */
  stepOut(budget?: number): DebugStop {
    const depth = this.m.state.frames.length
    return this.loop(budget, () => this.m.state.frames.length < depth, true)
  }

  /** Until the story asks for input it hasn't been given before (breakpoints still stop it). */
  runToInput(budget?: number): DebugStop {
    return this.run(budget)
  }

  /** To where turn `turn` asked for its line: back in time if it's been reached, else run toward it. */
  runToTurn(turn: number, budget?: number): DebugStop {
    return this.marks.some(m => m.turn === turn) ? this.goToTurn(turn) : this.run(budget)
  }

  /** Until the PC is `address` (breakpoints on the way still stop it). */
  continueTo(address: number, budget?: number): DebugStop {
    return this.loop(budget, () => this.m.state.pc === address)
  }

  /**
   * Give the story what it's waiting for, as Machine.resume does; logged for replay. Behind the
   * head, this starts a new timeline: the future after this point is dropped (docs/19 §2).
   */
  resume(input: InputValue): Fault | null {
    const here = this.m.state.counters.instructions
    if (this.cursor < this.log.length) this.forget(here)
    const fault = this.m.resume(input)
    if (!fault) {
      this.log.push({ at: here, input })
      this.cursor = this.log.length
    }
    return fault
  }

  // ── time ──────────────────────────────────────────────────────────────────

  /** Back `n` instructions (default 1). */
  stepBack(n = 1): DebugStop {
    return this.goToInstruction(this.m.state.counters.instructions - Math.max(0, n))
  }

  /**
   * To instruction `n` (clamped to [0, head]), silently: no breakpoints, no trace, no host hooks on
   * the way, and the trace's events after `n` are dropped. At a count where the story was given
   * input, this lands after the input was given (the latest state at that count); goToTurn lands
   * before it, at the prompt. Returns `step`, or a fault (which a replay of a run that happened
   * can't meet).
   */
  goToInstruction(n: number): DebugStop {
    return this.goTo(n, true)
  }

  /** To where turn `turn` asked for its line (0: the first prompt), still waiting for it. A turn not reached yet: to the head. */
  goToTurn(turn: number): DebugStop {
    const mark = this.marks.find(m => m.turn === turn)
    return this.goTo(mark ? mark.instruction : this.head, false)
  }

  private goTo(n: number, afterInput: boolean): DebugStop {
    const target = Math.max(0, Math.min(Math.floor(n), this.head))
    const now = this.m.state.counters.instructions
    // Restore when going back, or when a checkpoint lies between here and the target (it's faster than replaying).
    let best: Checkpoint | undefined
    for (const c of this.checkpoints) if (c.at <= target) best = c
    if (target < now || (best && best.at > now) || (target === now && !afterInput && !this.m.state.input.pending)) this.restore(target)
    let s: DebugStop = { kind: 'step' }
    this.silent = true
    try {
      if (this.m.state.counters.instructions < target) s = this.loop(Number.MAX_SAFE_INTEGER, () => this.m.state.counters.instructions >= target, true)
      // At the target with input logged here: give it, if the latest state is wanted.
      const next = this.log[this.cursor]
      if (afterInput && s.kind !== 'fault' && this.m.state.input.pending && next && next.at === this.m.state.counters.instructions) {
        this.cursor++
        const fault = this.m.resume(next.input)
        if (fault) s = { kind: 'fault', fault }
      }
    } finally {
      this.silent = false
    }
    if (s.kind !== 'fault') s = { kind: 'step' }
    this.routineHit = null
    this.ring.truncateAfter(this.m.state.counters.instructions)
    return this.stopped(s)
  }

  timeline(): Timeline {
    const lineAt = new Map<number, string>()
    for (const e of this.log) if ('line' in e.input) lineAt.set(e.at, e.input.line)
    return {
      current: this.m.state.counters.instructions,
      head: this.head,
      turns: this.marks.map(m => {
        const line = lineAt.get(m.instruction)
        return line === undefined ? { ...m } : { ...m, line }
      }),
      checkpoints: this.checkpoints.map(c => c.at),
    }
  }

  /** Take a checkpoint here, unless there is one. */
  private checkpoint(boundary: boolean): void {
    const at = this.m.state.counters.instructions
    const i = this.checkpoints.findIndex(c => c.at >= at)
    if (i >= 0 && this.checkpoints[i]!.at === at) {
      if (boundary) this.checkpoints[i]!.boundary = true
      return
    }
    const s = this.m.state
    const runs = s.screen.lower.runs
    const undo = s.undo
    s.screen.lower.runs = []
    s.undo = []
    let snap: MachineSnapshot
    try {
      snap = this.m.snapshot()
    } finally {
      s.screen.lower.runs = runs
      s.undo = undo
    }
    const cp: Checkpoint = { at, boundary, snap, runs, runsLength: runs.length, last: runs.length ? { ...runs.at(-1)! } : null, undo: [...undo] }
    if (i < 0) this.checkpoints.push(cp)
    else this.checkpoints.splice(i, 0, cp)
    const max = this.options.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS
    while (this.checkpoints.length > max) {
      const j = this.checkpoints.findIndex(c => !c.boundary && c.at !== 0)
      if (j < 0) break
      this.checkpoints.splice(j, 1)
    }
  }

  /** The machine as it was at the latest checkpoint at or before `n`. */
  private restore(n: number): void {
    let cp = this.checkpoints[0]!
    for (const c of this.checkpoints) if (c.at <= n) cp = c
    this.silent = true
    let m: Machine | { fault: Fault }
    try {
      m = Machine.fromSnapshot(this.story, cp.snap, { ...this.options, hooks: this.machineHooks })
    } finally {
      this.silent = false
    }
    // A snapshot of this story always restores to this story.
    if (!(m instanceof Machine)) throw new Error(m.fault.message)
    m.state.screen.lower.runs = cp.last ? [...cp.runs.slice(0, cp.runsLength - 1), { ...cp.last }] : []
    m.state.undo = [...cp.undo]
    this.m = m
    this.cursor = this.log.findIndex(e => e.at >= cp.at)
    if (this.cursor < 0) this.cursor = this.log.length
  }

  /** A new timeline from here: the log, checkpoints and turns after this point go. */
  private forget(here: number): void {
    this.log.length = this.cursor
    for (let i = this.checkpoints.length - 1; i >= 0; i--) if (this.checkpoints[i]!.at > here) this.checkpoints.splice(i, 1)
    this.marks = this.marks.filter(m => m.instruction <= here)
    this.head = here
    this.ring.truncateAfter(here)
  }

  // ── the loop ──────────────────────────────────────────────────────────────

  /**
   * Step until `done` (checked after each instruction) says so, a breakpoint, a pause, a machine
   * stop that the log can't answer, or the budget. `stepping`: the first instruction runs even if a
   * breakpoint is on it.
   */
  private loop(budget: number | undefined, done: () => boolean, stepping = false): DebugStop {
    const limit = budget ?? this.options.budget ?? DEFAULT_BUDGET
    const every = Math.max(1, this.options.checkpointEvery ?? DEFAULT_EVERY)
    for (let n = 0; n < limit; n++) {
      const m = this.m
      if (this.pauseRequested && !this.silent) {
        this.pauseRequested = false
        return this.stopped({ kind: 'paused' })
      }
      const pc = m.state.pc
      const skip = n === 0 && (stepping || pc === this.restingAt)
      if (!skip && !this.silent && !m.state.input.pending) {
        const bp = this.bps.find(b => b.enabled && b.kind === 'address' && b.address === pc)
        if (bp) {
          bp.hits++
          return this.stopped({ kind: 'breakpoint', breakpoint: bp })
        }
      }
      const before = m.state.counters.instructions
      const s = m.step()
      const at = m.state.counters.instructions
      if (at > this.head) this.head = at
      if (at !== before && at % every === 0 && !this.silent) this.checkpoint(false)
      if (this.routineHit) {
        const bp = this.routineHit
        this.routineHit = null
        // A routine that faults on entry reports the fault, not the breakpoint.
        if (!s || s.kind !== 'fault') {
          bp.hits++
          return this.stopped({ kind: 'breakpoint', breakpoint: bp })
        }
      }
      if (s) {
        if (s.kind === 'input-line' || s.kind === 'input-char' || s.kind === 'save' || s.kind === 'restore') {
          if (s.kind === 'input-line' && !this.marks.some(x => x.instruction === at)) this.marks.push({ turn: m.state.counters.turns, instruction: at })
          if (!this.silent || !this.checkpoints.some(c => c.at === at)) this.checkpoint(true)
          if (at !== before && done()) return this.stopped({ kind: 'step' })
          // Behind the head: give the input the story was given here before, and go on.
          const next = this.log[this.cursor]
          if (next && next.at === at) {
            this.cursor++
            const fault = m.resume(next.input)
            if (fault) return this.stopped({ kind: 'fault', fault })
            continue
          }
        }
        return this.stopped(s)
      }
      if (done()) return this.stopped({ kind: 'step' })
    }
    return this.stopped({ kind: 'budget' })
  }

  private stopped(s: DebugStop): DebugStop {
    this.restingAt = this.m.state.pc
    return s
  }

  // ── what's there ──────────────────────────────────────────────────────────

  /** The call stack, innermost last (as state.frames). */
  stack(): StackFrame[] {
    const frames = this.m.state.frames
    return frames.map((f, i) => {
      const next = frames[i + 1]
      const sf: StackFrame = {
        pc: next ? next.returnPC : this.m.state.pc,
        locals: [...f.locals],
        evalStack: [...f.evalStack],
        argCount: f.argCount,
      }
      if (f.routine !== undefined) sf.routine = f.routine
      return sf
    })
  }
}
