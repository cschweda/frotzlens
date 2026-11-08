/**
 * frotztrace, the command line (docs/18 §4): play a story from a command script under the debugger,
 * print each turn, optionally the call trace, and stop at a breakpoint with the stack.
 *
 * Exit codes, for CI: 0 the script ran to the end; 1 the story faulted, or the command line was
 * wrong; 2 a breakpoint was hit; 3 the story quit before the script ended.
 */
import { parseStory, readSymbols, type StoryFile, type Symbols } from '@frotzinc/zcode'
import { txdRoutineName } from '@frotzinc/zcode/format'
import { Debugger, normalizeTurn, type DebugStop, type InputValue, type StackFrame, type TraceEvent } from '@frotzinc/zmachine'

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  readFile: (path: string) => Uint8Array
  version: string
}

export const EXIT = { done: 0, error: 1, breakpoint: 2, quit: 3 } as const

export const USAGE = `Usage: frotztrace [options] story-file

Plays a Z-machine story (versions 3, 4, 5 and 8) under the debugger.

  --script <file>    commands to type, one per line ('!' lines are comments;
                     [timeout] ends a timed read, [key x] presses a key)
  --seed <n>         the random seed (default 1: the same run every time)
  --symbols <file>   names from Inform's debug file (gameinfo.dbg)
  --trace calls      print every call and return, indented by depth
  --trace all        and every memory write, branch and input too
  --break <routine>  stop when this routine is called, and print the stack:
                     a name from --symbols, a txd name (R0012), or an
                     address (0x27f8). Give it more than once for several.
  -h, --help         this
  -v, --version      the version

Exit codes: 0 the script ran to the end; 1 a fault or a usage error;
2 a breakpoint was hit; 3 the story quit before the script ended.
`

const hex = (n: number, w = 4) => n.toString(16).padStart(w, '0')

/** The script's commands, as zmachine-run reads them. */
export function readCommands(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('!'))
    .flatMap(l => (/^\[(timeout|key\b.*)\]$/.test(l) ? [l] : l.split('.')))
    .map(c => c.trim().replace(/^>\s*/, ''))
    .filter(Boolean)
}

export function main(argv: string[], io: Io): number {
  const args = [...argv]
  let script: string | undefined
  let seed = 1
  let symbolsFile: string | undefined
  let trace: 'calls' | 'all' | undefined
  const breaks: string[] = []
  const files: string[] = []
  const usage = (why: string) => {
    io.stderr(`frotztrace: ${why}\n\n${USAGE}`)
    return EXIT.error
  }
  while (args.length) {
    const arg = args.shift()!
    const value = () => {
      const v = args.shift()
      if (v === undefined) throw new Error(`${arg} needs a value`)
      return v
    }
    try {
      if (arg === '-h' || arg === '--help') {
        io.stdout(USAGE)
        return EXIT.done
      } else if (arg === '-v' || arg === '--version') {
        io.stdout(`frotztrace ${io.version}\n`)
        return EXIT.done
      } else if (arg === '--script') script = value()
      else if (arg === '--seed') {
        seed = Number(value())
        if (!Number.isInteger(seed)) return usage('--seed takes a whole number')
      } else if (arg === '--symbols') symbolsFile = value()
      else if (arg === '--trace') {
        const t = value()
        if (t !== 'calls' && t !== 'all') return usage(`--trace takes calls or all, not '${t}'`)
        trace = t
      } else if (arg === '--break') breaks.push(value())
      else if (arg.startsWith('-')) return usage(`unknown option ${arg}`)
      else files.push(arg)
    } catch (e) {
      return usage((e as Error).message)
    }
  }
  if (files.length !== 1) return usage(files.length ? 'one story file at a time' : 'which story file?')

  let bytes: Uint8Array
  let commands: string[] = []
  let symbols: Symbols | undefined
  try {
    bytes = io.readFile(files[0]!)
    if (script) commands = readCommands(new TextDecoder().decode(io.readFile(script)))
    if (symbolsFile) symbols = readSymbols(new TextDecoder().decode(io.readFile(symbolsFile)))
  } catch (e) {
    io.stderr(`frotztrace: ${(e as Error).message}\n`)
    return EXIT.error
  }

  let story: StoryFile
  try {
    story = parseStory(bytes)
  } catch (e) {
    io.stderr(`frotztrace: ${files[0]} isn't a story file frotztrace can read: ${(e as Error).message}\n`)
    return EXIT.error
  }
  const name = (address: number) => symbols?.routines[address]?.name ?? txdRoutineName(story, address)

  // Each --break, as a routine's address.
  const targets: number[] = []
  for (const b of breaks) {
    const address = resolveRoutine(b, story, symbols, name)
    if (address === undefined) {
      io.stderr(`frotztrace: there's no routine '${b}' in ${files[0]}${symbols ? '' : ' (names from the source need --symbols)'}\n`)
      return EXIT.error
    }
    targets.push(address)
  }

  const kinds = trace === 'all' ? (['call', 'return', 'write', 'branch', 'input'] as const) : trace === 'calls' ? (['call', 'return'] as const) : ([] as const)
  const made = Debugger.create(bytes, { seed, trace: { capacity: 1_000_000, kinds: [...kinds] } })
  if (!(made instanceof Debugger)) {
    io.stderr(`frotztrace: ${made.fault.message}\n`)
    return EXIT.error
  }
  const d = made
  for (const t of targets) d.addBreakpoint({ kind: 'routine', routine: t })

  /** The trace since the last call, as lines, then cleared. */
  const flushTrace = () => {
    if (!trace) return
    for (const e of d.trace.events()) io.stdout(`${traceLine(e, name)}\n`)
    d.trace.clear()
  }
  const flushText = () => {
    const t = normalizeTurn(d.machine.flushText())
    if (t) io.stdout(`${t}\n`)
  }

  let saved: Uint8Array | null = null
  let next = 0
  const TURN_LIMIT = 50_000_000
  for (;;) {
    const stop: DebugStop = d.run(TURN_LIMIT)
    flushTrace()
    switch (stop.kind) {
      case 'breakpoint': {
        flushText()
        const s = d.machine.state
        io.stdout(`\n[breakpoint] ${name(stop.breakpoint.kind === 'routine' ? stop.breakpoint.routine : stop.breakpoint.address)} · turn ${s.counters.turns} · instruction ${s.counters.instructions} · pc ${hex(s.pc)}\n`)
        io.stdout(formatStack(d.stack(), name, symbols))
        return EXIT.breakpoint
      }
      case 'save':
        saved = stop.data
        d.resume({ saved: true })
        continue
      case 'restore':
        d.resume({ restore: saved })
        continue
      case 'fault':
        flushText()
        io.stderr(`frotztrace: the story faulted at ${hex(stop.fault.pc)}: ${stop.fault.message}\n`)
        return EXIT.error
      case 'budget':
        flushText()
        io.stderr(`frotztrace: ${TURN_LIMIT.toLocaleString('en-US')} instructions without asking for input: the story seems to be looping.\n`)
        return EXIT.error
      case 'quit':
        flushText()
        return next < commands.length ? EXIT.quit : EXIT.done
      case 'input-line':
      case 'input-char': {
        flushText()
        if (next >= commands.length) return EXIT.done
        const command = commands[next++]!
        const input = inputFor(command, stop)
        if (!input) return EXIT.done // a key wanted and the script doesn't press one: play stops, as zmachine-run's does
        io.stdout(`\n> ${command}\n`)
        const fault = d.resume(input)
        if (fault) {
          io.stderr(`frotztrace: ${fault.message}\n`)
          return EXIT.error
        }
        continue
      }
      default:
        continue
    }
  }
}

