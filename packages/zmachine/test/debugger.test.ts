/**
 * The Debugger (docs/18): breakpoints, stepping, the trace and the stack, on hand-assembled stories
 * and on the samples.
 */
import { describe, expect, it } from 'vitest'
import { Debugger, Machine, normalizeTurn, play, type DebugStop } from '../src/index.js'
import { R, assemble, type Asm } from './asm.js'
import { readSample, readScript } from './samples.js'

/**
 * main calls `twice` twice, each of which calls `leaf`, then reads a line and quits:
 *   main:  CALL_VS twice -> sp ; after1: CALL_VS twice -> sp ; after2: PRINT "x" ; read ; QUIT
 *   twice(a): CALL_VS leaf -> sp ; afterLeaf: RET 7
 *   leaf: inLeaf: STORE G0 5 ; RET 1
 */
function story() {
  let asm!: Asm
  const bytes = assemble(5, a => {
    asm = a
    a.routine('main', 0)
    a.op('CALL_VS', [R('twice'), 3], { store: 0 }).label('after1')
    a.op('CALL_VS', [R('twice'), 4], { store: 0 }).label('after2')
    a.op('PRINT', [], { text: 'x' })
    a.op('READ', [0x400, 0x500], { store: 0 }).label('afterRead')
    a.op('QUIT')
    a.routine('twice', 1)
    a.op('CALL_VS', [R('leaf')], { store: 0 }).label('afterLeaf')
    a.op('RET', [7])
    a.routine('leaf', 0)
    a.label('inLeaf')
    a.op('STORE', [16, 5])
    a.op('RET', [1])
  })
  // Text buffer at 0x400 holds 20 characters; parse buffer at 0x500 holds 4 words.
  bytes[0x400] = 20
  bytes[0x500] = 4
  return { bytes, at: (n: string) => asm.addressOf(n) }
}

function debuggerFor(bytes: Uint8Array, options: Partial<Parameters<typeof Debugger.create>[1]> = {}) {
  const d = Debugger.create(bytes, { seed: 1, ...options })
  if (!(d instanceof Debugger)) throw new Error(d.fault.message)
  return d
}

const kind = (s: DebugStop) => s.kind

