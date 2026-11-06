/// <reference lib="webworker" />
/**
 * Parses a story file off the main thread. The model comes back by structured
 * clone (it's plain data, by design).
 *
 *   IN  → { bytes: Uint8Array, requestId }
 *   OUT → { result: StoryFile, requestId } | { error: string, requestId }
 */
import { parseStory } from '@frotzinc/zcode'

export type {}

self.addEventListener('message', (event: MessageEvent<{ bytes: Uint8Array; requestId: number }>) => {
  const { bytes, requestId } = event.data
  try {
    self.postMessage({ result: parseStory(bytes), requestId })
  } catch (err) {
    self.postMessage({ error: String(err), requestId })
  }
})
