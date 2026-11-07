/// <reference lib="webworker" />
/**
 * Decompiles a story to Inform 6 (Phase 6) off the main thread, and checks it the way the tests do:
 * by compiling it again with Inform 6.44 (@frotzinc/inform6-wasm) and comparing routine by routine.
 * This worker, the compiler's WebAssembly and its library texts are fetched only when the Source
 * view is opened, never on page load.
 *
 *   IN  → { bytes: Uint8Array, symbols?: Symbols, requestId }
 *   OUT → { progress: string, requestId } (as it goes)
 *       | { result: DecompileResult, requestId } | { error: string, requestId }
 */
import { compile, type StoryVersion } from '@frotzinc/inform6-wasm'
import wasmUrl from '@frotzinc/inform6-wasm/inform6.wasm?url'
import { decompileChecked, findReference, inferSymbols, parseStory, readSymbols, type Symbols } from '@frotzinc/zcode'

export type {}

export interface DecompileResult {
  source: string
  /** For each line of the source (0-based), the address of the routine it's part of. */
  lineRoutines: (number | null)[]
  /** Routines (by address) written as statements, with control flow, and with Inform's syntax. */
  statements: number[]
  structured: number[]
  idiomatic: number[]
  /** How many routines could have been statements. */
  of: number
  /** Routines that still differed when compiled again (none, when the check came out clean). */
  differing: number[]
  /** The source compiled again at all. */
  compiled: boolean
  /** Names from the story's debug file, or made up. */
  names: 'debug file' | 'made up'
  problems: string[]
}

const locateFile = (path: string) => (path.endsWith('.wasm') ? wasmUrl : path)

self.addEventListener('message', (event: MessageEvent<{ bytes: Uint8Array; symbols?: Symbols; requestId: number }>) => {
  void (async () => {
    const { bytes, symbols, requestId } = event.data
    const progress = (text: string) => self.postMessage({ progress: text, requestId })
    try {
      const story = parseStory(bytes)
      if (story.fingerprint?.compiler !== 'inform6') throw new Error('Only a story Inform compiled can be decompiled to Inform 6.')
      const library = story.fingerprint.library?.name === 'PunyInform' ? 'puny' : 'std'
      const version = `z${story.header.version}` as StoryVersion
      let names = symbols
      if (!names) {
        progress('Compiling the library alone, to tell its code from the game’s…')
        const reference = await findReference(story, async (source, lib, v) => {
          const out = await compile(source, { version: v, library: lib, debug: true, locateFile })
          return out.ok && out.story && out.dbg ? { story: parseStory(out.story), symbols: readSymbols(out.dbg) } : undefined
        })
        if (!reference) throw new Error('Its library couldn’t be compiled alone to compare it with.')
        names = inferSymbols(story, reference)
      }
      let round = 0
      const r = await decompileChecked(story, names, async source => {
        progress(round++ ? 'Compiling it again, with the routines that didn’t come back the same put right…' : 'Compiling the source again, to check each routine comes back the same…')
        const out = await compile(source, { version, library, locateFile })
        return out.ok && out.story ? { story: parseStory(out.story) } : { errorLines: out.diagnostics.filter(d => d.severity !== 'warning' && d.line).map(d => d.line!) }
      })
      const result: DecompileResult = {
        source: r.source,
        lineRoutines: r.lineRoutines.map(a => a ?? null),
        statements: r.statements,
        structured: r.structured,
        idiomatic: r.idiomatic,
        of: r.statementRoutines.length,
        differing: r.differing,
        compiled: r.compiled,
        names: symbols ? 'debug file' : 'made up',
        problems: r.problems,
      }
      self.postMessage({ result, requestId })
    } catch (err) {
      self.postMessage({ error: err instanceof Error ? err.message : String(err), requestId })
    }
  })()
})
