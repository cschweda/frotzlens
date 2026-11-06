import { parseStory, type StoryFile } from '@frotzinc/zcode'
import {
  formatAbbreviations,
  formatDictionary,
  formatHeader,
  formatObjects,
  formatTree,
  type FormatOptions,
} from '@frotzinc/zcode/format'

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  readFile: (path: string) => Uint8Array
  version: string
}

type Section = 'header' | 'abbreviations' | 'objects' | 'tree' | 'dict'

/** In infodump's order, which is also the order --all prints them in. */
const SECTIONS: { name: Section; short: string; long: string; format: (s: StoryFile, o: FormatOptions) => string; help: string }[] = [
  { name: 'header', short: 'i', long: 'header', format: formatHeader, help: 'the story file header (the default)' },
  { name: 'abbreviations', short: 'a', long: 'abbreviations', format: formatAbbreviations, help: 'the abbreviations' },
  { name: 'objects', short: 'o', long: 'objects', format: formatObjects, help: 'the objects' },
  { name: 'tree', short: 't', long: 'tree', format: formatTree, help: 'the object tree' },
  { name: 'dict', short: 'd', long: 'dict', format: formatDictionary, help: 'the dictionary' },
]

export const USAGE = `Usage: frotzlens [options] story-file [story-file...]

Shows what's inside a Z-machine story file (versions 3, 4, 5 and 8), in the
format of Ztools' infodump, so scripts written for infodump keep working.

${SECTIONS.map(s => `  -${s.short}, --${s.long.padEnd(15)} ${s.help}`).join('\n')}
  -f, --all             all of the above (infodump's -f also prints the memory
                        map and grammar; those arrive in a later release)
  -w, --width <n>       wrap lines at n columns (default 79; 0 = never)
      --json            the parsed model as JSON instead
  -h, --help            print this
  -v, --version         print the version

Everything runs locally; nothing is uploaded. https://frotzlens.com
`

/** JSON for the model: bytes as hex, the story's own bytes left out. */
function toJson(story: StoryFile): string {
  const { bytes: _bytes, ...rest } = story
  return `${JSON.stringify(
    rest,
    (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v),
    2,
  )}\n`
}

/** Runs the CLI; returns the exit code (0 ok, 1 a file couldn't be read or parsed, 2 usage). */
export function main(argv: string[], io: Io): number {
  const wanted = new Set<Section>()
  const files: string[] = []
  let width = 79
  let json = false

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
      } else if (arg === '-f' || arg === '--all') {
        for (const s of SECTIONS) wanted.add(s.name)
      } else if (arg === '-w' || arg === '--width') {
        width = Number(value())
        if (!Number.isInteger(width) || width < 0) throw new UsageError(`--width must be a whole number, 0 or more`)
      } else if (arg.startsWith('--')) {
        const s = SECTIONS.find(x => `--${x.long}` === arg)
        if (!s) throw new UsageError(`unknown option ${arg}`)
        wanted.add(s.name)
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Bundled short options, as infodump takes them: -oti.
        for (const ch of arg.slice(1)) {
          const s = SECTIONS.find(x => x.short === ch)
          if (ch === 'f') for (const x of SECTIONS) wanted.add(x.name)
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
  if (!wanted.size) wanted.add('header')

  let status = 0
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
      io.stdout(toJson(story))
      continue
    }
    let continuation = false
    for (const s of SECTIONS) {
      if (!wanted.has(s.name)) continue
      io.stdout(s.format(story, { fileName: file, width, continuation }))
      continuation = true
    }
  }
  return status
}

class UsageError extends Error {}
