/**
 * frotztrace, the command line (docs/18 §4, docs/20 §4): play a story from a command script under
 * the debugger, print each turn, the call trace and watches, and stop at a breakpoint with the
 * stack, named. Also: save after a turn, and read a save.
 *
 * Exit codes, for CI: 0 the script ran to the end (or a save was read); 1 the story faulted, or
 * the command line was wrong; 2 a breakpoint was hit; 3 the story quit before the script ended.
 */
import { findReference, inferSymbols, parseStory, readSymbols, type StoryFile, type Symbols } from '@frotzinc/zcode'
import { txdRoutineName } from '@frotzinc/zcode/format'
import { Debugger, normalizeTurn, readQuetzal, type BreakpointSpec, type DebugStop, type InputValue, type StackFrame, type TraceEvent } from '@frotzinc/zmachine'

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  readFile: (path: string) => Uint8Array
  writeFile?: (path: string, data: Uint8Array) => void
  version: string
  /** Names without a debug file: compile the library alone and compare (the CLI's default uses inform6-wasm). */
  infer?: (story: StoryFile) => Promise<Symbols | undefined>
}

export const EXIT = { done: 0, error: 1, breakpoint: 2, quit: 3 } as const

export const USAGE = `Usage: frotztrace [options] story-file

Plays a Z-machine story (versions 3, 4, 5 and 8) under the debugger.

  --script <file>          commands to type, one per line ('!' lines are
                           comments; [timeout] ends a timed read, [key x]
                           presses a key)
  --seed <n>               the random seed (default 1: the same run each time)
  --symbols <file>         names and source lines from Inform's debug file
                           (gameinfo.dbg). Without it, names are worked out
                           from the story when needed (it takes a few seconds)
  --trace calls            print every call and return, indented by depth
  --trace all              and every memory write, branch and input too
  --break <what>           stop there, and print the stack. Give it more than
                           once for several:
      Routine | R0012 | 0x27f8   when a routine is called
      action:Take                when the library begins that action
      line:story.inf:42          before that source line (needs --symbols)
      text:"You can't"           when that text is printed
  --if <condition>         only when this holds, for the --break before it:
                           'noun == lantern', 'score > 10 && lantern has light'
  --watch <expressions>    print each change, turn by turn (comma-separated)
  --save-at <turn> <file>  after that turn, type SAVE and write the story's
                           own save file there (the transcript gains that turn)
  --quetzal <file>         read a save instead of playing: where it is, its
                           stack and globals, by name
  -h, --help               this
  -v, --version            the version

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

interface BreakArg {
  text: string
  condition?: string
}

/** inform6-wasm compiles the library alone, and zcode matches it against the story by shape. */
async function inferWithInform6(story: StoryFile): Promise<Symbols | undefined> {
  if (story.fingerprint?.compiler !== 'inform6') return undefined
  const { compile } = await import('@frotzinc/inform6-wasm')
  const reference = await findReference(story, async (source, lib, v) => {
    const out = await compile(source, { version: v, library: lib, debug: true })
    return out.ok && out.story && out.dbg ? { story: parseStory(out.story), symbols: readSymbols(out.dbg) } : undefined
  })
  return reference ? inferSymbols(story, reference) : undefined
}

export async function main(argv: string[], io: Io): Promise<number> {
  const args = [...argv]
  let script: string | undefined
  let seed = 1
  let symbolsFile: string | undefined
  let trace: 'calls' | 'all' | undefined
  let saveAt: { turn: number; file: string } | undefined
  let quetzal: string | undefined
  const breaks: BreakArg[] = []
  const watches: string[] = []
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
      } else if (arg === '--break') breaks.push({ text: value() })
      else if (arg === '--if') {
        const c = value()
        const last = breaks.at(-1)
        if (!last) return usage('--if goes after the --break it applies to')
        last.condition = c
      } else if (arg === '--watch') watches.push(...value().split(',').map(w => w.trim()).filter(Boolean))
      else if (arg === '--save-at') {
        const turn = Number(value())
        if (!Number.isInteger(turn) || turn < 0) return usage('--save-at takes a turn number and a file')
        saveAt = { turn, file: value() }
      } else if (arg === '--quetzal') quetzal = value()
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

  // Names, worked out from the story when something needs them and no debug file was given.
  const needsNames = watches.length > 0 || quetzal !== undefined || breaks.some(b => b.condition || /^action:/i.test(b.text) || !/^(0x[0-9a-f]+|R\d{4}|line:|text:)/i.test(b.text))
  if (!symbols && needsNames) {
    io.stderr(`frotztrace: no --symbols, so working out names from the story (compiling its library to compare)…\n`)
    symbols = await (io.infer ?? inferWithInform6)(story)
    if (!symbols) io.stderr(`frotztrace: couldn't work out names for ${files[0]}; only addresses and txd's names (R0012) will do\n`)
  }
  const name = (address: number) => symbols?.routines[address]?.name ?? txdRoutineName(story, address)

  const made = Debugger.create(bytes, symbols ? { seed, symbols, trace: { capacity: 1_000_000, kinds: traceKinds(trace) } } : { seed, trace: { capacity: 1_000_000, kinds: traceKinds(trace) } })
  if (!(made instanceof Debugger)) {
    io.stderr(`frotztrace: ${made.fault.message}\n`)
    return EXIT.error
  }
  const d = made

  if (quetzal !== undefined) return readSave(quetzal, d, story, symbols, name, io)

  // Each --break.
  for (const b of breaks) {
    const spec = resolveBreak(b.text, story, symbols, name)
    if (typeof spec === 'string') {
      io.stderr(`frotztrace: ${spec}\n`)
      return EXIT.error
    }
    const bp = d.addBreakpoint(b.condition ? { ...spec, condition: b.condition } : spec)
    if (bp.error) {
      io.stderr(`frotztrace: --break ${b.text}${b.condition ? ` --if ${b.condition}` : ''}: ${bp.error}\n`)
      return EXIT.error
    }
  }
  for (const w of watches) {
    const watch = d.addWatch(w)
    if (watch.error && !('value' in watch)) {
      io.stderr(`frotztrace: --watch ${w}: ${watch.error}\n`)
      return EXIT.error
    }
  }

  const flushTrace = () => {
    if (!trace) return
    for (const e of d.trace.events()) io.stdout(`${traceLine(e, name)}\n`)
    d.trace.clear()
  }
  const flushText = () => {
    const t = normalizeTurn(d.machine.flushText())
    if (t) io.stdout(`${t}\n`)
  }
  const previous = new Map<number, number | undefined>(d.watches().map(w => [w.id, w.value]))
  const showWatches = () => {
    for (const w of d.watches()) {
      const before = previous.get(w.id)
      if (w.value !== before) io.stdout(`  [watch] ${w.expression}: ${before ?? '?'} → ${w.value ?? `(${w.error})`}\n`)
      previous.set(w.id, w.value)
    }
  }

  let saved: Uint8Array | null = null
  let savePending = false
  let next = 0
  const TURN_LIMIT = 50_000_000
  for (;;) {
    const stop: DebugStop = d.run(TURN_LIMIT)
    flushTrace()
    switch (stop.kind) {
      case 'breakpoint': {
        flushText()
        const s = d.machine.state
        const where = d.sourceLine()
        io.stdout(`\n[breakpoint] ${describeBreak(stop.breakpoint, name, symbols)} · turn ${s.counters.turns} · instruction ${s.counters.instructions} · pc ${hex(s.pc)}${where ? ` · ${where.file}:${where.line}` : ''}\n`)
        if (stop.detail) io.stdout(`  ${stop.detail}\n`)
        const inform = d.inform()
        if (inform) {
          const part = (label: string, n?: { value: number; name?: string }) => (n ? `${label}: ${n.name ?? n.value}` : '')
          io.stdout(`  ${[part('action', inform.action), part('noun', inform.noun), part('second', inform.second), part('actor', inform.actor)].filter(Boolean).join(' · ')}\n`)
        }
        io.stdout(formatStack(d.stack(), name, symbols, pc => d.sourceLine(pc)))
        for (const w of d.watches()) io.stdout(`  [watch] ${w.expression} = ${w.value ?? `(${w.error})`}\n`)
        return EXIT.breakpoint
      }
      case 'save':
        saved = stop.data
        if (savePending && saveAt) {
          if (!io.writeFile) {
            io.stderr('frotztrace: --save-at: this frotztrace can\'t write files\n')
            return EXIT.error
          }
          io.writeFile(saveAt.file, stop.data)
          io.stdout(`  [saved to ${saveAt.file}]\n`)
          savePending = false
        }
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
        showWatches()
        // --save-at: after that many turns, the story's own SAVE.
        if (saveAt && stop.kind === 'input-line' && d.machine.state.counters.turns === saveAt.turn && !savePending && saved === null) {
          savePending = true
          io.stdout('\n> save\n')
          d.resume({ line: 'save' })
          continue
        }
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

function traceKinds(trace: 'calls' | 'all' | undefined): ('call' | 'return' | 'write' | 'branch' | 'input')[] {
  return trace === 'all' ? ['call', 'return', 'write', 'branch', 'input'] : trace === 'calls' ? ['call', 'return'] : []
}

/** A --break, as a breakpoint, or why it can't be one. */
function resolveBreak(text: string, story: StoryFile, symbols: Symbols | undefined, name: (a: number) => string): BreakpointSpec | string {
  const action = /^action:(.+)$/i.exec(text)
  if (action) {
    const want = action[1]!.replace(/^##/, '').toLowerCase()
    const found = Object.entries(symbols?.actions ?? {}).find(([, n]) => n.toLowerCase() === want)
    if (!found) return symbols ? `there's no action called ${action[1]}` : `--break ${text} needs names (--symbols, or a story frotztrace can work them out for)`
    return { kind: 'action', action: Number(found[0]) }
  }
  const line = /^line:(.+):(\d+)$/i.exec(text)
  if (line) return symbols?.lines?.length ? { kind: 'line', file: line[1]!, line: Number(line[2]) } : `--break ${text} needs the debug file: --symbols gameinfo.dbg`
  const printed = /^text:(.+)$/i.exec(text)
  if (printed) return { kind: 'text', text: printed[1]!.replace(/^"(.*)"$/, '$1') }
  const routine = resolveRoutine(text, story, symbols, name)
  return routine !== undefined ? { kind: 'routine', routine } : `there's no routine '${text}' in this story${symbols ? '' : ' (names from the source need --symbols)'}`
}

