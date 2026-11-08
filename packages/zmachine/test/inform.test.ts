/**
 * The Inform layer (docs/20): names, source lines, Inform's globals, the new breakpoint kinds with
 * conditions, watches and the view, on the Dark Cellar with its debug file, and with names
 * inferred from the story alone.
 */
import { readFileSync } from 'node:fs'
import { findReference, inferSymbols, parseStory, readSymbols, type Symbols } from '@frotzinc/zcode'
import { describe, expect, it } from 'vitest'
import { Debugger, type DebugStop } from '../src/index.js'
import { assemble } from './asm.js'
import { readSample, readScript } from './samples.js'

const FIX = new URL('../../zcode/test/.fixtures/', import.meta.url)
const STORY = new Uint8Array(readFileSync(new URL('dark-cellar.z5', FIX)))
const SYMBOLS = readSymbols(readFileSync(new URL('dark-cellar.dbg', FIX), 'utf8'))
const SCRIPT = readScript(new URL('../../../samples/walkthroughs/dark-cellar.txt', import.meta.url)) // down, up, take lantern, down, look, take key, inventory

const num = (r: Record<number, string>, name: string) => Number(Object.entries(r).find(([, n]) => n === name)![0])
const TAKE = num(SYMBOLS.actions, 'Take')
const LANTERN = num(SYMBOLS.objects, 'lantern')
const KEY = num(SYMBOLS.objects, 'rusty_key')
const CELLAR = num(SYMBOLS.objects, 'Cellar')

/** `null`: no symbols at all. */
function make(symbols: Symbols | null = SYMBOLS, story: Uint8Array = STORY) {
  const d = Debugger.create(story, symbols ? { seed: 1, symbols } : { seed: 1 })
  if (!(d instanceof Debugger)) throw new Error(d.fault.message)
  return d
}

/** Play the script until something other than a line prompt stops it; which command was being run. */
function playUntilStop(d: Debugger, commands = SCRIPT): { stop: DebugStop; command?: string } {
  let stop = d.run()
  for (const c of commands) {
    if (stop.kind !== 'input-line') return { stop }
    d.resume({ line: c })
    stop = d.run()
    if (stop.kind !== 'input-line') return { stop, command: c }
  }
  return { stop }
}

describe('action breakpoints', () => {
  it('stop right after `action` is set to Take, with the noun named', () => {
    const d = make()
    const bp = d.addBreakpoint({ kind: 'action', action: TAKE })
    expect(bp.error).toBeUndefined()
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('take lantern')
    expect(stop).toMatchObject({ kind: 'breakpoint', detail: 'action Take (noun: lantern)' })
    expect(d.inform()).toMatchObject({ action: { value: TAKE, name: 'Take' }, noun: { value: LANTERN, name: 'lantern' } })
    expect(d.evaluate('action == ##Take && noun == lantern')).toEqual({ value: 1 })
  })

  it('fire once per action, not again when the library restores the previous action at the end', () => {
    const d = make()
    const bp = d.addBreakpoint({ kind: 'action', action: TAKE })
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('take lantern')
    expect(stop.kind).toBe('breakpoint')
    // begin_action ends with `action = sa; noun = sn; second = ss`: the parser's Take, restored. Not a new action.
    expect(d.run().kind).toBe('input-line')
    expect(bp.hits).toBe(1)
  })

  it('with a condition, stop only when it holds', () => {
    const d = make()
    d.addBreakpoint({ kind: 'action', action: TAKE, condition: 'noun == rusty_key' })
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('take key')
    expect(stop).toMatchObject({ kind: 'breakpoint', detail: 'action Take (noun: rusty_key)' })
    expect(d.inform()!.noun!.value).toBe(KEY)
  })

  it('a condition that can’t be evaluated doesn’t fire, and says why', () => {
    const d = make()
    const bp = d.addBreakpoint({ kind: 'action', action: TAKE, condition: 'noun == lamp' })
    const { stop } = playUntilStop(d)
    expect(stop.kind).toBe('input-line') // ran to the end
    expect(d.breakpoints[0]!.conditionError).toBe("there's no local, global, object or constant called lamp")
    expect(bp.hits).toBe(0)
  })

  it('a condition that doesn’t parse is refused when added', () => {
    const d = make()
    expect(d.addBreakpoint({ kind: 'action', action: TAKE, condition: 'noun ==' }).error).toBe("the condition doesn't parse: the expression ends too soon")
  })

  it('need the action global named: without symbols, the breakpoint says so', () => {
    const d = make(null)
    expect(d.addBreakpoint({ kind: 'action', action: TAKE }).error).toBe('action breakpoints need symbols that name the action global')
    expect(d.inform()).toBeUndefined()
  })

  it('wake up when symbols arrive later', () => {
    const d = make(null)
    const bp = d.addBreakpoint({ kind: 'action', action: TAKE })
    d.setSymbols(SYMBOLS)
    expect(d.breakpoints[0]!.error).toBeUndefined()
    expect(playUntilStop(d).stop).toMatchObject({ kind: 'breakpoint', breakpoint: { id: bp.id } })
  })
})

