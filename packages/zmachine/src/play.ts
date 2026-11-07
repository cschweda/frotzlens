/**
 * Play a story from a list of commands and return each turn's text: the Node runner, and what the
 * differential tests compare with ZVM. The shape matches frotzsmith's runReplay: turn 0 is the
 * banner, then one turn per command, until the story stops asking for a line.
 *
 * Two commands aren't typed text: `[timeout]` says a timed read's interval ran out (the timer
 * firing, recorded in a command script so a replay is deterministic: frotzplay-design §6), and
 * `[key x]` presses a key for @read_char (`[key]` alone is Return). Without one of those, a
 * request for a key press ends play, as it does in frotzsmith's ZVM replay.
 */
import { Machine } from './machine.js'
import { normalizeTurn } from './normalize.js'
import type { Fault, MachineOptions, StopReason } from './types.js'

export interface PlayOptions extends MachineOptions {
  /**
   * Save files, by name. A save writes the story's file to 'save'; a restore reads it (and fails
   * when there's none). Pass a Map to start with a file, or to take the one written.
   */
  files?: Map<string, Uint8Array>
}

export interface Turn {
  /** '' for the banner. */
  command: string
  output: string
}

export interface PlayResult {
  turns: Turn[]
  /** Why play stopped before the commands ran out: a quit, a key press wanted, or a fault. */
  stoppedBy?: 'quit' | 'input-char' | Fault
  /** The machine, for a test that wants to look inside. */
  machine?: Machine
}

/** Instructions one turn may run before it's taken to be looping. */
const TURN_LIMIT = 50_000_000

/**
 * A turn's text after a command. A screen shows the command echoed on its own line first, so the
 * turn is normalized with that line in place and then the line is dropped: text that begins with
 * spaces (a centred chapter title) keeps them, as it does on the screen and in frotzsmith's ZVM
 * transcripts.
 */
function turnText(command: string, text: string): string {
  const out = normalizeTurn(`${command}\n${text}`)
  const nl = out.indexOf('\n')
  const first = (nl === -1 ? out : out.slice(0, nl)).trim()
  return first === command.trim() ? out.slice(nl === -1 ? out.length : nl + 1).replace(/^\n+/, '') : out
}

export function play(story: Uint8Array, commands: string[], options: PlayOptions): PlayResult {
  const m = Machine.create(story, options)
  if (!(m instanceof Machine)) return { turns: [], stoppedBy: m.fault }
  const turns: Turn[] = []

  const files = options.files ?? new Map<string, Uint8Array>()
  const runTurn = (): StopReason => {
    let stop: StopReason
    let ran = 0
    for (;;) {
      stop = m.run(1_000_000)
      ran += 1_000_000
      // Saves and restores happen inside a turn: answer them from `files` and go on.
      if (stop.kind === 'save') {
        files.set('save', stop.data)
        m.resume({ saved: true })
      } else if (stop.kind === 'restore') {
        notices.push(m.resume({ restore: files.get('save') ?? null }))
      } else if (stop.kind !== 'budget' || ran >= TURN_LIMIT) return stop
    }
  }
  const notices: (Fault | null)[] = []

  let stop = runTurn()
  turns.push({ command: '', output: normalizeTurn(m.flushText()) })
  for (const command of commands) {
    const key = /^\[key(?: (.))?\]$/.exec(command)
    let input: Parameters<Machine['resume']>[0]
    if (command === '[timeout]' && (stop.kind === 'input-line' || stop.kind === 'input-char') && stop.timeout) input = { timeout: true }
    else if (key && stop.kind === 'input-char') input = { char: key[1] ? key[1].charCodeAt(0) : 13 }
    else if (stop.kind === 'input-line' && !key && command !== '[timeout]') input = { line: command }
    else break
    const fault = m.resume(input)
    if (fault) return { turns, stoppedBy: fault, machine: m }
    stop = runTurn()
    // A typed line is echoed on the screen; a key press or the timer isn't.
    turns.push({ command, output: 'line' in input ? turnText(command, m.flushText()) : normalizeTurn(m.flushText()) })
  }
  const result: PlayResult = { turns, machine: m }
  if (stop.kind === 'quit' || stop.kind === 'input-char') result.stoppedBy = stop.kind
  else if (stop.kind === 'fault') result.stoppedBy = stop.fault
  else if (stop.kind === 'budget') result.stoppedBy = { code: 'bad-story', message: `a turn ran more than ${TURN_LIMIT.toLocaleString('en')} instructions without stopping`, pc: m.state.pc }
  return result
}
