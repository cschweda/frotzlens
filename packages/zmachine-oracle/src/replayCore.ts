// Vendored from frotzsmith (app/modules/inform6/engine/replayCore.ts @ cf87b65), GPL-3.0-or-later.
// Changed: options.seed (reproducible randomness) and options.files (saves), see BootOptions; the
// header ZVM wrote is returned.
import type { BootOptions, EngineTarget, ReplayResult, TurnRecord } from './StoryEngine.js'
import { mulberry32 } from './random.js'
import { ZmachineEngine } from './ZmachineEngine.js'

/** An engine failure part-way through a replay; `turns` are the ones played
 *  before it (the banner first), so a caller can keep the text so far. */
export class ReplayRunError extends Error {
  constructor(message: string, public readonly turns: TurnRecord[]) {
    super(message)
    this.name = 'ReplayRunError'
  }
}

/**
 * The one testing primitive (ADR-007). Boots the story, captures the banner as
 * turn 0, then sends each command capturing per-turn output. Pure/Node-safe —
 * no worker, no DOM — so the golden test drives it directly.
 */
export async function runReplay(
  story: Uint8Array,
  target: EngineTarget,
  commands: string[],
  onProgress?: (done: number, total: number) => void,
  options: BootOptions = {},
): Promise<ReplayResult> {
  if (target !== 'zmachine') throw new Error('Glulx not yet supported')
  const started = Date.now()
  const engine = new ZmachineEngine()
  const turns: TurnRecord[] = []
  const realRandom = Math.random
  if (options.seed !== undefined) Math.random = mulberry32(options.seed)
  let header: Uint8Array | undefined

  try {
    const banner = await engine.boot(story, options.files)
    header = engine.header()
    turns.push({ command: '', output: banner })

    for (let i = 0; i < commands.length && engine.awaitingLine; i++) {
      turns.push(await engine.send(commands[i]!))
      onProgress?.(i + 1, commands.length)
    }
  } catch (err) {
    throw new ReplayRunError(err instanceof Error ? err.message : String(err), turns.slice())
  } finally {
    Math.random = realRandom
  }
  return { turns, ms: Date.now() - started, header }
}
