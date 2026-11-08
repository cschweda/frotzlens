/**
 * The player's side of the interpreter (docs/13 §2): run @frotzinc/zmachine in slices on the main
 * thread (yielding between them, so the page stays responsive), turn its stops into state, and keep
 * the story as one block per turn.
 */
import { Machine, type MachineSnapshot, type StopReason } from '@frotzinc/zmachine'
import { markRaw } from 'vue'
import { useScreen, type MachineState, type TurnBlock } from './useScreen.js'

export type { MachineState, Phase, TurnBlock, TurnKind } from './useScreen.js'

export interface MachineOptions {
  seed: number
  /** Instructions per slice before yielding to the page. */
  slice?: number
  /** Called when a turn ends (the machine waits for input, or stops). */
  onTurn?: (block: TurnBlock, state: MachineState) => void
}

const yieldToPage = () => new Promise<void>(r => setTimeout(r, 0))

export function useMachine(story: Uint8Array, options: MachineOptions) {
  let machine: Machine
  /** The snapshot as the last turn began: "go back one turn" after a fault. */
  let previous: MachineSnapshot | null = null
  const screenState = useScreen(story[0] ?? 0)
  const state = screenState.state

  const hooks = {
    print(text: string, window: 0 | 1) {
      screenState.print(text, window, machine.state.screen)
    },
  }

  function create(): Machine | null {
    const m = Machine.create(story, { seed: options.seed, hooks })
    if (!(m instanceof Machine)) {
      screenState.fail(m.fault)
      return null
    }
    return markRaw(m)
  }

  function finish(stop: StopReason) {
    const block = screenState.finish(stop, machine.state.screen)
    if (block) options.onTurn?.(block, state)
  }

  /** Run until the machine stops for something the player must give (or it quits, or faults). */
  async function go() {
    screenState.running()
    for (;;) {
      const stop = machine.run(options.slice ?? 20_000)
      if (stop.kind === 'budget') {
        await yieldToPage()
        continue
      }
      machine.flushText() // the runs are kept by the hook; the plain buffer isn't needed
      if (stop.kind === 'save' || stop.kind === 'restore') {
        // Mid-turn: the player answers, and the turn goes on (answerSave, answerRestore).
        screenState.waitFor(stop)
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
    screenState.clear()
    screenState.begin('banner', null)
    await go()
  }

  async function submitLine(line: string, fed = false) {
    if (state.phase !== 'line') return
    previous = machine.snapshot()
    state.script.push(line)
    screenState.begin('line', line, fed)
    machine.resume({ line })
    await go()
  }

  async function pressKey(code: number, label: string, fed = false) {
    if (state.phase !== 'char') return
    previous = machine.snapshot()
    state.script.push(code === 13 ? '[key]' : `[key ${String.fromCharCode(code)}]`)
    screenState.begin('key', label, fed)
    machine.resume({ char: code })
    await go()
  }

  /** A timed read's interval ran out: the interrupt routine runs (and may end the read). */
  async function timeout() {
    if (state.phase !== 'line' && state.phase !== 'char') return
    state.script.push('[timeout]')
    screenState.begin('timer', null)
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
    screenState.continued(snap.screen.lower.runs)
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
