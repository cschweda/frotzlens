/**
 * The player's side of the interpreter (docs/13 §2): run @frotzinc/zmachine in slices on the main
 * thread (yielding between them, so the page stays responsive), turn its stops into state, and keep
 * the story as one block per turn.
 */
import { Machine, type Fault, type MachineSnapshot, type StopReason, type StyledRun } from '@frotzinc/zmachine'
import { markRaw, reactive, shallowReactive } from 'vue'
import { statusSentence } from '../announce.js'

export type TurnKind = 'banner' | 'line' | 'key' | 'timer' | 'continued'

export interface TurnBlock {
  id: number
  kind: TurnKind
  /** What the player typed (or the key they pressed); null for the banner and timer turns. */
  command: string | null
  runs: StyledRun[]
  /** The turn's text, unstyled (for the announcer and the transcript export). */
  text: string
}

export type Phase = 'running' | 'line' | 'char' | 'save' | 'restore' | 'quit' | 'fault'

export interface MachineState {
  phase: Phase
  version: number
  turns: TurnBlock[]
  /** The status line as a sentence (announced on change), and as drawn. */
  status: { sentence: string; left: string; right: string }
  /** The upper window's rows (v4+), as text. */
  upper: string[]
  /** What the machine is waiting on, when it is. */
  waiting: StopReason | null
  fault: Fault | null
  /** The commands so far, `[timeout]` and `[key x]` included: a script zmachine-run replays. */
  script: string[]
}

export interface MachineOptions {
  seed: number
  /** Instructions per slice before yielding to the page. */
  slice?: number
  /** Called when a turn ends (the machine waits for input, or stops). */
  onTurn?: (block: TurnBlock, state: MachineState) => void
}

const yieldToPage = () => new Promise<void>(r => setTimeout(r, 0))

/**
 * The runs as the transcript shows them: leading blank lines dropped, and, when the story now waits
 * for a command, its trailing prompt ("> ") too, since the next turn starts with the command after
 * its own "> ". The turn's `text` keeps everything (the "full" announcement, the export).
 */
function forDisplay(runs: StyledRun[], stop: StopReason): StyledRun[] {
  const out = runs.map(r => ({ ...r }))
  while (out.length && /^\s*$/.test(out[0]!.text)) out.shift()
  if (out.length) out[0]!.text = out[0]!.text.replace(/^\n+/, '')
  if (stop.kind === 'input-line') {
    while (out.length && /^\s*>?\s*$/.test(out.at(-1)!.text)) out.pop()
    if (out.length) out.at(-1)!.text = out.at(-1)!.text.replace(/\n*>?[ \t]*$/, '').replace(/\s+$/, '')
  }
  return out
}

