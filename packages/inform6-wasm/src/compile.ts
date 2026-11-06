import { parseDiagnostics, parseStats } from './diagnostics.js'
import { INCLUDE_PATH, LIBRARY_FILES } from './library.js'
import { createInstance } from './loader.js'
import type { CompileOptions, CompileOutput, Extension, StoryVersion } from './types.js'

const VERSION_SWITCH: Record<StoryVersion, string> = {
  z3: '-v3',
  z4: '-v4',
  z5: '-v5',
  z8: '-v8',
  ulx: '-G',
}

/**
 * Compiles Inform 6 source with the bundled Inform 6.44 and library.
 *
 * Mounts extensions, then the library, then any extension that explicitly
 * overrides a library file — so an extension named like a library file can
 * never replace it by accident. Runs identically in a Web Worker, on the main
 * thread, and under Node. Never rejects for ordinary compile errors: those come
 * back as `ok: false` with diagnostics.
 */
export async function compile(source: string, opts: CompileOptions = {}): Promise<CompileOutput> {
  const version = opts.version ?? 'z5'
  const library = opts.library ?? 'std'
  const includePath = INCLUDE_PATH[library]
  const started = performance.now()
  const out: string[] = []

  const hooks = { print: (line: string) => out.push(line), printErr: (line: string) => out.push(line) }
  const m = opts.instantiate
    ? await opts.instantiate(hooks)
    : await createInstance({ ...hooks, ...(opts.locateFile ? { locateFile: opts.locateFile } : {}) })

  const mkdir = (path: string) => {
    try {
      m.FS.mkdir(path)
    } catch {
      // already exists — fine
    }
  }

  mkdir('/lib')
  mkdir(includePath)
  const exts = opts.extensions ?? []
  const mount = (e: Extension) => m.FS.writeFile(`${includePath}/${e.name}.h`, e.content)
  for (const e of exts) if (!e.overridesLibrary) mount(e)
  for (const file of LIBRARY_FILES[library]) m.FS.writeFile(file.path, file.content)
  for (const e of exts) if (e.overridesLibrary) mount(e)

  mkdir('/work')
  m.FS.writeFile('/work/story.inf', source)
  m.FS.chdir('/work') // Inform writes output relative to the working directory

  const outName = `story.${version}`
  let crash: string | null = null
  try {
    m.callMain([
      `+include_path=${includePath}`,
      '-s', // statistics (story size, memory use)
      // FS.writeFile encodes the source as UTF-8; without -Cu Inform reads
      // ISO-8859-1 and non-ASCII prose silently mojibakes in-game.
      '-Cu',
      ...(opts.debug ? ['-k'] : []), // write gameinfo.dbg
      VERSION_SWITCH[version],
      'story.inf',
      outName,
    ])
  } catch (e) {
    // Emscripten throws ExitStatus for ordinary non-zero exits — the parsed
    // diagnostics carry that detail. Anything else is a real crash (e.g. a
    // WASM RuntimeError trap) and must not vanish.
    const name = (e as { name?: string } | null)?.name
    if (name !== 'ExitStatus') crash = String(e)
  }

  const rawOutput = out.join('\n')
  const { diagnostics, errorCount } = parseDiagnostics(rawOutput)
  if (crash) diagnostics.push({ severity: 'fatal', message: `Compiler crashed: ${crash}` })

  let story: Uint8Array | undefined
  try {
    story = m.FS.readFile(`/work/${outName}`)
  } catch {
    // no output produced
  }

  let dbg: string | undefined
  if (opts.debug) {
    try {
      dbg = new TextDecoder().decode(m.FS.readFile('/work/gameinfo.dbg'))
    } catch {
      // not written (compile failed before the debug file was produced)
    }
  }

  return {
    ok: errorCount === 0 && !crash && !!story,
    ...(story ? { story } : {}),
    ...(dbg !== undefined ? { dbg } : {}),
    version,
    diagnostics,
    rawOutput,
    stats: parseStats(rawOutput),
    ms: Math.round(performance.now() - started),
  }
}
