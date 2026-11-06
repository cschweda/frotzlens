import type { Inform6Module as Inform6Instance } from '../wasm/inform6.mjs'

export type { Inform6Instance }

/** Story-file targets the compiler can emit (`ulx` is Glulx, via `-G`). */
export type StoryVersion = 'z3' | 'z4' | 'z5' | 'z8' | 'ulx'

/** The bundled library a source compiles against. */
export type LibraryId = 'std' | 'puny'

/** Severity of a compiler diagnostic. */
export type Severity = 'error' | 'warning' | 'fatal'

/** A single parsed compiler message. */
export interface Diagnostic {
  severity: Severity
  /** 1-based source line, when the message carries one. */
  line?: number
  column?: number
  message: string
  file?: string
}

/** Compiler statistics (from the `-s` switch), useful for gauging memory use. */
export interface CompileStats {
  /** Dynamic ("readable") memory used — the Z-machine's hard ~64 KB limit. */
  readableMem?: number
  readableMax?: number
  /** Total Z-machine memory used / free. */
  zUsed?: number
  zFree?: number
}

/** A file to mount in the compiler's virtual filesystem. */
export interface VirtualFile {
  path: string
  content: string
}

/** An extra `.h` mounted beside the library so `Include "name";` resolves. */
export interface Extension {
  name: string
  content: string
  /** Only with this may an extension named like a library file replace it. */
  overridesLibrary?: true
}

export interface CompileOptions {
  /** Default `z5`. */
  version?: StoryVersion
  /** Default `std`. */
  library?: LibraryId
  /** Pass `-k` and return `gameinfo.dbg`. */
  debug?: boolean
  extensions?: Extension[]
  /** Where the Emscripten glue should fetch a file (in practice `inform6.wasm`).
   *  Bundlers emit the `.wasm` under a hashed name; pass its URL here. Node
   *  needs nothing. */
  locateFile?: (path: string) => string
  /** Supply the compiler instance yourself (a bundler seam or a test double).
   *  Must return a FRESH instance per call. When given, `locateFile` is unused. */
  instantiate?: (hooks: { print: (line: string) => void; printErr: (line: string) => void }) => Promise<Inform6Instance>
}

export interface CompileOutput {
  /** True only when there were no errors and a story file was produced. */
  ok: boolean
  story?: Uint8Array
  /** The `gameinfo.dbg` XML, when `debug` was set and the compiler wrote it. */
  dbg?: string
  version: StoryVersion
  diagnostics: Diagnostic[]
  /** Everything the compiler printed, unparsed. */
  rawOutput: string
  stats: CompileStats
  /** Wall-clock compile time in milliseconds. */
  ms: number
}