describe('Debugger', () => {
  it('runs to input like the machine when nothing is set', () => {
    const { bytes } = story()
    const d = debuggerFor(bytes)
    expect(kind(d.run())).toBe('input-line')
    expect(d.machine.flushText()).toBe('x')
  })

  it('stops before an address breakpoint runs, and goes on from it', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    const bp = d.addBreakpoint({ kind: 'address', address: at('after2') })
    const s = d.run()
    expect(s).toMatchObject({ kind: 'breakpoint', breakpoint: { id: bp.id, hits: 1 } })
    expect(d.machine.state.pc).toBe(at('after2'))
    expect(d.machine.flushText()).toBe('') // the PRINT after it hasn't run
    expect(kind(d.run())).toBe('input-line') // Continue isn't stuck on the breakpoint it rests on
    expect(d.breakpoints[0]!.hits).toBe(1)
  })

  it('stops at the first instruction of a routine on every call', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    d.addBreakpoint({ kind: 'routine', routine: at('leaf') })
    expect(kind(d.run())).toBe('breakpoint')
    expect(d.machine.state.pc).toBe(at('inLeaf'))
    expect(kind(d.run())).toBe('breakpoint')
    expect(d.machine.state.pc).toBe(at('inLeaf'))
    expect(kind(d.run())).toBe('input-line')
    expect(d.breakpoints[0]!.hits).toBe(2)
  })

  it('ignores a disabled breakpoint, and forgets a removed one', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    const a = d.addBreakpoint({ kind: 'routine', routine: at('leaf') })
    const b = d.addBreakpoint({ kind: 'address', address: at('after2') })
    d.setBreakpointEnabled(a.id, false)
    d.removeBreakpoint(b.id)
    expect(d.breakpoints.map(x => x.id)).toEqual([a.id])
    expect(kind(d.run())).toBe('input-line')
    expect(d.breakpoints[0]!.hits).toBe(0)
  })

  it('steps one instruction', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    const start = d.machine.state.pc
    expect(kind(d.stepInstruction())).toBe('step')
    expect(d.machine.state.pc).not.toBe(start)
    expect(d.machine.state.counters.instructions).toBe(1)
    // The first instruction is a call: one step lands inside `twice`.
    expect(d.stack().at(-1)!.routine).toBe(at('twice'))
  })

  it('steps over a call to the instruction after it, and out of a routine to its caller', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    expect(kind(d.stepOver())).toBe('step')
    expect(d.machine.state.pc).toBe(at('after1'))
    expect(d.machine.state.frames).toHaveLength(1)

    d.addBreakpoint({ kind: 'routine', routine: at('leaf') })
    expect(kind(d.run())).toBe('breakpoint') // in leaf, from the second `twice`
    expect(kind(d.stepOut())).toBe('step')
    expect(d.machine.state.pc).toBe(at('afterLeaf'))
    expect(d.stack().at(-1)!.routine).toBe(at('twice'))
  })

  it('stops at a breakpoint inside a call it is stepping over', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    d.addBreakpoint({ kind: 'address', address: at('inLeaf') })
    expect(kind(d.stepOver())).toBe('breakpoint')
    expect(d.machine.state.pc).toBe(at('inLeaf'))
  })

  it('continues to an address', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    expect(kind(d.continueTo(at('after2')))).toBe('step')
    expect(d.machine.state.pc).toBe(at('after2'))
  })

  it('returns `budget` when its slice runs out, and `paused` when asked to stop', () => {
    const { bytes } = story()
    const d = debuggerFor(bytes)
    expect(kind(d.run(2))).toBe('budget')
    expect(d.machine.state.counters.instructions).toBe(2)
    d.pause()
    expect(kind(d.run())).toBe('paused')
    expect(d.machine.state.counters.instructions).toBe(2)
    expect(kind(d.run())).toBe('input-line')
  })

  it('names each frame of the stack, innermost last, with where it is', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    d.addBreakpoint({ kind: 'routine', routine: at('leaf') })
    d.run()
    const stack = d.stack()
    expect(stack.map(f => f.routine)).toEqual([undefined, at('twice'), at('leaf')])
    expect(stack[2]!.pc).toBe(at('inLeaf'))
    expect(stack[1]!.pc).toBe(at('afterLeaf'))
    expect(stack[0]!.pc).toBe(at('after1'))
    expect(stack[1]!.locals).toEqual([3])
    expect(stack[1]!.argCount).toBe(1)
  })

  it('traces calls and returns, by depth and instruction count', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    d.run()
    const calls = d.trace.events().filter(e => e.kind === 'call' || e.kind === 'return')
    expect(calls.map(e => (e.kind === 'call' ? `call ${e.routine}@${e.depth}` : `ret ${e.value}@${e.depth}`))).toEqual([
      `call ${at('twice')}@1`, `call ${at('leaf')}@2`, 'ret 1@2', 'ret 7@1',
      `call ${at('twice')}@1`, `call ${at('leaf')}@2`, 'ret 1@2', 'ret 7@1',
    ])
    const first = d.trace.events()[0]!
    expect(first.at).toBe(1)
  })

  it('traces writes and prints when asked, and keeps only the newest events', () => {
    const { bytes } = story()
    const d = debuggerFor(bytes, { trace: { capacity: 3, kinds: ['write', 'print', 'call'] } })
    d.run()
    const ev = d.trace.events()
    expect(ev).toHaveLength(3)
    expect(ev.at(-1)).toMatchObject({ kind: 'print', text: 'x' })
    expect(ev.some(e => e.kind === 'write')).toBe(true)
    d.trace.clear()
    expect(d.trace.events()).toEqual([])
  })

  it('logs every input it passes on, and the trace records it', () => {
    const { bytes } = story()
    const d = debuggerFor(bytes, { trace: { kinds: ['input'] } })
    d.run()
    expect(d.resume({ line: 'hello' })).toBeNull()
    expect(d.inputLog).toEqual([{ line: 'hello' }])
    expect(kind(d.run())).toBe('quit')
    expect(d.trace.events()).toMatchObject([{ kind: 'input', value: 'hello' }])
  })

  it('runs to input, and to a turn', () => {
    const { bytes } = story()
    const d = debuggerFor(bytes)
    expect(kind(d.runToInput())).toBe('input-line')
    expect(kind(d.runToTurn(0))).toBe('input-line')
    expect(d.machine.state.counters.turns).toBe(0)
  })

  it('still calls the host’s own hooks', () => {
    const { bytes } = story()
    const printed: string[] = []
    const d = debuggerFor(bytes, { hooks: { print: t => printed.push(t) } })
    d.run()
    expect(printed.join('')).toBe('x')
  })

  it('refuses a story the machine refuses, without throwing', () => {
    expect(Debugger.create(new Uint8Array(10), { seed: 1 })).toMatchObject({ fault: { code: 'bad-story' } })
  })
})