/** What a script line gives the story, for the stop it's waiting at. */
function inputFor(command: string, stop: DebugStop): InputValue | undefined {
  if (command === '[timeout]') return { timeout: true }
  const key = /^\[key(?: (.*))?\]$/.exec(command)
  if (stop.kind === 'input-char') {
    if (!key) return undefined
    const k = key[1] ?? ''
    return { char: k === '' ? 13 : k.codePointAt(0)! }
  }
  return { line: command }
}

/** A routine by name (from the debug file, or txd's R0012), or by address (0x27f8). */
function resolveRoutine(text: string, story: StoryFile, symbols: Symbols | undefined, name: (a: number) => string): number | undefined {
  if (/^0x[0-9a-f]+$/i.test(text)) {
    const a = parseInt(text.slice(2), 16)
    return story.code.routines.some(r => r.address === a) ? a : undefined
  }
  const want = text.toLowerCase()
  for (const r of Object.values(symbols?.routines ?? {})) if (r.name.toLowerCase() === want) return r.address
  return story.code.routines.find(r => name(r.address).toLowerCase() === want || txdRoutineName(story, r.address).toLowerCase() === want)?.address
}

function traceLine(e: TraceEvent, name: (a: number) => string): string {
  const pad = (depth: number) => '  '.repeat(Math.max(0, depth))
  switch (e.kind) {
    case 'call':
      return `${pad(e.depth)}→ ${name(e.routine)}(${e.args.join(', ')})`
    case 'return':
      return `${pad(e.depth)}← ${e.routine !== undefined ? `${name(e.routine)} ` : ''}${e.value}`
    case 'write':
      return `    write ${hex(e.address)} = ${e.value}${e.size === 1 ? ' (byte)' : ''}`
    case 'branch':
      return `    branch at ${hex(e.address)} ${e.taken ? 'taken' : 'not taken'}`
    case 'input':
      return `    input ${JSON.stringify(e.value)}`
    case 'print':
      return `    print ${JSON.stringify(e.text)}`
  }
}

/** The stack, innermost first, with names and locals. */
export function formatStack(stack: StackFrame[], name: (a: number) => string, symbols?: Symbols): string {
  const lines = ['Stack (innermost first):']
  ;[...stack].reverse().forEach((f, i) => {
    const who = f.routine !== undefined ? `${name(f.routine)} (${hex(f.routine)})` : '(main)'
    const localNames = f.routine !== undefined ? symbols?.routines[f.routine]?.locals ?? [] : []
    const locals = f.locals.map((v, j) => `${localNames[j] ?? `L${String(j).padStart(2, '0')}`}=${v}`).join(' ')
    lines.push(`  #${i}  ${who}  at ${hex(f.pc)}${locals ? `  ${locals}` : ''}`)
  })
  return `${lines.join('\n')}\n`
}
