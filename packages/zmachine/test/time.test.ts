/**
 * Time (docs/19): checkpoints, deterministic replay, stepping back, the timeline, and the future
 * replayed or replaced. On the samples, so save_undo, random and real turns are all in play.
 */
import { describe, expect, it } from 'vitest'
import { Debugger, type DebugStop, type MachineSnapshot } from '../src/index.js'
import { readSample, readScript } from './samples.js'

const script = (name: string) => readScript(new URL(`../../../samples/walkthroughs/${name}.txt`, import.meta.url))
const CELLAR = readSample('dark-cellar.z5')
const CELLAR_SCRIPT = script('dark-cellar')
const BALL = readSample('magic-8-ball.z5')
const BALL_SCRIPT = script('magic-8-ball')

function make(story: Uint8Array, options: Partial<Parameters<typeof Debugger.create>[1]> = {}) {
  const d = Debugger.create(story, { seed: 7, ...options })
  if (!(d instanceof Debugger)) throw new Error(d.fault.message)
  return d
}

/** Run, answering each line prompt with the next command, until they run out (stopped at a prompt). */
function playAll(d: Debugger, commands: string[]): DebugStop {
  let stop = d.run()
  for (const c of commands) {
    if (stop.kind !== 'input-line') break
    expect(d.resume({ line: c })).toBeNull()
    stop = d.run()
  }
  return stop
}

/** Everything a snapshot holds that the machine runs on (the snapshot's own copy is compared whole). */
const state = (d: Debugger): MachineSnapshot => d.machine.snapshot()

describe('determinism', () => {
  it('gives the same trace and the same end, twice, with random in play', () => {
    const kinds = ['call', 'return', 'write', 'print', 'input', 'branch'] as const
    const a = make(BALL, { trace: { capacity: 1_000_000, kinds: [...kinds] } })
    const b = make(BALL, { trace: { capacity: 1_000_000, kinds: [...kinds] } })
    playAll(a, BALL_SCRIPT)
    playAll(b, BALL_SCRIPT)
    expect(a.trace.events().length).toBeGreaterThan(1000)
    expect(a.trace.events()).toEqual(b.trace.events())
    expect(state(a)).toEqual(state(b))
  })
})

describe('rewind', () => {
  it('goes back to an instruction in an earlier turn, exactly as it was', () => {
    const d = make(CELLAR)
    let stop = d.run()
    d.resume({ line: CELLAR_SCRIPT[0]! })
    // Part way into turn 1.
    stop = d.run(2000)
    expect(stop.kind).toBe('budget')
    const n = d.machine.state.counters.instructions
    const then = state(d)
    // On, to the end of the walkthrough.
    stop = d.run()
    for (const c of CELLAR_SCRIPT.slice(1)) {
      if (stop.kind !== 'input-line') break
      d.resume({ line: c })
      stop = d.run()
    }
    expect(d.machine.state.counters.turns).toBeGreaterThan(3)
    const end = state(d)

    expect(d.goToInstruction(n).kind).toBe('step')
    expect(d.machine.state.counters.instructions).toBe(n)
    expect(state(d)).toEqual(then)

    // And forward again to the head: the future replays, inputs and all.
    expect(d.goToInstruction(d.timeline().head).kind).toBe('step')
    expect(state(d)).toEqual(end)
  })

  it('steps back one instruction at a time, matching each state on the way forward', () => {
    const d = make(CELLAR)
    d.run()
    d.resume({ line: CELLAR_SCRIPT[0]! })
    const seen: MachineSnapshot[] = []
    for (let i = 0; i < 40; i++) {
      seen.push(state(d))
      d.stepInstruction()
    }
    for (let i = 39; i >= 0; i--) {
      expect(d.stepBack().kind).toBe('step')
      expect(state(d)).toEqual(seen[i])
    }
  })

  it('steps back across a turn boundary: to just after the line was given, then into the previous turn', () => {
    const d = make(CELLAR)
    d.run()
    const atPrompt = d.machine.state.counters.instructions
    const waiting = state(d)
    d.resume({ line: CELLAR_SCRIPT[0]! })
    const given = state(d)
    d.stepInstruction()
    d.stepInstruction()
    d.stepBack(2)
    // At the prompt's count, with the line given: the latest state at that count.
    expect(d.machine.state.counters.instructions).toBe(atPrompt)
    expect(state(d)).toEqual(given)
    expect(d.machine.state.input.pending).toBeNull()
    // goToTurn is the prompt itself, still waiting (the first prompt is turn 0).
    d.goToTurn(0)
    expect(state(d)).toEqual(waiting)
    expect(d.machine.state.input.pending?.kind).toBe('line')
    // One more step back: before the read ran, in the previous turn.
    d.goToInstruction(atPrompt)
    d.stepBack()
    expect(d.machine.state.counters.instructions).toBe(atPrompt - 1)
    expect(d.machine.state.input.pending).toBeNull()
  })

  it('goes to a turn, and runToTurn uses it for a turn already reached', () => {
    const d = make(CELLAR)
    playAll(d, CELLAR_SCRIPT)
    const turns = d.timeline().turns
    expect(turns.map(t => t.turn)).toEqual(turns.map((_, i) => i))
    expect(turns[1]!.line).toBe(CELLAR_SCRIPT[1])
    expect(d.goToTurn(2).kind).toBe('step')
    expect(d.machine.state.counters.turns).toBe(2)
    expect(d.machine.state.input.pending?.kind).toBe('line')
    expect(d.machine.state.counters.instructions).toBe(turns[2]!.instruction)
    d.goToTurn(0)
    expect(d.runToTurn(3).kind).toBe('step')
    expect(d.machine.state.counters.turns).toBe(3)
  })

  it('every turn of the walkthrough, rewound to, is the state it was when first played', () => {
    const d = make(CELLAR)
    const first: MachineSnapshot[] = []
    let stop = d.run()
    first.push(state(d))
    for (const c of CELLAR_SCRIPT) {
      if (stop.kind !== 'input-line') break
      d.resume({ line: c })
      stop = d.run()
      first.push(state(d))
    }
    for (let t = first.length - 1; t >= 0; t--) {
      d.goToTurn(t)
      expect(state(d)).toEqual(first[t])
    }
  })
})

