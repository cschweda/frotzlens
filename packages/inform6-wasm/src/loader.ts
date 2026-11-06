import type { Inform6Module } from '../wasm/inform6.mjs'

/** The subset of the Emscripten module this package uses. */
export type Inform6Instance = Inform6Module

type Factory = (opts?: Record<string, unknown>) => Promise<Inform6Instance>

let factory: Promise<Factory> | null = null

/**
 * The Emscripten factory, loaded once (lazily) and cached. A failed load
 * clears the cache so the next compile retries instead of re-throwing a stale
 * rejection for the rest of the session.
 */
function getFactory(): Promise<Factory> {
  factory ??= import('../wasm/inform6.mjs').then(
    m => m.default as Factory,
    (err: unknown) => {
      factory = null
      throw err
    },
  )
  return factory
}

/**
 * A FRESH compiler instance. The compiler holds global state and is not safe
 * to run `main()` twice, so every compile needs its own.
 */
export async function createInstance(hooks: {
  print: (line: string) => void
  printErr: (line: string) => void
  locateFile?: (path: string) => string
}): Promise<Inform6Instance> {
  const f = await getFactory()
  return f({
    print: hooks.print,
    printErr: hooks.printErr,
    ...(hooks.locateFile ? { locateFile: hooks.locateFile } : {}),
  })
}
