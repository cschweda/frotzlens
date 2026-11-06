import { parseStory, type StoryFile } from '@frotzinc/zcode'
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

Sections (infodump):
${SECTIONS.map(s => `  -${s.short}, --${s.long.padEnd(15)} ${s.help}`).join('\n')}
  -f, --all             all of the above

  -w, --width <n>       wrap lines at n columns (default 79; 0 = never)
      --json            the parsed model as JSON instead (an array, with
                        each one's "file", for several files)
  -h, --help            print this
  -v, --version         print the version

Everything runs locally; nothing is uploaded. https://frotzlens.com
`

/** The model for JSON: everything but the story's own bytes. */
function forJson(story: StoryFile): Omit<StoryFile, 'bytes'> {
  const { bytes: _bytes, ...rest } = story
  return rest
}

/** Runs the CLI; returns the exit code (0 ok, 1 a file couldn't be read or parsed, 2 usage). */
export function main(argv: string[], io: Io): number {
  const wanted = new Set<Section>()
  const files: string[] = []
  let width = 79
  let json = false
  let txd = false
  let addresses = false
  let noGrammar = false
  let routine: number | undefined

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
  // No section asked for: the disassembly.
  if (!wanted.size && routine === undefined) txd = true

  let status = 0
  const models: (Omit<StoryFile, 'bytes'> & { file: string })[] = []
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
    if (json) {
      models.push({ file, ...forJson(story) })
      continue
    }
    // Nothing to show for a file that isn't a story (a Blorb, a bad or missing header); the
    // errors above say why. A version 1, 2, 6 or 7 file still has a real header to show.
    const notAStory = story.container === 'blorb' || story.bytes.length < 64 || story.errors.some(e => e.code === 'bad-header')
    if (notAStory) continue
    let continuation = false
    for (const s of SECTIONS) {
      if (!wanted.has(s.name)) continue
      io.stdout(s.format(story, { fileName: file, width, continuation }))
      continuation = true
    }
    if (routine !== undefined) {
      const text = formatRoutine(story, routine, { addresses, width, noGrammar })
      if (text === undefined) {
        io.stderr(`frotzlens: ${file}: no routine starts at ${routine.toString(16)}\n`)
        status = 1
      } else io.stdout(text)
    }
    if (txd) io.stdout(formatTxd(story, { addresses, width, noGrammar }))
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