export function useMachine(story: Uint8Array, options: MachineOptions) {
  let machine: Machine
  let nextId = 1
  /** Runs printed in this turn (window 0), gathered by the print hook. */
  let runs: StyledRun[] = []
  let current: TurnBlock | null = null
  /** The snapshot as the last turn began: "go back one turn" after a fault. */
  let previous: MachineSnapshot | null = null

  const state: MachineState = reactive({
    phase: 'running',
    version: story[0] ?? 0,
    turns: shallowReactive([]) as TurnBlock[],
    status: { sentence: '', left: '', right: '' },
    upper: [],
    waiting: null,
    fault: null,
    script: [],
  })

  const hooks = {
    print(text: string, window: 0 | 1) {
      if (window !== 0) return
      const s = machine.state.screen
      const last = runs.at(-1)
      if (last && last.style === s.style && last.fg === s.colours.fg && last.bg === s.colours.bg && last.font === s.font) last.text += text
      else runs.push({ text, style: s.style, fg: s.colours.fg, bg: s.colours.bg, font: s.font })
    },
  }

  function create(): Machine | null {
    const m = Machine.create(story, { seed: options.seed, hooks })
    if (!(m instanceof Machine)) {
      state.phase = 'fault'
      state.fault = m.fault
      return null
    }
    return markRaw(m)
  }

  function begin(kind: TurnKind, command: string | null) {
    runs = []
    current = { id: nextId++, kind, command, runs: [], text: '' }
  }

  function readScreen() {
    const s = machine.state.screen
    const rows = s.upper.grid.map(row => row.map(c => c.ch).join('').replace(/\s+$/, ''))
    state.upper = rows
    if (state.version === 3) {
      const line = s.statusLine
      state.status = {
        sentence: statusSentence(3, line, undefined),
        left: line?.location ?? '',
        right: !line ? '' : line.hours !== undefined ? `${line.hours % 24}:${String(line.minutes ?? 0).padStart(2, '0')}` : `Score: ${line.score ?? 0}  Moves: ${line.moves ?? 0}`,
      }
    } else {
      // The game spaces its own fields across the row: split at the first wide gap, as v3's bar.
      const first = rows[0] ?? ''
      const m = /^\s*(.*?\S)\s{3,}(\S.*?)\s*$/.exec(first)
      state.status = { sentence: statusSentence(state.version, undefined, first), left: m ? m[1]! : first.trim(), right: m ? m[2]! : '' }
    }
  }

  function finish(stop: StopReason) {
    if (current) {
      current.runs = forDisplay(runs, stop)
      current.text = runs.map(r => r.text).join('')
      state.turns.push(current)
      const block = current
      current = null
      readScreen()
      state.waiting = stop
      state.phase = stop.kind === 'input-line' ? 'line' : stop.kind === 'input-char' ? 'char' : stop.kind === 'quit' ? 'quit' : 'fault'
      if (stop.kind === 'fault') state.fault = stop.fault
      options.onTurn?.(block, state)
    }
  }

  /** Run until the machine stops for something the player must give (or it quits, or faults). */
  async function go() {
    state.phase = 'running'
    for (;;) {
      const stop = machine.run(options.slice ?? 20_000)
      if (stop.kind === 'budget') {
        await yieldToPage()
        continue
      }
      machine.flushText() // the runs are kept by the hook; the plain buffer isn't needed
      if (stop.kind === 'save' || stop.kind === 'restore') {
        // Mid-turn: the player answers, and the turn goes on (answerSave, answerRestore).
        state.waiting = stop
        state.phase = stop.kind
        return
      }
      finish(stop)
      return
    }
  }

  async function start() {
    const m = create()
    if (!m) return
    machine = m
    state.turns.splice(0)
    state.script = []
    state.fault = null
    begin('banner', null)
    await go()
  }

  async function submitLine(line: string) {
    if (state.phase !== 'line') return
    previous = machine.snapshot()
    state.script.push(line)
    begin('line', line)
    machine.resume({ line })
    await go()
  }

  async function pressKey(code: number, label: string) {
    if (state.phase !== 'char') return
    previous = machine.snapshot()
    state.script.push(code === 13 ? '[key]' : `[key ${String.fromCharCode(code)}]`)
    begin('key', label)
    machine.resume({ char: code })
    await go()
  }

  /** A timed read's interval ran out: the interrupt routine runs (and may end the read). */
  async function timeout() {
    if (state.phase !== 'line' && state.phase !== 'char') return
    state.script.push('[timeout]')
    begin('timer', null)
    machine.resume({ timeout: true })
    await go()
  }

  /** After a `save` stop: did the host keep the file? */
  async function answerSave(saved: boolean) {
    if (state.phase !== 'save') return
    machine.resume({ saved })
    await go()
  }

  /** After a `restore` stop: the file, or null (cancelled). Returns the reason in words if the file was refused. */
  async function answerRestore(bytes: Uint8Array | null): Promise<string | null> {
    if (state.phase !== 'restore') return null
    const notice = machine.resume({ restore: bytes })
    await go()
    return notice?.message ?? null
  }

  /** The current state, for autosave. */
  const snapshot = (): MachineSnapshot | null => (machine && state.phase !== 'fault' ? machine.snapshot() : null)

  /** Carry on from a snapshot (autosave's "Continue", or "go back one turn" after a fault). */
  async function continueFrom(snap: MachineSnapshot): Promise<boolean> {
    const m = Machine.fromSnapshot(story, snap, { seed: options.seed, hooks })
    if (!(m instanceof Machine)) return false
    machine = markRaw(m)
    state.fault = null
    // The story so far, as one block: the lower window as the snapshot has it.
    begin('continued', null)
    runs = snap.screen.lower.runs.map(r => ({ ...r }))
    await go()
    return true
  }

  /** After a fault: the state before the last command, if there is one. */
  async function backOneTurn(): Promise<boolean> {
    return previous ? continueFrom(previous) : false
  }

  /** The story the machine reads its text from, for upper-window reading etc. */
  const screen = () => machine?.state.screen

  return { state, start, submitLine, pressKey, timeout, answerSave, answerRestore, snapshot, continueFrom, backOneTurn, screen, canGoBack: () => previous !== null }
}

export type MachineHandle = ReturnType<typeof useMachine>
