import { decompileChecked, findReference, inferSymbols, parseStory, readSymbols, roomGraph, symbolsMatch, type RoomGraph, type StoryFile, type Symbols } from '@frotzinc/zcode'
import {
  formatAbbreviations,
  formatDictionary,
  formatGrammar,
  formatHeader,
  formatMap,
  formatObjects,
  formatRoutine,
  formatTree,
  formatTxd,
  type FormatOptions,
} from '@frotzinc/zcode/format'

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  readFile: (path: string) => Uint8Array
  version: string
}

type Section = 'header' | 'map' | 'abbreviations' | 'objects' | 'tree' | 'grammar' | 'dict'

/** In infodump's order, which is also the order --all prints them in. */
const SECTIONS: { name: Section; short: string; long: string; format: (s: StoryFile, o: FormatOptions) => string; help: string }[] = [
  { name: 'header', short: 'i', long: 'header', format: formatHeader, help: 'the story file header' },
  { name: 'map', short: 'm', long: 'map', format: formatMap, help: 'the story file map' },
  { name: 'abbreviations', short: 'a', long: 'abbreviations', format: formatAbbreviations, help: 'the abbreviations' },
  { name: 'objects', short: 'o', long: 'objects', format: formatObjects, help: 'the objects' },
  { name: 'tree', short: 't', long: 'tree', format: formatTree, help: 'the object tree' },
  { name: 'grammar', short: 'g', long: 'grammar', format: formatGrammar, help: "Inform's verb grammar" },
  { name: 'dict', short: 'd', long: 'dict', format: formatDictionary, help: 'the dictionary' },
]

export const USAGE = `Usage: frotzlens [options] story-file [story-file...]

Shows what's inside a Z-machine story file (versions 3, 4, 5 and 8). With no
options, the whole disassembly, as Ztools' txd prints it; with infodump's
options, those sections, as infodump prints them. Scripts written for either
keep working.

Disassembly (txd):
      --txd             the disassembly (the default when no section is asked for)
  -n, --addresses       addresses instead of labels (txd -n)
      --routine <addr>  just the routine at this address (hex, e.g. 4f4 or 0x4f4)
      --no-grammar      leave out the grammar notes on routines (txd -g)
      --symbols <file>  names from Inform's debug file (gameinfo.dbg, written
                        with -k): routines, globals, locals, attributes and
                        properties by name. No longer txd's text.

Inform 6 source:
      --inform          the story decompiled to Inform 6 (an Inform story): one
                        .inf, the library as Includes, each routine checked by
                        compiling it again (with Inform 6.44, built in). Names
                        from --symbols if given, else made up from the story.

About the file:
      --info            what made it (compiler, library, Inform's veneer)
                        and, for a Blorb, what else is in it
      --rooms           the map: rooms and exits (needs --symbols)

Sections (infodump):
${SECTIONS.map(s => `  -${s.short}, --${s.long.padEnd(15)} ${s.help}`).join('\n')}
  -f, --all             all of the above

  -w, --width <n>       wrap lines at n columns (default 79; 0 = never)
      --json            the parsed model as JSON instead (an array, with
                        each one's "file", for several files)
  -h, --help            print this
  -v, --version         print the version

Everything runs locally; nothing is uploaded. https://frotzlens.frotzinc.com
`

/** The model for JSON: everything but the story's own bytes. */
function forJson(story: StoryFile): Omit<StoryFile, 'bytes'> {
  const { bytes: _bytes, ...rest } = story
  return rest
}

const DIRECTION_NAMES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', in: 'in', out: 'out',
}

