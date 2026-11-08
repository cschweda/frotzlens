import { liveTables, parseStory, readSymbols, type StoryFile, type Symbols } from '@frotzinc/zcode'
import { useScreen, type ScreenHandle } from '@frotzinc/player'
import { Debugger, describeBreakpoint, parseBreakpoint, parseExpr, routineLabel, type Breakpoint, type DebugStop, type MachineView, type StopReason } from '@frotzinc/zmachine'

/**
 * The debugging session (docs/21): one story under the Debugger, on the main thread in slices
 * (decision A), drawing its screen with @frotzinc/player's useScreen (decision B). Every stop bumps
 * `tick`, and the views read what they show from `live()` then.
 */

export interface Opened {
  name: string
  bytes: Uint8Array
  /** The debug file's text, if there is one. */
  dbg?: string
  sources: { name: string; text: string }[]
  /** A sample's walkthrough: "Next command" types these. */
  walkthrough?: string[]
}

/** Instructions per slice before yielding to the page (about a millisecond). */
const SLICE = 20_000
/** A step over or out runs until done, up to this, without yielding: a call rarely takes long. */
const STEP_LIMIT = 10_000_000
const yieldToPage = () => new Promise<void>(r => setTimeout(r, 0))

const state = reactive({
  open: false,
  name: '',
  running: false,
  /** Why it last stopped. */
  stop: null as DebugStop | null,
  /** Bumped at every stop: what the views watch. */
  tick: 0,
  error: '',
  walkthrough: [] as string[],
  nextCommand: 0,
})

let dbg: Debugger | null = null
let story: StoryFile | null = null
let symbols: Symbols | undefined
const screen = shallowRef<ScreenHandle | null>(null)
const sources = shallowRef<{ name: string; text: string }[]>([])
let pauseWanted = false

function ensure(): Debugger {
  if (!dbg) throw new Error('no story is open')
  return dbg
}

/** The stop the machine is waiting at, if it is (without running anything). */
function waiting(): StopReason | null {
  const s = ensure().machine.run(0)
  return s.kind === 'budget' ? null : s
}

function stopped(s: DebugStop) {
  state.running = false
  state.stop = s
  const d = ensure()
  if (s.kind === 'input-line' || s.kind === 'input-char' || s.kind === 'quit' || s.kind === 'fault') screen.value?.finish(s, d.machine.state.screen)
  state.tick++
}

/** Run a control call, in slices when it's a run; save and restore are answered on the way. */
async function go(step: () => DebugStop, sliced: boolean) {
  const d = ensure()
  state.running = true
  screen.value?.running()
  let lastSave: Uint8Array | null = null
  for (;;) {
    if (pauseWanted) {
      pauseWanted = false
      d.pause()
    }
    const s = step()
    if (s.kind === 'budget' && sliced) {
      await yieldToPage()
      step = () => d.run(SLICE)
      continue
    }
    if (s.kind === 'save') {
      lastSave = s.data
      d.resume({ saved: true })
      step = () => d.run(SLICE)
      continue
    }
    if (s.kind === 'restore') {
      d.resume({ restore: lastSave })
      step = () => d.run(SLICE)
      continue
    }
    d.machine.flushText() // the screen keeps the runs
    stopped(s)
    return
  }
}

/** After going back in time: the transcript is the story so far, as the machine had it then. */
function redrawAfterRewind(s: DebugStop) {
  const d = ensure()
  const sc = useScreen(d.machine.version)
  sc.continued(d.machine.state.screen.lower.runs)
  const w = waiting()
  if (w) sc.finish(w, d.machine.state.screen)
  else sc.readScreen(d.machine.state.screen)
  screen.value = markRaw(sc)
  state.running = false
  state.stop = s
  state.tick++
}