describe('attribute, property, write and text breakpoints', () => {
  it('an attribute set: the Cellar becomes visited on the first DOWN', () => {
    const d = make()
    d.addBreakpoint({ kind: 'attribute', object: CELLAR, attribute: num(SYMBOLS.attributes, 'visited') })
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('down')
    expect(stop).toMatchObject({ kind: 'breakpoint', detail: 'Cellar now has visited' })
    expect(d.evaluate('Cellar has visited')).toEqual({ value: 1 })
  })

  it('a write to a global: `location`, when the player moves', () => {
    const d = make()
    const g = num(SYMBOLS.globals, 'location')
    d.addBreakpoint({ kind: 'write', address: (STORY[0x0c]! << 8 | STORY[0x0d]!) + g * 2, length: 2, condition: 'location == Cellar' })
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('down')
    expect(stop.kind).toBe('breakpoint')
  })

  it('printed text: stops after the print that completes it', () => {
    const d = make()
    d.addBreakpoint({ kind: 'text', text: 'TAKEN.' })
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('take lantern')
    expect(stop).toMatchObject({ kind: 'breakpoint', detail: 'printed "TAKEN."' })
  })

  it('a property: fires when its value changes, with old → new', () => {
    let at!: number
    const story = assemble(5, a => {
      a.routine('main', 0)
      a.op('PUT_PROP', [1, 5, 9])
      a.op('PUT_PROP', [1, 5, 9]) // the same value: not a change
      a.op('PUT_PROP', [1, 5, 4])
      a.op('QUIT')
      at = a.here
    }, { objects: [{ name: 'lamp', properties: { 5: [0, 1] } }] })
    void at
    const d = make(null, story)
    const bp = d.addBreakpoint({ kind: 'property', object: 1, property: 5 })
    expect(d.run()).toMatchObject({ kind: 'breakpoint', detail: 'lamp.5: 1 → 9' })
    expect(d.run()).toMatchObject({ kind: 'breakpoint', detail: 'lamp.5: 9 → 4' })
    expect(d.run().kind).toBe('quit')
    expect(bp.hits).toBe(2)
    expect(d.addBreakpoint({ kind: 'property', object: 1, property: 6 }).error).toBe('lamp has no property 6')
  })
})

describe('source lines', () => {
  const init = Object.values(SYMBOLS.routines).find(r => r.name === 'Initialise')!

  it('a line breakpoint stops before that statement, and the PC maps back to the line', () => {
    const d = make()
    const line = init.location!.line + 1 // location = Hall;
    const bp = d.addBreakpoint({ kind: 'line', file: 'story.inf', line })
    expect(bp.error).toBeUndefined()
    expect(d.run().kind).toBe('breakpoint')
    expect(d.sourceLine()).toEqual({ file: 'story.inf', line })
    expect(d.stack().at(-1)!.routine).toBe(init.address)
  })

  it('steps by line: to the next statement', () => {
    const d = make()
    d.addBreakpoint({ kind: 'line', file: 'story.inf', line: init.location!.line + 1 })
    d.run()
    expect(d.stepLine().kind).toBe('step')
    expect(d.sourceLine()).toEqual({ file: 'story.inf', line: init.location!.line + 2 })
  })

  it('a line with no statement, or no debug file, says so', () => {
    expect(make().addBreakpoint({ kind: 'line', file: 'story.inf', line: 1 }).error).toBe('no statement starts on line 1 of story.inf')
    expect(make(null).addBreakpoint({ kind: 'line', file: 'story.inf', line: 106 }).error).toBe('line breakpoints need the debug file (its sequence points)')
  })
})

describe('watches and the view', () => {
  it('watches change across stops, and say when they did', () => {
    const d = make()
    const where = d.addWatch('location')
    const holding = d.addWatch('lantern in player')
    const bad = d.addWatch('lantren')
    expect(d.watches().find(w => w.id === bad.id)!.error).toContain('lantren')
    let stop = d.run()
    const hall = d.watches().find(w => w.id === where.id)!.value
    for (const c of ['down', 'up', 'take lantern']) {
      d.resume({ line: c })
      stop = d.run()
    }
    expect(stop.kind).toBe('input-line')
    const w = d.watches()
    expect(w.find(x => x.id === holding.id)).toMatchObject({ value: 1, changed: true })
    expect(w.find(x => x.id === where.id)).toMatchObject({ value: hall, changed: false })
  })

  it('the view lights the globals and objects the last turn wrote', () => {
    const d = make()
    d.run()
    d.resume({ line: 'down' })
    d.run()
    let v = d.view()
    expect(v.changed.globals.has(num(SYMBOLS.globals, 'location'))).toBe(true)
    expect(v.changed.objects.has(CELLAR)).toBe(true) // visited
    d.resume({ line: 'up' })
    d.run()
    d.resume({ line: 'take lantern' })
    d.run()
    v = d.view()
    expect(v.changed.objects.has(LANTERN)).toBe(true) // moved to the player
    expect(v.pc).toBe(d.machine.state.pc)
    expect(v.frame).toBe(d.machine.state.frames.length - 1)
  })
})

describe('without a debug file', () => {
  it('names are inferred, and action:Take stops at the same place', async () => {
    const story = readSample('dark-cellar.z5')
    const parsed = parseStory(story)
    const { compile } = await import('@frotzinc/inform6-wasm')
    const reference = await findReference(parsed, async (source, lib, v) => {
      const out = await compile(source, { version: v, library: lib, debug: true })
      return out.ok && out.story && out.dbg ? { story: parseStory(out.story), symbols: readSymbols(out.dbg) } : undefined
    })
    expect(reference).toBeDefined()
    const inferred = inferSymbols(parsed, reference!)
    const take = num(inferred.actions, 'Take')
    const d = make(inferred, story)
    expect(d.addBreakpoint({ kind: 'action', action: take }).error).toBeUndefined()
    const { stop, command } = playUntilStop(d)
    expect(command).toBe('take lantern')
    expect(stop).toMatchObject({ kind: 'breakpoint' })
    expect((stop as { detail: string }).detail).toMatch(/^action Take \(noun: /)
    expect(d.inform()!.action).toEqual({ value: take, name: 'Take' })
  })
})
