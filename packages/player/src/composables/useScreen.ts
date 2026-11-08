/**
 * The screen as the player's components draw it (docs/21 §2): the story as one block per turn,
 * each a run of styled text, with the status line, the upper window and what the story is waiting
 * for. It records; it doesn't run anything. `useMachine` drives a machine with it (frotzplay), and
 * frotztrace's debugger drives one with it, so both draw the same screen with the same components.
 */
import type { Fault, ScreenModel, StopReason, StyledRun } from '@frotzinc/zmachine'
import { reactive, shallowReactive } from 'vue'
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
  /** True when the host typed the command (`send()`), not the player. */
  fed?: boolean
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

export function useScreen(version: number) {
  let nextId = 1
  /** Runs printed in this turn (window 0), gathered by print(). */
  let runs: StyledRun[] = []
  let current: TurnBlock | null = null

  const state: MachineState = reactive({
    phase: 'running',
    version,
    turns: shallowReactive([]) as TurnBlock[],
    status: { sentence: '', left: '', right: '' },
    upper: [],
    waiting: null,
    fault: null,
    script: [],
  })

  /** The machine's print hook: lower-window text, styled as the screen model says now. */
  function print(text: string, window: 0 | 1, screen: ScreenModel) {
    if (window !== 0) return
    const last = runs.at(-1)
    if (last && last.style === screen.style && last.fg === screen.colours.fg && last.bg === screen.colours.bg && last.font === screen.font) last.text += text
    else runs.push({ text, style: screen.style, fg: screen.colours.fg, bg: screen.colours.bg, font: screen.font })
  }

  /** A turn begins: the player typed `command` (or pressed a key, or a timer ran out). */
  function begin(kind: TurnKind, command: string | null, fed = false) {
    runs = []
    current = { id: nextId++, kind, command, runs: [], text: '' }
    if (fed) current.fed = true
  }

  /** The status line and upper window, as the screen model has them. */
  function readScreen(s: ScreenModel) {
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

  /** The turn ends at `stop`; returns its block (none if no turn was begun). */
  function finish(stop: StopReason, screen: ScreenModel): TurnBlock | null {
    if (!current) return null
    current.runs = forDisplay(runs, stop)
    current.text = runs.map(r => r.text).join('')
    state.turns.push(current)
    const block = current
    current = null
    readScreen(screen)
    state.waiting = stop
    state.phase = stop.kind === 'input-line' ? 'line' : stop.kind === 'input-char' ? 'char' : stop.kind === 'quit' ? 'quit' : 'fault'
    if (stop.kind === 'fault') state.fault = stop.fault
    return block
  }

  /** Mid-turn, the story waits for a save or restore answer: the turn goes on after it. */
  function waitFor(stop: StopReason & { kind: 'save' | 'restore' }) {
    state.waiting = stop
    state.phase = stop.kind
  }

  /** The machine is running. */
  function running() {
    state.phase = 'running'
  }

  /** Start over: no turns. */
  function clear() {
    state.turns.splice(0)
    state.script = []
    state.fault = null
  }

  /** A fault before anything ran (the story can't start). */
  function fail(fault: Fault) {
    state.phase = 'fault'
    state.fault = fault
  }

  /**
   * The story so far as one block (after a restore, a rewind, frotzplay's Continue): the lower
   * window as the machine has it, begun as a 'continued' turn that the next stop finishes.
   */
  function continued(lower: StyledRun[]) {
    begin('continued', null)
    runs = lower.map(r => ({ ...r }))
  }

  /** The open turn's text so far (a host that stops mid-turn, as a debugger does, shows it). */
  const pending = (): StyledRun[] => runs.map(r => ({ ...r }))

  return { state, print, begin, finish, waitFor, running, clear, fail, continued, readScreen, pending }
}

export type ScreenHandle = ReturnType<typeof useScreen>
