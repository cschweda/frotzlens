import type { StoryFile, Symbols } from '@frotzinc/zcode'
import type { DecompileResult } from '~/workers/decompile.worker'

/**
 * The open story as Inform 6 (Phase 6), made in a worker the first time the Source view asks
 * (decompile.worker.ts), and kept for that story and those names.
 */
const result = shallowRef<DecompileResult | null>(null)
const status = ref<'idle' | 'running' | 'ready' | 'failed'>('idle')
const progress = ref('')
const failure = ref('')
let made: { story: StoryFile; symbols: Symbols | undefined } | null = null
let worker: Worker | null = null
let requestId = 0

export function useSource() {
  function make(story: StoryFile, symbols: Symbols | undefined) {
    if (made && made.story === story && made.symbols === symbols && status.value !== 'failed') return
    made = { story, symbols }
    result.value = null
    failure.value = ''
    progress.value = 'Starting…'
    status.value = 'running'
    worker?.terminate()
    worker = new Worker(new URL('../workers/decompile.worker.ts', import.meta.url), { type: 'module' })
    const mine = ++requestId
    worker.addEventListener('message', (event: MessageEvent<{ requestId: number; progress?: string; result?: DecompileResult; error?: string }>) => {
      const d = event.data
      if (d.requestId !== mine) return
      if (d.progress) progress.value = d.progress
      else if (d.result) {
        result.value = markRaw(d.result)
        status.value = 'ready'
        worker?.terminate()
        worker = null
      } else {
        failure.value = d.error ?? 'The decompiler failed.'
        status.value = 'failed'
      }
    })
    worker.addEventListener('error', () => {
      failure.value = 'The decompiler couldn’t start in this browser.'
      status.value = 'failed'
    })
    // A copy of the bytes: the story keeps its own.
    worker.postMessage({ bytes: story.bytes.slice(), symbols: symbols ? toRaw(symbols) : undefined, requestId: mine })
  }
  return { result, status, progress, failure, make }
}