describe('the future', () => {
  it('running forward in the past replays the logged inputs, and a breakpoint on the way fires', () => {
    const d = make(CELLAR)
    playAll(d, CELLAR_SCRIPT)
    const end = state(d)
    const head = d.timeline().head
    const log = d.inputLog.length

    d.goToTurn(1)
    const stop = d.run()
    // Replays every later turn without being given input, and waits at the head.
    expect(stop.kind).toBe('input-line')
    expect(d.machine.state.counters.instructions).toBe(head)
    expect(state(d)).toEqual(end)
    expect(d.inputLog.length).toBe(log)
  })

  it('a breakpoint fires in a replayed turn, but not on the way when going to a point', () => {
    const d = make(CELLAR)
    d.run()
    d.resume({ line: CELLAR_SCRIPT[0]! })
    d.trace.kinds = new Set(['call'])
    d.trace.clear()
    d.run()
    const routine = (d.trace.events().find(e => e.kind === 'call') as { routine: number }).routine
    for (const c of CELLAR_SCRIPT.slice(1)) {
      d.resume({ line: c })
      if (d.run().kind !== 'input-line') break
    }
    const bp = d.addBreakpoint({ kind: 'routine', routine })
    d.goToTurn(0)
    expect(bp.hits).toBe(0) // silent on the way
    expect(d.run().kind).toBe('breakpoint') // fires on replay
    expect(d.breakpoints[0]!.hits).toBe(1)
  })

  it('a different command in the past starts a new timeline', () => {
    const d = make(CELLAR)
    playAll(d, CELLAR_SCRIPT)
    const before = d.timeline()
    d.goToTurn(1)
    const here = d.machine.state.counters.instructions
    expect(d.resume({ line: 'inventory' })).toBeNull()
    const t = d.timeline()
    expect(t.head).toBe(here)
    expect(t.turns.length).toBe(2)
    expect(t.turns[1]!.line).toBe('inventory')
    expect(t.checkpoints.every(c => c <= here)).toBe(true)
    expect(d.inputLog.at(-1)).toEqual({ at: here, input: { line: 'inventory' } })
    expect(d.inputLog.length).toBe(2)
    expect(before.turns.length).toBeGreaterThan(2)
    expect(d.run().kind).toBe('input-line')
    expect(d.machine.flushText()).toMatch(/carrying|empty-handed|nothing/i)
  })

  it('drops the trace’s future, and records nothing on the way to a point', () => {
    const d = make(CELLAR, { trace: { kinds: ['call', 'return'] } })
    playAll(d, CELLAR_SCRIPT)
    const target = d.timeline().turns[2]!.instruction
    d.goToInstruction(target)
    expect(d.trace.events().every(e => e.at <= target)).toBe(true)
    const count = d.trace.events().length
    d.goToInstruction(target - 500)
    expect(d.trace.events().length).toBeLessThanOrEqual(count)
    expect(d.trace.events().every(e => e.at <= target - 500)).toBe(true)
  })
})

describe('checkpoints', () => {
  it('are at instruction 0, every prompt, and every `checkpointEvery` instructions', () => {
    const d = make(CELLAR, { checkpointEvery: 1000 })
    playAll(d, CELLAR_SCRIPT)
    const { checkpoints, turns } = d.timeline()
    expect(checkpoints[0]).toBe(0)
    for (const t of turns) expect(checkpoints).toContain(t.instruction)
    const gaps = checkpoints.slice(1).map((c, i) => c - checkpoints[i]!)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1000)
  })

  it('keep at most `maxCheckpoints`, dropping within-turn ones first, and rewind still works', () => {
    const d = make(CELLAR, { checkpointEvery: 500, maxCheckpoints: 12 })
    const first: MachineSnapshot[] = []
    let stop = d.run()
    first.push(state(d))
    for (const c of CELLAR_SCRIPT) {
      if (stop.kind !== 'input-line') break
      d.resume({ line: c })
      stop = d.run()
      first.push(state(d))
    }
    const { checkpoints, turns } = d.timeline()
    expect(checkpoints.length).toBeLessThanOrEqual(Math.max(12, turns.length + 1))
    for (const t of turns) expect(checkpoints).toContain(t.instruction)
    d.goToTurn(1)
    expect(state(d)).toEqual(first[1])
  })

  it('share the transcript and the undo ring instead of copying them', () => {
    const d = make(CELLAR)
    playAll(d, CELLAR_SCRIPT)
    const head = d.timeline().head
    const runs = d.machine.state.screen.lower.runs
    const undo = d.machine.state.undo
    expect(undo.length).toBeGreaterThan(0) // the library's save_undo, every turn
    // Away and back: restored from the head's own checkpoint, not replayed.
    d.stepBack()
    d.goToInstruction(head)
    const r = d.machine.state.screen.lower.runs
    expect(r.length).toBe(runs.length)
    expect(r.slice(0, -1).every((x, i) => x === runs[i])).toBe(true)
    expect(r.at(-1)).not.toBe(runs.at(-1)) // the last run, which can still grow, is a copy
    expect(r.at(-1)).toEqual(runs.at(-1))
    expect(d.machine.state.undo.every((u, i) => u === undo[i])).toBe(true)
  })
})