export function useSession() {
  async function open(o: Opened) {
    state.error = ''
    let parsed: StoryFile
    try {
      parsed = parseStory(o.bytes)
    } catch (e) {
      state.error = `${o.name} isn't a story file frotztrace can read: ${(e as Error).message}`
      return
    }
    let names: Symbols | undefined
    if (o.dbg) {
      const s = readSymbols(o.dbg)
      if (Object.keys(s.routines).length) names = s
      else state.error = `The debug file couldn't be read: ${s.problems[0] ?? 'it has no names in it'}. The story opens without names.`
    }
    const sc = useScreen(o.bytes[0] ?? 0)
    const made = Debugger.create(o.bytes, {
      seed: 1,
      symbols: names,
      trace: { capacity: 20_000, kinds: ['call', 'return'] },
      // To whichever screen is current: going back in time makes a new one.
      hooks: { print: (text, window) => screen.value?.print(text, window, dbg!.machine.state.screen) },
    })
    if (!(made instanceof Debugger)) {
      state.error = made.fault.message
      return
    }
    dbg = markRaw(made)
    story = markRaw(parsed)
    symbols = names ? markRaw(names) : undefined
    screen.value = markRaw(sc)
    sources.value = o.sources
    // The shared views name things through zcode-ui's symbols store.
    useSymbols().symbols.value = symbols ?? null
    state.open = true
    state.name = o.name
    state.walkthrough = o.walkthrough ?? []
    state.nextCommand = 0
    sc.begin('banner', null)
    await go(() => ensure().run(SLICE), true)
  }

  function close() {
    dbg = null
    story = null
    symbols = undefined
    screen.value = null
    useSymbols().symbols.value = null
    state.open = false
    state.stop = null
    state.tick++
  }

  const busy = () => !dbg || state.running

  return {
    state,
    screen,
    sources,
    open,
    close,
    run: () => !busy() && go(() => ensure().run(SLICE), true),
    pause: () => {
      if (state.running) pauseWanted = true
    },
    stepInto: () => !busy() && go(() => ensure().stepInstruction(), false),
    stepOver: () => !busy() && go(() => ensure().stepOver(STEP_LIMIT), false),
    stepOut: () => !busy() && go(() => ensure().stepOut(STEP_LIMIT), false),
    stepLine: () => !busy() && go(() => ensure().stepLine(STEP_LIMIT), false),
    stepBack: () => {
      if (busy()) return
      redrawAfterRewind(ensure().stepBack())
    },
    goToTurn: (t: number) => {
      if (busy()) return
      redrawAfterRewind(ensure().goToTurn(t))
    },
    goToInstruction: (n: number) => {
      if (busy()) return
      redrawAfterRewind(ensure().goToInstruction(n))
    },
    /** The player typed a line (or the walkthrough did). */
    submitLine: async (line: string) => {
      if (busy() || waiting()?.kind !== 'input-line') return
      screen.value!.begin('line', line)
      ensure().resume({ line })
      await go(() => ensure().run(SLICE), true)
    },
    pressKey: async (code: number, label: string) => {
      if (busy() || waiting()?.kind !== 'input-char') return
      screen.value!.begin('key', label)
      ensure().resume({ char: code })
      await go(() => ensure().run(SLICE), true)
    },
    nextWalkthroughCommand: () => state.walkthrough[state.nextCommand],

    // ── breakpoints ──
    addBreakpoint(text: string, condition?: string): string | null {
      if (!story) return 'no story is open'
      const spec = parseBreakpoint(text, story, symbols)
      if (typeof spec === 'string') return spec
      const bp = ensure().addBreakpoint(condition?.trim() ? { ...spec, condition: condition.trim() } : spec)
      state.tick++
      if (bp.error) {
        ensure().removeBreakpoint(bp.id)
        return bp.error
      }
      return null
    },
    toggleAddressBreakpoint(address: number) {
      const d = ensure()
      const there = d.breakpoints.find(b => b.kind === 'address' && b.address === address)
      if (there) d.removeBreakpoint(there.id)
      else d.addBreakpoint({ kind: 'address', address })
      state.tick++
    },
    /** A source line's breakpoint, on or off (Source's gutter). */
    toggleLineBreakpoint(file: string, line: number): string | null {
      const d = ensure()
      const there = d.breakpoints.find(b => b.kind === 'line' && b.file === file && b.line === line)
      state.tick++
      if (there) {
        d.removeBreakpoint(there.id)
        return null
      }
      const bp = d.addBreakpoint({ kind: 'line', file, line })
      if (bp.error) {
        d.removeBreakpoint(bp.id)
        return bp.error
      }
      return null
    },
    /** A watch, or why the expression doesn't parse (one that can't be evaluated now is kept: it may later). */
    addWatch(expression: string): string | null {
      try {
        parseExpr(expression)
      } catch (e) {
        return (e as Error).message
      }
      ensure().addWatch(expression)
      state.tick++
      return null
    },
    /** F9: a breakpoint on the line the machine is on (or, without lines, its instruction), on or off. */
    toggleHere(): string | null {
      const d = ensure()
      const where = d.sourceLine()
      const file = symbols?.sources[0]
      if (where && file && file.endsWith(where.file)) return this.toggleLineBreakpoint(where.file, where.line)
      this.toggleAddressBreakpoint(d.machine.state.pc)
      return null
    },
    removeWatch(id: number) {
      ensure().removeWatch(id)
      state.tick++
    },
    removeBreakpoint(id: number) {
      ensure().removeBreakpoint(id)
      state.tick++
    },
    setBreakpointEnabled(id: number, on: boolean) {
      ensure().setBreakpointEnabled(id, on)
      state.tick++
    },
    describe: (b: Breakpoint) => (story ? describeBreakpoint(b, story, symbols) : ''),

    // ── what the views show (read after a stop; `tick` says when) ──
    live() {
      void state.tick
      if (!dbg || !story) return null
      const d = dbg
      const view: MachineView = d.view()
      const tables = liveTables(story, view.memory)
      return {
        debugger: d,
        story,
        /** The story with its object table and globals as they are now. */
        liveStory: markRaw({ ...story, objects: tables.objects, globals: tables.globals }) as StoryFile,
        symbols,
        view,
        stack: d.stack(),
        breakpoints: d.breakpoints.map(b => ({ ...b })),
        inform: d.inform(),
        where: d.sourceLine(),
        timeline: d.timeline(),
        watches: d.watches(),
        name: (address: number) => routineLabel(story!, symbols, address),
      }
    },
  }
}