describe('Debugger on the samples', () => {
  const name = 'dark-cellar.z5'
  const script = readScript(new URL('../../../samples/walkthroughs/dark-cellar.txt', import.meta.url))

  /** Play the script through the debugger, as play() does, returning each turn's text. */
  function playThrough(d: Debugger): string[] {
    const out: string[] = []
    let stop = d.run()
    out.push(d.machine.flushText())
    for (const command of script) {
      if (stop.kind !== 'input-line') break
      d.resume({ line: command })
      stop = d.run()
      out.push(d.machine.flushText())
    }
    return out
  }

  it('plays the walkthrough to the same transcript as play() when nothing is set', () => {
    const d = debuggerFor(readSample(name))
    const ours = playThrough(d)
    const theirs = play(readSample(name), script, { seed: 1 }).turns.map(t => t.output)
    expect(ours.length).toBe(theirs.length)
    // The same text, turn by turn (play() echoes and drops the command line; normalize ours the same way).
    expect(normalizeTurn(ours[0]!)).toBe(theirs[0])
    ours.slice(1).forEach((t, i) => expect(normalizeTurn(t)).toBe(normalizeTurn(theirs[i + 1]!)))
    // And the same machine at the end: memory, PC, stack and counters, byte for byte.
    const end = play(readSample(name), script, { seed: 1 }).machine!
    expect(d.machine.state.counters).toEqual(end.state.counters)
    expect(d.machine.state.pc).toBe(end.state.pc)
    expect(d.machine.snapshot().dynamic).toEqual(end.snapshot().dynamic)
  })

  it('stops on a routine the story calls, and its stack agrees with the trace', () => {
    const d = debuggerFor(readSample(name))
    d.run()
    d.resume({ line: script[0]! })
    // The first routine called in the first turn, from the trace.
    d.trace.clear()
    d.run()
    const firstCall = d.trace.events().find(e => e.kind === 'call')!
    expect(firstCall).toBeDefined()

    const d2 = debuggerFor(readSample(name))
    d2.run()
    d2.resume({ line: script[0]! })
    d2.addBreakpoint({ kind: 'routine', routine: firstCall.kind === 'call' ? firstCall.routine : 0 })
    expect(kind(d2.run())).toBe('breakpoint')
    const routines = d2.stack().map(f => f.routine)
    expect(routines.at(-1)).toBe(firstCall.kind === 'call' ? firstCall.routine : -1)
    expect(d2.machine.state.frames.length).toBe(routines.length)
  })
})

describe('Frame.routine', () => {
  it('is set on every frame a call makes, and survives a snapshot', () => {
    const { bytes, at } = story()
    const d = debuggerFor(bytes)
    d.addBreakpoint({ kind: 'routine', routine: at('leaf') })
    d.run()
    const snap = d.machine.snapshot()
    expect(snap.frames.map(f => f.routine)).toEqual([undefined, at('twice'), at('leaf')])
    const m = Machine.fromSnapshot(bytes, snap, { seed: 1 }) as Machine
    expect(m.state.frames.map(f => f.routine)).toEqual([undefined, at('twice'), at('leaf')])
  })

  it('a snapshot from 0.1.x (frames without it) still restores', () => {
    const { bytes } = story()
    const m = Machine.create(bytes, { seed: 1 }) as Machine
    m.run(3)
    const snap = m.snapshot()
    for (const f of snap.frames) delete f.routine
    const back = Machine.fromSnapshot(bytes, snap, { seed: 1 })
    expect(back).toBeInstanceOf(Machine)
    expect((back as Machine).run(1_000_000).kind).toBe('input-line')
  })
})

