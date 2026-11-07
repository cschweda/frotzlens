/**
 * Play a story from a list of commands and return each turn's text: the Node runner, and what the
 * differential tests compare with ZVM. The shape matches Frotzsmith's runReplay: turn 0 is the
 * banner, then one turn per command, until the story stops asking for a line.
 */
import { Machine } from './machine.js'
import { normalizeTurn } from './normalize.js'
import type { Fault, MachineOptions, StopReason } from './types.js'

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
 * spaces (a centred chapter title) keeps them, as it does on the screen and in Frotzsmith's ZVM
 * transcripts.
 */
function turnText(command: string, text: string): string {
  const out = normalizeTurn(`${command}\n${text}`)
  const nl = out.indexOf('\n')
  const first = (nl === -1 ? out : out.slice(0, nl)).trim()
  return first === command.trim() ? out.slice(nl === -1 ? out.length : nl + 1).replace(/^\n+/, '') : out
}

export function play(story: Uint8Array, commands: string[], options: MachineOptions): PlayResult {
  const m = Machine.create(story, options)
  if (!(m instanceof Machine)) return { turns: [], stoppedBy: m.fault }
  const turns: Turn[] = []

  const runTurn = (): StopReason => {
    let stop: StopReason
    let ran = 0
    do {
      stop = m.run(1_000_000)
      ran += 1_000_000
    } while (stop.kind === 'budget' && ran < TURN_LIMIT)
    return stop
  }

  let stop = runTurn()
  turns.push({ command: '', output: normalizeTurn(m.flushText()) })
  for (const command of commands) {
    if (stop.kind !== 'input-line') break
    const fault = m.resume({ line: command })
    if (fault) return { turns, stoppedBy: fault, machine: m }
    stop = runTurn()
    turns.push({ command, output: turnText(command, m.flushText()) })
  }
  const result: PlayResult = { turns, machine: m }
  if (stop.kind === 'quit' || stop.kind === 'input-char') result.stoppedBy = stop.kind
  else if (stop.kind === 'fault') result.stoppedBy = stop.fault
  else if (stop.kind === 'budget') result.stoppedBy = { code: 'bad-story', message: `a turn ran more than ${TURN_LIMIT.toLocaleString('en')} instructions without stopping`, pc: m.state.pc }
  return result
}
