/**
 * The Debugger (docs/18-frotztrace-phase-1-debugger.md): a machine run under observation. It owns
 * the machine (so its hooks are there from the first instruction) and runs its own loop over
 * step(), so it can stop between any two instructions without the interpreter knowing about
 * breakpoints. Every stop is between instructions, before the one at the PC runs.
 */
import { parseStory, type StoryFile, type Symbols } from '@frotzinc/zcode'
import { ExprError, evaluateExpr, parseExpr, type Expr } from './expr.js'
import { Machine } from './machine.js'
import type { Fault, Frame, Hooks, InputValue, MachineOptions, MachineSnapshot, Snapshot, StopReason, StyledRun } from './types.js'
import { World, indexNames, type NameIndex } from './world.js'

export interface DebuggerOptions extends MachineOptions {
  /** Events kept in the trace's ring buffer (default 10 000), and which kinds (default calls and returns). */
  trace?: { capacity?: number; kinds?: TraceKind[] }
  /** Instructions a control call runs when it's given no budget (default 10 000 000). */
  budget?: number
  /** A checkpoint every this many instructions within a turn, for stepping back (default 100 000; docs/19 §4). */
  checkpointEvery?: number
  /** Checkpoints kept at most; past it, within-turn ones go first (default 5 000). */
  maxCheckpoints?: number
  /** Names, source lines and Inform's globals (docs/20): zcode's readSymbols, or inferSymbols. */
  symbols?: Symbols
}

/** Inform's parser globals now, by name (docs/20 §2). */
export interface InformState {
  action?: Named
  actor?: Named
  noun?: Named
  second?: Named
}
export interface Named {
  value: number
  name?: string
}

/** Where a statement is in the source. */
export interface SourceLine {
  file: string
  line: number
}

/** An expression watched across stops: its value now, and whether it changed since the previous stop. */
export interface Watch {
  id: number
  expression: string
  value?: number
  error?: string
  changed: boolean
}

/** What the UI lights (docs/20 §2): where the machine is, and what changed since the previous stop. */
export interface MachineView {
  pc: number
  /** The innermost frame's index (0 is the main routine's). */
  frame: number
  changed: {
    addresses: ReadonlySet<number>
    objects: ReadonlySet<number>
    globals: ReadonlySet<number>
  }
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
  /**
   * At `breakpoint`: before the instruction at the PC runs (address, line), or after the one that
   * did what it watches (routine, action, text, write, property, attribute). `detail` says what
   * happened, in words: "action Take (noun: brass lantern)".
   */
  | { kind: 'breakpoint'; breakpoint: Breakpoint; detail?: string }
  /** A step (into, over, out, or to an address) finished. */
  | { kind: 'step' }
  /** pause() was called. */
  | { kind: 'paused' }

/** What a breakpoint watches (docs/18, docs/20), and an optional condition: it fires only when that's true. */
export type BreakpointSpec = (
  /** Before the instruction at `address` runs. */
  | { kind: 'address'; address: number }
  /** At the routine's first instruction, on every call to it. `routine` is its address (its header). */
  | { kind: 'routine'; routine: number }
  /** Before the first statement of that source line runs (needs symbols with sequence points). `file` matches the end of a source path. */
  | { kind: 'line'; file: string; line: number }
  /** When Inform's `action` global is set to `action` (needs symbols naming `action`). */
  | { kind: 'action'; action: number }
  /** When printed text contains `text` (case doesn't matter). */
  | { kind: 'text'; text: string }
  /** When memory in [address, address + length) is written (length default 1). */
  | { kind: 'write'; address: number; length?: number }
  /** When the value of `object`'s `property` changes. */
  | { kind: 'property'; object: number; property: number }
  /** When `object`'s `attribute` is set or cleared. */
  | { kind: 'attribute'; object: number; attribute: number }
) & { condition?: string }

/**
 * A breakpoint as set. `error` says why it can't fire (a condition that doesn't parse, a line with
 * no statement, a property the object hasn't got); `conditionError`, why its condition couldn't be
 * evaluated the last time it was reached (it didn't fire).
 */
export type Breakpoint = BreakpointSpec & { id: number; enabled: boolean; hits: number; error?: string; conditionError?: string }

/** What a breakpoint needs at run time, worked out when it's added. */
interface Armed {
  condition?: Expr
  /** line: the statement's address. */
  address?: number
  /** write, property, action: the bytes watched. */
  from?: number
  to?: number
  /** property, attribute: the value last seen. */
  last?: number
  /** attribute: the byte and bit. */
  byte?: number
  mask?: number
  /** action: the library routine that begins an action, and the `second` global it sets last. */
  begin?: number
  second?: number
}

/**
 * Where an Inform library begins performing an action: it sets action, noun and second, in that
 * order, before the before-rules run (the Standard Library's InformLibrary.begin_action,
 * PunyInform's PerformAction). An action breakpoint stops right after `second` is set there, so
 * all three are the action's own; the parser writes `action` earlier, with last turn's noun.
 */
const BEGIN_ACTION = ['InformLibrary.begin_action', 'PerformAction']

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

const hexOf = (n: number) => n.toString(16).padStart(4, '0')

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
  /** Breakpoints the instruction running hit (routine, action, text, write, property, attribute), reported once it has finished. */
  private pending: { bp: Breakpoint; detail?: string }[] = []
  private readonly armed = new Map<number, Armed>()
  private symbols: Symbols | undefined
  private names: NameIndex = indexNames(undefined)
  private storyModel: StoryFile | undefined
  private worldCache: { machine: Machine; world: World } | undefined
  private readonly watchList: { watch: Watch; expr?: Expr }[] = []
  private nextWatch = 1
  /** Printed text lately, for text breakpoints. */
  private recentText = ''
  /** Addresses written since the previous stop, and the previous stop's set (view()). */
  private writing = new Set<number>()
  private written = new Set<number>()
  private pauseRequested = false
  /** The PC of the last stop: a breakpoint there doesn't fire again until the machine moves. */
  private restingAt: number | null = null