function describeBreak(b: BreakpointSpec, name: (a: number) => string, symbols: Symbols | undefined): string {
  switch (b.kind) {
    case 'routine': return name(b.routine)
    case 'address': return hex(b.address)
    case 'action': return `action ${symbols?.actions[b.action] ?? b.action}`
    case 'line': return `line ${b.file}:${b.line}`
    case 'text': return `text "${b.text}"`
    case 'write': return `write ${hex(b.address)}`
    case 'property': return `property ${b.property} of object ${b.object}`
    case 'attribute': return `attribute ${b.attribute} of object ${b.object}`
  }
}

/** Read a save: where it stopped, its stack and its globals, by name. */
function readSave(file: string, d: Debugger, story: StoryFile, symbols: Symbols | undefined, name: (a: number) => string, io: Io): number {
  let q
  try {
    q = readQuetzal(io.readFile(file), story.bytes.slice(0, story.header.staticMemory))
  } catch (e) {
    io.stderr(`frotztrace: ${file}: ${(e as Error).message}\n`)
    return EXIT.error
  }
  const id = (s: { release: number; serial: Uint8Array; checksum: number }) => `${s.release}/${String.fromCharCode(...s.serial)}/${s.checksum}`
  if (id(q) !== id({ release: story.header.release, serial: new TextEncoder().encode(story.header.serial), checksum: story.header.checksum })) {
    io.stderr(`frotztrace: ${file} was saved from another story (or another release of it)\n`)
    return EXIT.error
  }
  // Put the save into the machine, to read it with the debugger's eyes.
  const s = d.machine.state
  s.memory.set(q.dynamic, 0)
  s.pc = q.pc
  s.frames = q.frames.map((f, i) => {
    // A save's frames don't say which routine they're in: the routine holding the frame's PC does.
    const pc = i + 1 < q.frames.length ? q.frames[i + 1]!.returnPC : q.pc
    const r = story.code.routines.find(x => pc >= x.address && pc < x.end)
    return r && i > 0 ? { ...f, routine: r.address } : f
  })
  const where = d.sourceLine()
  io.stdout(`${file}: release ${story.header.release}, serial ${story.header.serial}; saved at pc ${hex(q.pc)}${where ? ` (${where.file}:${where.line})` : ''}\n`)
  const inform = d.inform()
  if (inform) {
    const part = (label: string, n?: { value: number; name?: string }) => (n ? `${label}: ${n.name ?? n.value}` : '')
    io.stdout(`  ${[part('action', inform.action), part('noun', inform.noun), part('second', inform.second), part('actor', inform.actor)].filter(Boolean).join(' · ')}\n`)
  }
  io.stdout(formatStack(d.stack(), name, symbols, pc => d.sourceLine(pc)))
  io.stdout('Globals:\n')
  const named = Object.values(symbols?.globals ?? {})
  for (const g of named.length ? named : story.globals.map(x => `G${hex(x.number, 2)}`)) {
    const v = d.evaluate(g)
    if ('value' in v) io.stdout(`  ${g.padEnd(24)} ${v.value}\n`)
  }
  return EXIT.done
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

/** The stack, innermost first, with names, locals and (with sequence points) each frame's line. */
export function formatStack(stack: StackFrame[], name: (a: number) => string, symbols?: Symbols, lineOf?: (pc: number) => { file: string; line: number } | undefined): string {
  const lines = ['Stack (innermost first):']
  ;[...stack].reverse().forEach((f, i) => {
    const who = f.routine !== undefined ? `${name(f.routine)} (${hex(f.routine)})` : '(main)'
    const localNames = f.routine !== undefined ? symbols?.routines[f.routine]?.locals ?? [] : []
    const locals = f.locals.map((v, j) => `${localNames[j] || `L${String(j).padStart(2, '0')}`}=${v}`).join(' ')
    const where = lineOf?.(f.pc)
    lines.push(`  #${i}  ${who}  at ${hex(f.pc)}${where ? ` (${where.file}:${where.line})` : ''}${locals ? `  ${locals}` : ''}`)
  })
  return `${lines.join('\n')}\n`
}
