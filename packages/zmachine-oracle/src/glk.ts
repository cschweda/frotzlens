// Vendored from frotzsmith (app/modules/inform6/engine/glk.ts @ cf87b65), GPL-3.0-or-later.
// Changed: Node only. The browser-worker branch (indirect eval of glkapi.js) is gone; this
// package runs in Vitest and the Node runner, never in a browser.
//
// glkapi.js is a module-level singleton: its event-generation counter and window list live in
// module scope and are never reset between games. A process that boots more than one story must
// hand each engine a FRESH Glk, or the second boot's init event is rejected with a "wrong
// generation number" and the VM never starts. Re-requiring with a busted cache re-runs its IIFE.
import { createRequire } from 'node:module'

/** The Glk (glkapi) surface the engine touches. Untyped beyond `init`. */
export interface Glk {
  init(options: unknown): void
  [key: string]: unknown
}

const nodeRequire = createRequire(import.meta.url)

/** A fresh Glk instance for one boot. */
export async function createGlk(): Promise<Glk> {
  const path = nodeRequire.resolve('glkote-term/src/glkapi.js')
  delete nodeRequire.cache[path]
  return nodeRequire(path) as Glk
}