  private constructor(story: Uint8Array, options: DebuggerOptions) {
    this.story = story.slice()
    this.options = options
    this.ring = new Ring(Math.max(1, options.trace?.capacity ?? 10_000), options.trace?.kinds ?? ['call', 'return'])
    this.machineHooks = this.hooks(options.hooks)
    this.symbols = options.symbols
    this.names = indexNames(options.symbols)
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
        for (const b of this.bps) if (b.enabled && !b.error && b.kind === 'routine' && b.routine === routine) this.pending.push({ bp: b })
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
        this.writing.add(address)
        if (size === 2) this.writing.add(address + 1)
        if (this.bps.length) this.watchWrite(address, size)
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
        if (this.bps.some(b => b.kind === 'text')) this.watchText(text)
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

  /** Never throws: a breakpoint that can't fire says why in `error`. */
  addBreakpoint(spec: BreakpointSpec): Breakpoint {
    const bp = { ...spec, id: this.nextId++, enabled: true, hits: 0 } as Breakpoint
    this.bps.push(bp)
    this.arm(bp)
    return bp
  }

  removeBreakpoint(id: number): void {
    const i = this.bps.findIndex(b => b.id === id)
    if (i >= 0) this.bps.splice(i, 1)
    this.armed.delete(id)
  }

  /** Work out what a breakpoint watches now (again after new symbols). */
  private arm(bp: Breakpoint): void {
    delete bp.error
    const a: Armed = {}
    this.armed.set(bp.id, a)
    const refuse = (why: string) => {
      bp.error = why
    }
    if (bp.condition !== undefined) {
      try {
        a.condition = parseExpr(bp.condition)
      } catch (e) {
        return refuse(`the condition doesn't parse: ${(e as Error).message}`)
      }
    }
    const w = this.world()
    try {
      switch (bp.kind) {
        case 'line': {
          const lines = this.symbols?.lines
          if (!lines?.length) return refuse('line breakpoints need the debug file (its sequence points)')
          const want = bp.file.toLowerCase()
          const p = lines.find(x => x.location.line === bp.line && (this.symbols!.sources[x.location.file] ?? '').toLowerCase().endsWith(want))
          if (!p) return refuse(`no statement starts on line ${bp.line} of ${bp.file}`)
          a.address = p.address
          break
        }
        case 'action': {
          const g = w.globalNumber('action')
          if (g === undefined || !this.names.globals.has('action')) return refuse('action breakpoints need symbols that name the action global')
          a.from = w.globalsBase + g * 2
          a.to = a.from + 2
          const begin = Object.values(this.symbols?.routines ?? {}).find(r => BEGIN_ACTION.includes(r.name))
          const second = this.names.globals.get('second')
          if (begin && second !== undefined) {
            a.begin = begin.address
            a.second = w.globalsBase + second * 2
          }
          break
        }
        case 'write':
          a.from = bp.address
          a.to = bp.address + Math.max(1, bp.length ?? 1)
          break
        case 'property': {
          const f = w.objs.find(bp.object, bp.property)
          if (!f) return refuse(`${w.objectName(bp.object)} has no property ${this.symbols?.properties[bp.property] ?? bp.property}`)
          a.from = f.data
          a.to = f.data + f.size
          a.last = w.property(bp.object, bp.property)
          break
        }
        case 'attribute': {
          const v3 = this.m.version <= 3
          if (bp.attribute < 0 || bp.attribute >= (v3 ? 32 : 48)) return refuse(`attribute ${bp.attribute} doesn't exist in this version`)
          const first = w.mem.word(0x0a) + (v3 ? 31 : 63) * 2
          a.byte = first + (bp.object - 1) * (v3 ? 9 : 14) + (bp.attribute >> 3)
          a.mask = 0x80 >> (bp.attribute & 7)
          a.last = w.hasAttribute(bp.object, bp.attribute) ? 1 : 0
          break
        }
      }
    } catch (e) {
      refuse(e instanceof Error ? e.message : String(e))
    }
  }

  /** A write: the action, write, property and attribute breakpoints it may hit. */
  private watchWrite(address: number, size: 1 | 2): void {
    const end = address + size
    for (const b of this.bps) {
      if (!b.enabled || b.error) continue
      const a = this.armed.get(b.id)
      if (!a) continue
      if (b.kind === 'write' && address < a.to! && end > a.from!) this.pending.push({ bp: b, detail: `${hexOf(address)} written` })
      else if (b.kind === 'action') {
        // With the library's begin-action routine: when it sets `second`. Without: when `action` is set.
        const at = a.second !== undefined ? a.second : a.from!
        if (address >= at + 2 || end <= at) continue
        if (a.second !== undefined && this.m.state.frames.at(-1)?.routine !== a.begin) continue
        if (this.world().mem.word(a.from!) === b.action) this.pending.push({ bp: b, detail: this.actionDetail() })
      } else if (b.kind === 'property' && address < a.to! && end > a.from!) {
        const w = this.world()
        const now = w.property(b.object, b.property)
        if (now !== a.last) {
          this.pending.push({ bp: b, detail: `${w.objectName(b.object)}.${this.symbols?.properties[b.property] ?? b.property}: ${a.last} → ${now}` })
          a.last = now
        }
      } else if (b.kind === 'attribute' && address <= a.byte! && end > a.byte!) {
        const w = this.world()
        const now = w.mem.byte(a.byte!) & a.mask! ? 1 : 0
        if (now !== a.last) {
          const name = this.symbols?.attributes[b.attribute] ?? `attribute ${b.attribute}`
          this.pending.push({ bp: b, detail: `${w.objectName(b.object)} ${now ? 'now has' : 'no longer has'} ${name}` })
          a.last = now
        }
      }
    }
  }

  /** Printed text: the text breakpoints it may hit. */
  private watchText(text: string): void {
    this.recentText = (this.recentText + text).slice(-1024)
    const seen = this.recentText.toLowerCase()
    for (const b of this.bps) {
      if (b.kind !== 'text' || !b.enabled || b.error || !b.text) continue
      if (seen.includes(b.text.toLowerCase())) {
        this.pending.push({ bp: b, detail: `printed "${b.text}"` })
        this.recentText = ''
      }
    }
  }

  private actionDetail(): string {
    const s = this.inform()
    const part = (label: string, n?: Named) => (n && n.value ? `${label}: ${n.name ?? n.value}` : '')
    const rest = [part('noun', s?.noun), part('second', s?.second)].filter(Boolean).join(', ')
    return `action ${s?.action?.name ?? s?.action?.value ?? '?'}${rest ? ` (${rest})` : ''}`
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
    this.pending = []
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
        for (const b of this.bps) {
          if (!b.enabled || b.error) continue
          const at = b.kind === 'address' ? b.address : b.kind === 'line' ? this.armed.get(b.id)?.address : undefined
          if (at === pc && this.conditionHolds(b)) {
            b.hits++
            return this.stopped({ kind: 'breakpoint', breakpoint: b })
          }
        }
      }
      const before = m.state.counters.instructions
      const s = m.step()
      const at = m.state.counters.instructions
      if (at > this.head) this.head = at
      if (at !== before && at % every === 0 && !this.silent) this.checkpoint(false)
      if (this.pending.length) {
        const hits = this.pending
        this.pending = []
        // An instruction that faults reports the fault, not the breakpoint.
        if (!s || s.kind !== 'fault') {
          const hit = hits.find(h => this.conditionHolds(h.bp))
          if (hit) {
            hit.bp.hits++
            return this.stopped(hit.detail ? { kind: 'breakpoint', breakpoint: hit.bp, detail: hit.detail } : { kind: 'breakpoint', breakpoint: hit.bp })
          }
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
    this.written = this.writing
    this.writing = new Set()
    this.refreshWatches()
    return s
  }

  // ── conditions, watches, the view ─────────────────────────────────────────

  private conditionHolds(b: Breakpoint): boolean {
    const c = this.armed.get(b.id)?.condition
    if (!c) return true
    try {
      delete b.conditionError
      return evaluateExpr(c, this.world()) !== 0
    } catch (e) {
      b.conditionError = (e as Error).message
      return false
    }
  }

  /** Evaluate an expression now: the app's hover, the CLI's checks. */
  evaluate(expression: string): { value: number } | { error: string } {
    try {
      return { value: evaluateExpr(parseExpr(expression), this.world()) }
    } catch (e) {
      return { error: e instanceof ExprError ? e.message : String(e) }
    }
  }

  addWatch(expression: string): Watch {
    const watch: Watch = { id: this.nextWatch++, expression, changed: false }
    const entry: { watch: Watch; expr?: Expr } = { watch }
    try {
      entry.expr = parseExpr(expression)
    } catch (e) {
      watch.error = (e as Error).message
    }
    this.watchList.push(entry)
    this.evaluateWatch(entry, false)
    return { ...watch }
  }

  removeWatch(id: number): void {
    const i = this.watchList.findIndex(w => w.watch.id === id)
    if (i >= 0) this.watchList.splice(i, 1)
  }

  /** Every watch, as of the latest stop. */
  watches(): Watch[] {
    return this.watchList.map(w => ({ ...w.watch }))
  }

  private refreshWatches(): void {
    for (const w of this.watchList) this.evaluateWatch(w, true)
  }

  private evaluateWatch(w: { watch: Watch; expr?: Expr }, compare: boolean): void {
    if (!w.expr) return
    const before = w.watch.value
    try {
      w.watch.value = evaluateExpr(w.expr, this.world())
      delete w.watch.error
    } catch (e) {
      delete w.watch.value
      w.watch.error = (e as Error).message
    }
    w.watch.changed = compare && before !== w.watch.value
  }

  /** What changed since the previous stop, for the UI to light. */
  view(): MachineView {
    const w = this.world()
    const globals = new Set<number>()
    const objects = new Set<number>()
    for (const a of this.written) {
      const g = w.globalAt(a)
      if (g !== undefined) globals.add(g)
      else {
        const o = w.objectAt(a)
        if (o !== undefined) objects.add(o)
      }
    }
    return { pc: this.m.state.pc, frame: this.m.state.frames.length - 1, changed: { addresses: new Set(this.written), objects, globals } }
  }

  // ── Inform ────────────────────────────────────────────────────────────────

  /** Names and source lines from now on (for breakpoints set before, too). */
  setSymbols(symbols: Symbols | undefined): void {
    this.symbols = symbols
    this.names = indexNames(symbols)
    this.worldCache = undefined
    for (const b of this.bps) this.arm(b)
  }

  /** The story's world over the current machine (rebuilt when rewinding replaces it). */
  private world(): World {
    if (this.worldCache?.machine !== this.m) {
      this.storyModel ??= parseStory(this.story)
      this.worldCache = { machine: this.m, world: new World(this.m, this.storyModel, this.symbols, this.names) }
    }
    return this.worldCache.world
  }

  /** Inform's action, actor, noun and second now, when the symbols name those globals. */
  inform(): InformState | undefined {
    const w = this.world()
    const out: InformState = {}
    for (const g of ['action', 'actor', 'noun', 'second'] as const) {
      const n = this.names.globals.get(g)
      if (n === undefined) continue
      const value = w.globalValue(n)
      const name = g === 'action' ? this.symbols?.actions[value] : value ? w.objectName(value) : 'nothing'
      out[g] = name === undefined ? { value } : { value, name }
    }
    return Object.keys(out).length ? out : undefined
  }

  /** The source line of `pc` (default: the PC): the statement it's in, from the sequence points. */
  sourceLine(pc = this.m.state.pc): SourceLine | undefined {
    const lines = this.symbols?.lines
    if (!lines?.length) return undefined
    let lo = 0
    let hi = lines.length - 1
    let best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid]!.address <= pc) {
        best = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    if (best < 0) return undefined
    const p = lines[best]!
    // Only within the same routine: a PC before its routine's first statement has no line.
    const r = this.storyModel?.code.routines.find(x => pc >= x.address && pc < x.end)
    if (r && p.address < r.address) return undefined
    return { file: this.symbols!.sources[p.location.file] ?? `file ${p.location.file}`, line: p.location.line }
  }

  /** Until a statement on another line starts (in this routine, one it calls, or its caller). */
  stepLine(budget?: number): DebugStop {
    const lines = this.symbols?.lines
    if (!lines?.length) return this.stepInstruction()
    const starts = new Set(lines.map(l => l.address))
    const from = this.sourceLine()
    const depth = this.m.state.frames.length
    return this.loop(budget, () => {
      if (this.m.state.frames.length < depth) return true
      if (!starts.has(this.m.state.pc)) return false
      const now = this.sourceLine()
      return !from || !now || now.line !== from.line || now.file !== from.file || this.m.state.frames.length !== depth
    }, true)
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