/** --info: the fingerprint, and a Blorb's contents. */
function formatInfo(story: StoryFile, file: string): string {
  const fp = story.fingerprint
  const lines = [`Story file is ${file}`]
  // A Blorb with no Z-machine story has no fingerprint: only its contents are listed.
  if (fp) lines.push('')
  const v = fp?.compilerVersion
  const compiler = fp?.compiler === 'inform6' ? `Inform ${v ?? '6'}` : fp?.compiler === 'zilf' ? `ZILF${v ? ` ${v}` : ''}` : 'unknown'
  if (fp) lines.push(`Compiler:  ${compiler}`)
  if (fp) lines.push(`Library:   ${fp.library ? `${fp.library.name}${fp.library.version ? ` ${fp.library.version}` : ''}` : 'none recognised'}`)
  if (fp?.compiler === 'inform6') {
    const names = Object.entries(fp.veneer).sort(([a], [b]) => Number(a) - Number(b))
    lines.push(`Veneer:    ${names.length} routine${names.length === 1 ? '' : 's'} recognised`)
    for (const [at, name] of names) lines.push(`  ${Number(at).toString(16).padStart(5)}  ${name}`)
  }
  const b = story.blorb
  if (b) {
    lines.push('', 'Blorb:')
    if (b.title) lines.push(`  Title:   ${b.title}`)
    if (b.author) lines.push(`  Author:  ${b.author}`)
    if (b.frontispiece !== undefined) lines.push(`  Cover:   Pict ${b.frontispiece}`)
    for (const c of b.chunks) lines.push(`  ${c.offset.toString(16).padStart(6)}  ${c.type}  ${c.length} bytes`)
  }
  return `${lines.join('\n')}\n`
}

