import type { StoryFile } from '@frotzinc/zcode'
import { createWorkerRpc } from '@frotzinc/worker-rpc'

/**
 * The story being inspected. The model is large (thousands of routines), so it
 * sits in a shallowRef and is marked raw: Vue never walks it to make it reactive.
 *
 * Loading: a Web Worker parses it (worker-rpc), falling back to the main thread
 * if the worker can't run — the shape of Frotzsmith's useI6Wasm.
 */
const story = shallowRef<StoryFile | null>(null)
const fileName = ref('')
const status = ref<'empty' | 'loading' | 'ready' | 'failed'>('empty')
const failure = ref('')

const PARSE_TIMEOUT_MS = 30_000
let workerBroken = false

const rpc = import.meta.client
  ? createWorkerRpc<StoryFile>({
      spawn: () => new Worker(new URL('../workers/parse.worker.ts', import.meta.url), { type: 'module' }),
      parse: data =>
        data.result !== undefined
          ? { kind: 'ok', value: data.result as StoryFile }
          : { kind: 'error', message: String(data.error ?? 'the parser failed') },
    })
  : null

async function parse(bytes: Uint8Array): Promise<StoryFile> {
  if (rpc && !workerBroken && typeof Worker !== 'undefined') {
    const outcome = await rpc.call({ bytes }, { timeoutMs: PARSE_TIMEOUT_MS })
    if (outcome.kind === 'ok') return outcome.value
    if (outcome.kind === 'timeout') throw new Error(`Reading the file took more than ${PARSE_TIMEOUT_MS / 1000} seconds and was stopped.`)
    if (outcome.kind === 'unavailable') workerBroken = true
  }
  const { parseStory } = await import('@frotzinc/zcode')
  return parseStory(bytes)
}

export function useStory() {
  async function open(name: string, bytes: Uint8Array) {
    status.value = 'loading'
    fileName.value = name
    failure.value = ''
    try {
      story.value = markRaw(await parse(bytes))
      status.value = 'ready'
    } catch (e) {
      story.value = null
      failure.value = e instanceof Error ? e.message : String(e)
      status.value = 'failed'
    }
  }

  async function openFile(file: File) {
    await open(file.name, new Uint8Array(await file.arrayBuffer()))
  }

  async function openUrl(name: string, url: string) {
    status.value = 'loading'
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      await open(name, new Uint8Array(await res.arrayBuffer()))
    } catch (e) {
      failure.value = `The sample couldn't be loaded: ${e instanceof Error ? e.message : String(e)}`
      status.value = 'failed'
    }
  }

  function close() {
    story.value = null
    fileName.value = ''
    status.value = 'empty'
  }

  return { story, fileName, status, failure, openFile, openUrl, close }
}
