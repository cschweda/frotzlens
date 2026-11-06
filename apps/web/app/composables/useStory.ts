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
/** Each load takes a number; only the latest may commit, so a slow earlier load never wins. */
let generation = 0
/** The parse in flight: the next one's timeout starts when it settles (the worker is busy until then). */
let previous: Promise<unknown> = Promise.resolve()

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
    const call = rpc.call({ bytes }, { timeoutMs: PARSE_TIMEOUT_MS, clockStartsAfter: previous })
    previous = call
    const outcome = await call
    if (outcome.kind === 'ok') return outcome.value
    if (outcome.kind === 'timeout') throw new Error(`Reading the file took more than ${PARSE_TIMEOUT_MS / 1000} seconds and was stopped.`)
    if (outcome.kind === 'unavailable') workerBroken = true
  }
  const { parseStory } = await import('@frotzinc/zcode')
  return parseStory(bytes)
}

export function useStory() {
  /** Read the bytes (a file or a URL), parse them, and commit, unless a newer load started meanwhile. */
  async function load(name: string, read: () => Promise<ArrayBuffer>, what: string) {
    const mine = ++generation
    status.value = 'loading'
    failure.value = ''
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await read())
    } catch (e) {
      if (mine !== generation) return
      story.value = null // back to the drop zone, where the failure is shown
      failure.value = `${what} couldn't be read: ${e instanceof Error ? e.message : String(e)}`
      status.value = 'failed'
      return
    }
    try {
      const parsed = await parse(bytes)
      if (mine !== generation) return
      story.value = markRaw(parsed)
      fileName.value = name
      status.value = 'ready'
    } catch (e) {
      if (mine !== generation) return
      story.value = null
      failure.value = e instanceof Error ? e.message : String(e)
      status.value = 'failed'
    }
  }

  const openFile = (file: File) => load(file.name, () => file.arrayBuffer(), 'The file')

  const openUrl = (name: string, url: string) =>
    load(name, async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res.arrayBuffer()
    }, 'The sample')

  function close() {
    generation++ // a load still running is dropped
    story.value = null
    fileName.value = ''
    failure.value = ''
    status.value = 'empty'
  }

  return { story, fileName, status, failure, openFile, openUrl, close }
}