/** --rooms: each room, its exits, and where the game starts. */
function formatRooms(story: StoryFile, g: RoomGraph): string {
  const name = (n: number) => `${story.objects.objects[n - 1]?.shortName.text || 'object'} (${n})`
  const lines: string[] = [`${g.rooms.length} room${g.rooms.length === 1 ? '' : 's'}${g.start ? `; the game starts in ${name(g.start)}` : ''}`, '']
  for (const r of g.rooms) {
    lines.push(name(r.number))
    for (const e of g.exits.filter(x => x.from === r.number)) {
      const dir = DIRECTION_NAMES[e.dir]!.padEnd(10)
      const to =
        e.kind === 'room' ? name(e.to!)
        : e.kind === 'door' ? `through ${name(e.door!)}${e.to ? ` to ${name(e.to)}` : ''}`
        : e.kind === 'routine' ? `a routine at ${e.routine!.toString(16)}${e.candidates?.length ? ` (to ${e.candidates.map(name).join(' or ')})` : ''}`
        : 'a message (no way through)'
      lines.push(`    ${dir}${to}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * --inform: the story as Inform 6 (Phase 6), checked by compiling it again. The compiler,
 * @frotzinc/inform6-wasm, is loaded only for this.
 */
async function inform(file: string, story: StoryFile, symbols: Symbols | undefined, io: Io): Promise<number> {
  if (story.fingerprint?.compiler !== 'inform6') {
    io.stderr(`frotzlens: ${file}: --inform needs a story Inform compiled (this one ${story.fingerprint?.compiler === 'zilf' ? 'is ZILF\'s' : "isn't Inform's"})\n`)
    return 1
  }
  const { compile } = await import('@frotzinc/inform6-wasm')
  const library = story.fingerprint.library?.name === 'PunyInform' ? 'puny' : 'std'
  const version = (`z${story.header.version}`) as 'z3' | 'z4' | 'z5' | 'z8'
  let names = symbols
  if (!names) {
    const reference = await findReference(story, async (source, lib, v) => {
      const out = await compile(source, { version: v, library: lib, debug: true })
      return out.ok && out.story && out.dbg ? { story: parseStory(out.story), symbols: readSymbols(out.dbg) } : undefined
    })
    if (!reference) {
      io.stderr(`frotzlens: ${file}: couldn't compile its library alone to compare it with\n`)
      return 1
    }
    names = inferSymbols(story, reference)
  }
  const result = await decompileChecked(story, names, async source => {
    const out = await compile(source, { version, library })
    return out.ok && out.story ? { story: parseStory(out.story) } : { errorLines: out.diagnostics.filter(d => d.severity !== 'warning' && d.line).map(d => d.line!) }
  })
  io.stdout(result.source)
  for (const p of result.problems) io.stderr(`frotzlens: ${file}: ${p}\n`)
  const written = result.statementRoutines.length
  io.stderr(
    result.compiled
      ? `frotzlens: ${file}: ${result.statements.length} of ${written} routines as statements, ${result.idiomatic.length} with their control flow and Inform's syntax; ${result.differing.length ? `${result.differing.length} still differ` : 'every one compiles back the same'}\n`
      : `frotzlens: ${file}: the source didn't compile again, so its routines are Inform assembly\n`,
  )
  return result.compiled && !result.differing.length ? 0 : 1
}

/** Runs the CLI; returns the exit code (0 ok, 1 a file couldn't be read or parsed, 2 usage). --inform's is a promise. */
export function main(argv: string[], io: Io): number | Promise<number> {
  const wanted = new Set<Section>()
  const files: string[] = []
  let width = 79
  let json = false
  let txd = false
  let addresses = false
  let noGrammar = false
  let routine: number | undefined
  let symbolsFile: string | undefined
  let toInform = false
  let info = false
  let rooms = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new UsageError(`${arg} needs a value`)
      return v
    }
    try {
      if (arg === '-h' || arg === '--help') {
        io.stdout(USAGE)
        return 0
      } else if (arg === '-v' || arg === '--version') {
        io.stdout(`frotzlens ${io.version}\n`)
        return 0
      } else if (arg === '--json') {
        json = true
      } else if (arg === '--txd') {
        txd = true
      } else if (arg === '-n' || arg === '--addresses') {
        addresses = true
      } else if (arg === '--no-grammar') {
        noGrammar = true
      } else if (arg === '--symbols') {
        symbolsFile = value()
      } else if (arg === '--inform') {
        toInform = true
      } else if (arg === '--info') {
        info = true
      } else if (arg === '--rooms') {
        rooms = true
      } else if (arg === '--routine') {
        const raw = value().trim().replace(/^0x/i, '')
        if (!/^[0-9a-f]+$/i.test(raw)) throw new UsageError('--routine takes a hex address, e.g. 4f4')
        routine = parseInt(raw, 16)
      } else if (arg === '-f' || arg === '--all') {
        for (const s of SECTIONS) wanted.add(s.name)
      } else if (arg === '-w' || arg === '--width') {
        const raw = value()
        width = Number(raw)
        if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(width)) throw new UsageError(`--width must be a whole number, 0 or more`)
      } else if (arg.startsWith('--')) {
        const s = SECTIONS.find(x => `--${x.long}` === arg)
        if (!s) throw new UsageError(`unknown option ${arg}`)
        wanted.add(s.name)
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Bundled short options, as infodump takes them: -oti.
        for (const ch of arg.slice(1)) {
          const s = SECTIONS.find(x => x.short === ch)
          if (ch === 'f') for (const x of SECTIONS) wanted.add(x.name)
          else if (ch === 'n') addresses = true
          else if (s) wanted.add(s.name)
          else throw new UsageError(`unknown option -${ch}`)
        }
      } else {
        files.push(arg)
      }
    } catch (e) {
      if (!(e instanceof UsageError)) throw e
      io.stderr(`frotzlens: ${e.message}\n\n${USAGE}`)
      return 2
    }
  }
  if (!files.length) {
    io.stderr(USAGE)
    return 2
  }
  if (rooms && !symbolsFile) {
    io.stderr(`frotzlens: --rooms needs --symbols: the exits are found by their property names\n\n${USAGE}`)
    return 2
  }
  if (toInform && (files.length !== 1 || json || wanted.size || routine !== undefined || info || rooms || txd)) {
    io.stderr(`frotzlens: --inform takes one story file and no other option but --symbols\n\n${USAGE}`)
    return 2
  }
  // No section asked for: the disassembly.
  if (!wanted.size && routine === undefined && !info && !rooms && !toInform) txd = true

  let symbols: Symbols | undefined
  if (symbolsFile) {
    try {
      symbols = readSymbols(new TextDecoder().decode(io.readFile(symbolsFile)))
    } catch (e) {
      io.stderr(`frotzlens: can't read ${symbolsFile}: ${(e as Error).message}\n`)
      return 1
    }
    for (const p of symbols.problems) io.stderr(`frotzlens: ${symbolsFile}: ${p}\n`)
  }

  let status = 0
  const models: (Omit<StoryFile, 'bytes'> & { file: string; symbols?: Omit<Symbols, 'prefix'> & { prefix?: string }; rooms?: RoomGraph })[] = []
  for (const file of files) {
    let bytes: Uint8Array
    try {
      bytes = io.readFile(file)
    } catch (e) {
      io.stderr(`frotzlens: can't read ${file}: ${(e as Error).message}\n`)
      status = 1
      continue
    }
    const story = parseStory(bytes)
    for (const err of story.errors) io.stderr(`frotzlens: ${file}: ${err.severity}: ${err.message}\n`)
    if (story.errors.some(e => e.severity === 'error')) status = 1
    // The debug file's names only for its own story.
    const own = symbols && symbolsMatch(story.bytes, symbols) !== false ? symbols : undefined
    if (symbols && !own) io.stderr(`frotzlens: ${file}: ${symbolsFile} was written for another story; its names are left out\n`)
    if (toInform) {
      if (story.errors.some(e => e.severity === 'error')) return 1
      return inform(file, story, own, io)
    }
    const graph = own && rooms ? roomGraph(story, own) : undefined
    if (json) {
      // The debug file's story prefix as hex, not a typed array's 64 numbered keys.
      const symbolsJson = own && { ...own, prefix: own.prefix ? Array.from(own.prefix, b => b.toString(16).padStart(2, '0')).join('') : undefined }
      models.push({ file, ...forJson(story), ...(symbolsJson ? { symbols: symbolsJson } : {}), ...(graph ? { rooms: graph } : {}) })
      continue
    }
    // Nothing to show for a file that isn't a story (a Blorb with no story in it, a bad or missing
    // header); the errors above say why. A version 1, 2, 6 or 7 file still has a real header to show.
    // --info lists a Blorb's contents even when there's no story in it to read.
    if (info && story.blorb && story.errors.some(e => e.code === 'blorb-unsupported')) io.stdout(formatInfo(story, file))
    const notAStory = story.bytes.length < 64 || story.errors.some(e => e.code === 'bad-header' || e.code === 'blorb-unsupported')
    if (notAStory) continue
    // Versions 1, 2, 6 and 7 have only a header to show: nothing to fingerprint or map.
    const unsupported = story.errors.some(e => e.code === 'unsupported-version')
    if (info && !unsupported) io.stdout(formatInfo(story, file))
    if (rooms && !unsupported) {
      if (graph) io.stdout(formatRooms(story, graph))
      else if (own) io.stderr(`frotzlens: ${file}: no direction properties (n_to, s_to, …) to find exits by\n`)
    }
    let continuation = false
    for (const s of SECTIONS) {
      if (!wanted.has(s.name)) continue
      io.stdout(s.format(story, { fileName: file, width, continuation }))
      continuation = true
    }
    if (routine !== undefined) {
      const text = formatRoutine(story, routine, { addresses, width, noGrammar, ...(own ? { symbols: own } : {}) })
      if (text === undefined) {
        io.stderr(`frotzlens: ${file}: no routine starts at ${routine.toString(16)}\n`)
        status = 1
      } else io.stdout(text)
    }
    if (txd) {
      // A version this package doesn't disassemble (1, 2, 6, 7) has only its header to show.
      if (story.errors.some(e => e.code === 'unsupported-version')) {
        // Unless the header was asked for already (--txd -i).
        if (!wanted.has('header')) io.stdout(formatHeader(story, { fileName: file, width, continuation }))
      } else {
        io.stdout(formatTxd(story, { addresses, width, noGrammar, ...(own ? { symbols: own } : {}) }))
      }
    }
  }
  // One JSON document: the model for one file, an array of them (each with its `file`) for several.
  // The shape follows what was asked for: one file named → its model; several → an array, even
  // if some couldn't be read (those are reported on stderr and left out).
  if (json && (files.length > 1 || models.length)) {
    const out = files.length === 1 ? (({ file: _file, ...m }) => m)(models[0]!) : models
    io.stdout(`${JSON.stringify(out, null, 2)}\n`)
  }
  return status
}

class UsageError extends Error {}
