/**
 * The Debugger (docs/18-frotztrace-phase-1-debugger.md): a machine run under observation. It owns
 * the machine (so its hooks are there from the first instruction) and runs its own loop over
 * step(), so it can stop between any two instructions without the interpreter knowing about
 * breakpoints. Every stop is between instructions, before the one at the PC runs.
 */
import { Machine } from './machine.js'
import type { Fault, Frame, Hooks, InputValue, MachineOptions, StopReason } from './types.js'

export interface DebuggerOptions extends MachineOptions {
  /** Events kept in the trace's ring buffer (default 10 000), and which kinds (default calls and returns). */
  trace?: { capacity?: number; kinds?: TraceKind[] }
  /** Instructions a control call runs when it's given no budget (default 10 000 000). */
  budget?: number
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
  clear(): void {
    this.buf.length = 0
    this.start = 0
  }
}

const DEFAULT_BUDGET = 10_000_000

export class Debugger {
  private m!: Machine
  private readonly options: DebuggerOptions
  private readonly bps: Breakpoint[] = []
  private nextId = 1
  private readonly inputs: InputValue[] = []
  private readonly ring: Ring
  /** A routine breakpoint the last call hit, reported once the call instruction has finished. */
  private routineHit: Breakpoint | null = null
  private pauseRequested = false
  /** The PC of the last stop: a breakpoint there doesn't fire again until the machine moves. */
  private restingAt: number | null = null

  private constructor(options: DebuggerOptions) {
    this.options = options
    this.ring = new Ring(Math.max(1, options.trace?.capacity ?? 10_000), options.trace?.kinds ?? ['call', 'return'])
  }

  /** A debugger over a new machine for `story`, or why the machine can't run it. Never throws. */
  static create(story: Uint8Array, options: DebuggerOptions): Debugger | { fault: Fault } {
    const d = new Debugger(options)
    const m = Machine.create(story, { ...options, hooks: d.hooks(options.hooks) })
    if (!(m instanceof Machine)) return m
    d.m = m
    return d
  }

  /** The machine being debugged: read its state freely; drive it only through the debugger. */
  get machine(): Machine {
    return this.m
  }

  get breakpoints(): readonly Breakpoint[] {
    return this.bps
  }

  get inputLog(): readonly InputValue[] {
    return this.inputs
  }

  get trace(): TraceBuffer {
    return this.ring
  }

  // ── hooks ─────────────────────────────────────────────────────────────────

  /** The debugger's hooks, then the host's. */
  private hooks(host: Hooks | undefined): Hooks {
    const at = () => this.m?.state.counters.instructions ?? 0
    const depth = () => (this.m ? this.m.state.frames.length - 1 : 0)
    const want = (k: TraceKind) => this.ring.kinds.has(k)
    return {
      call: (routine, args, frame) => {
        if (want('call')) this.ring.push({ kind: 'call', at: at(), routine, args: [...args], depth: depth() })
        if (!this.routineHit) this.routineHit = this.bps.find(b => b.enabled && b.kind === 'routine' && b.routine === routine) ?? null
        host?.call?.(routine, args, frame)
      },
      return: (value, frame: Frame) => {
        // The frame has been popped: its depth was one more than what's left.
        if (want('return')) this.ring.push({ kind: 'return', at: at(), routine: frame.routine, value, depth: depth() + 1 })
        host?.return?.(value, frame)
      },
      write: (address, value, size) => {
        if (want('write')) this.ring.push({ kind: 'write', at: at(), address, value, size })
        host?.write?.(address, value, size)
      },
      branch: (address, taken) => {
        if (want('branch')) this.ring.push({ kind: 'branch', at: at(), address, taken })
        host?.branch?.(address, taken)
      },
      print: (text, window) => {
        if (want('print')) this.ring.push({ kind: 'print', at: at(), text, window })
        host?.print?.(text, window)
      },
      input: (kind, value) => {
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

  /** Until a breakpoint, input, a quit or a fault. */
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

  /** Until the story asks for input (breakpoints still stop it). */
  runToInput(budget?: number): DebugStop {
    return this.run(budget)
  }

  /**
   * Until counters.turns reaches `turn` and the story asks for a line. A turn needs input: if the
   * story asks for a line before then, that stop is returned, and the host resumes and calls again.
   * (Phase 2 replays from the input log, so it can go to an earlier turn without being given input.)
   */
  runToTurn(turn: number, budget?: number): DebugStop {
    // Every turn ends at a request for a line, so this is run(): the difference is in what the host
    // does with an input-line stop before `turn` (resume and call again). Kept as its own call so
    // Phase 2 can replay to an earlier turn from the input log behind the same name.
    void turn
    return this.run(budget)
  }


  /** Until the PC is `address` (breakpoints on the way still stop it). */
  continueTo(address: number, budget?: number): DebugStop {
    return this.loop(budget, () => this.m.state.pc === address)
  }

  /** Give the story what it's waiting for, as Machine.resume does; logged for replay. */
  resume(input: InputValue): Fault | null {
    const fault = this.m.resume(input)
    if (!fault) this.inputs.push(input)
    return fault
  }

  /**
   * Step until `done` (checked after each instruction) says so, a breakpoint, a pause, a machine
   * stop, or the budget. `stepping`: the first instruction runs even if a breakpoint is on it.
   */
  private loop(budget: number | undefined, done: () => boolean, stepping = false): DebugStop {
    const m = this.m
    const limit = budget ?? this.options.budget ?? DEFAULT_BUDGET
    for (let n = 0; n < limit; n++) {
      if (this.pauseRequested) {
        this.pauseRequested = false
        return this.stopped({ kind: 'paused' })
      }
      const pc = m.state.pc
      const skip = n === 0 && (stepping || pc === this.restingAt)
      if (!skip && !m.state.input.pending) {
        const bp = this.bps.find(b => b.enabled && b.kind === 'address' && b.address === pc)
        if (bp) {
          bp.hits++
          return this.stopped({ kind: 'breakpoint', breakpoint: bp })
        }
      }
      const s = m.step()
      if (this.routineHit) {
        const bp = this.routineHit
        this.routineHit = null
        // A routine that faults on entry reports the fault, not the breakpoint.
        if (!s || s.kind !== 'fault') {
          bp.hits++
          return this.stopped({ kind: 'breakpoint', breakpoint: bp })
        }
      }
      if (s) return this.stopped(s)
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
