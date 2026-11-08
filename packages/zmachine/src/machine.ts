/**
 * The Z-machine (Standard 1.1, versions 3, 4, 5 and 8): "apply this decoded Instruction to this
 * state." zcode decodes; this executes, one instruction at a time, and stops for input, quit, a
 * spent budget, or a fault. No DOM, no eval, no timers: the host drives it (docs/11).
 *
 * Section references (§) are to the Z-Machine Standards Document 1.1.
 */
import { Bytes, Malformed, OutOfBounds, decodeInstruction, defaultExtra, readAlphabetTable, readUnicodeTable, type Instruction, type TextContext, type Version } from '@frotzinc/zcode'
import { MachineFault, fail, hex } from './fault.js'
import { Memory, signed, u16 } from './memory.js'
import { Objects } from './objects.js'
import { initialRandom, random } from './random.js'
import { Screen, initialScreen } from './screen.js'
import { encodeWord, inputToZscii, unicodeToZscii, zsciiAt, zsciiText } from './text.js'
import { readQuetzal, writeQuetzal } from './quetzal.js'
import type { Fault, Frame, Hooks, InputValue, MachineOptions, MachineSnapshot, MachineState, PendingInput, Snapshot, StopReason } from './types.js'

const MAX_FRAMES = 1024
const MAX_EVAL_STACK = 0xffff

const H = {
  version: 0x00,
  flags1: 0x01,
  initialPc: 0x06,
  dictionary: 0x08,
  objects: 0x0a,
  globals: 0x0c,
  staticBase: 0x0e,
  flags2: 0x10,
  abbreviations: 0x18,
  fileLength: 0x1a,
  checksum: 0x1c,
  interpreterNumber: 0x1e,
  interpreterVersion: 0x1f,
  screenHeight: 0x20,
  screenWidth: 0x21,
  screenWidthUnits: 0x22,
  screenHeightUnits: 0x24,
  fontWidth: 0x26,
  fontHeight: 0x27,
  terminators: 0x2e,
  standard: 0x32,
  alphabets: 0x34,
  extension: 0x36,
} as const

export class Machine {
  readonly state: MachineState
  readonly version: Version
  private readonly story: Uint8Array
  private readonly mem: Memory
  private readonly obj: Objects
  private readonly screen: Screen
  private readonly text: TextContext
  private readonly hooks: Hooks | undefined
  private readonly options: MachineOptions
  private readonly cache = new Map<number, Instruction>()
  private readonly globals: number
  private readonly dictionary: number
  /** Set by an instruction that ends run(): a read, quit. */
  private stop: StopReason | null = null
  /** The instruction being executed (for faults). */
  private current = 0

  private constructor(story: Uint8Array, options: MachineOptions) {
    // Our own copy of the original: restart and @verify read it, and a host may reuse its buffer.
    this.story = story.slice()
    this.options = options
    this.hooks = options.hooks
    this.version = story[0] as Version
    const memory = story.slice()
    const staticBase = (memory[H.staticBase]! << 8) | memory[H.staticBase + 1]!
    this.mem = new Memory(memory, staticBase, this.hooks)
    this.globals = this.mem.word(H.globals)
    this.dictionary = this.mem.word(H.dictionary)
    this.obj = new Objects(this.mem, this.version, this.mem.word(H.objects))
    this.text = this.textContext(memory)
    const size = options.header?.screen ?? { width: 80, height: 25 }
    this.state = {
      memory,
      pc: 0,
      frames: [],
      random: initialRandom(options.seed),
      screen: initialScreen(size.width, size.height),
      input: { pending: null },
      streams: { screen: true, transcript: false, commands: false, memory: [] },
      counters: { instructions: 0, turns: 0 },
      undo: [],
    }
    this.screen = new Screen(this.state.screen)
    this.restart(true)
  }

  /** A machine for `story`, or the reason it can't run one. Never throws. */
  static create(story: Uint8Array, options: MachineOptions): Machine | { fault: Fault } {
    const bad = (message: string) => ({ fault: { code: 'bad-story' as const, message, pc: 0 } })
    if (story.length < 64) return bad(`The file is ${story.length} bytes, too short to be a story (a header alone is 64).`)
    const v = story[0]!
    if (v === 6) return bad('This is a version 6 story (with graphics); frotzplay plays versions 3, 4, 5 and 8.')
    if (![3, 4, 5, 8].includes(v)) return bad(`This isn't a Z-machine story frotzplay can play: its version byte is ${v} (versions 3, 4, 5 and 8 are supported).`)
    const staticBase = (story[H.staticBase]! << 8) | story[H.staticBase + 1]!
    if (staticBase < 64 || staticBase > story.length) return bad(`The story's header is damaged: static memory starts at ${hex(staticBase)}, outside the file.`)
    try {
      return new Machine(story, options)
    } catch (e) {
      return bad(e instanceof Error ? `The story couldn't start: ${e.message}` : 'The story couldn’t start.')
    }
  }

  private textContext(memory: Uint8Array): TextContext {
    const bytes = new Bytes(memory)
    const ctx: TextContext = { bytes, version: this.version, abbreviations: [], alphabets: null, extra: defaultExtra() }
    const abbr = this.mem.word(H.abbreviations)
    if (abbr) for (let i = 0; i < 96; i++) ctx.abbreviations.push(this.mem.word(abbr + i * 2) * 2)
    if (this.version >= 5) {
      const alpha = this.mem.word(H.alphabets)
      if (alpha) ctx.alphabets = readAlphabetTable(bytes, alpha)
      const ext = this.mem.word(H.extension)
      if (ext && this.mem.word(ext) >= 3) {
        const unicode = this.mem.word(ext + 6)
        if (unicode) ctx.extra = readUnicodeTable(bytes, unicode)
      }
    }
    return ctx
  }

  // ── the header (§11) ──────────────────────────────────────────────────────

  /** What the interpreter writes into the header, at start, restart and restore. */
  private writeHeader(): void {
    const m = this.state.memory
    const h = this.options.header ?? {}
    const zvm = h.profile === 'zvm'
    const v = this.version
    const { width, height } = this.state.screen
    const set16 = (a: number, x: number) => {
      m[a] = (x >> 8) & 0xff
      m[a + 1] = x & 0xff
    }
    if (v === 3) {
      // Bit 4: status line not available (clear); bit 5: screen-splitting available; bit 6: the
      // default font is variable-pitch.
      m[H.flags1] = (m[H.flags1]! & 0x8f) | 0x20 | 0x40
      if (zvm) return
    } else {
      // Bit 0 colours, 2 bold, 3 italic, 4 fixed-pitch, 7 timed input (ZVM claims none).
      m[H.flags1] = (h.colour ? 0x01 : 0) | 0x1c | (zvm ? 0 : 0x80)
      // Flags 2 (§11.1.7): no pictures (3), mouse (5) or sound (7).
      m[H.flags2 + 1] = m[H.flags2 + 1]! & 0x57
    }
    if (v >= 4) {
      m[H.screenHeight] = Math.min(height, 254)
      m[H.screenWidth] = Math.min(width, 255)
    }
    if (v >= 5) {
      set16(H.screenWidthUnits, width)
      set16(H.screenHeightUnits, height)
      m[H.fontWidth] = 1
      m[H.fontHeight] = 1
    }
    if (!zvm) {
      m[H.interpreterNumber] = h.interpreterNumber ?? 6
      m[H.interpreterVersion] = h.interpreterVersion ?? 'F'.charCodeAt(0)
    }
    if (v >= 4 && !zvm) {
      // Default colours (§8.3.2): black (2) on white (9) is the Standard's suggestion; the player maps them.
      m[0x2c] = m[0x2c] || 2
      m[0x2d] = m[0x2d] || 9
    }
    // The Standard this follows (§11.1.5): 1.1, which is what this implements. (ZVM claims 1.2, with
    // its @gestalt; the 'zvm' profile still says 1.1, since a story may act on the claim, as Praxix
    // does. The header test leaves these two bytes out.)
    const [major, minor] = h.standard ?? [1, 1]
    set16(H.standard, (major << 8) | minor)
    // Flags 3 (§11.1.7.4): none of its features.
    const ext = (m[H.extension]! << 8) | m[H.extension + 1]!
    if (ext && ext + 9 < this.mem.staticBase && ((m[ext]! << 8) | m[ext + 1]!) >= 4) set16(ext + 8, 0)
  }

  // ── running ───────────────────────────────────────────────────────────────

  /** Run until input is needed, the game quits, `budget` instructions have run, or a fault. */
  run(budget: number): StopReason {
    if (this.state.input.pending) return this.waiting(this.state.input.pending)
    for (let n = 0; n < budget; n++) {
      const stop = this.step()
      if (stop) return stop
    }
    return { kind: 'budget' }
  }

  /** One instruction. Null when the machine can go on. */
  step(): StopReason | null {
    if (this.state.input.pending) return this.waiting(this.state.input.pending)
    this.current = this.state.pc
    try {
      const ins = this.decode(this.state.pc)
      this.state.pc = ins.address + ins.length
      this.state.counters.instructions++
      this.execute(ins)
    } catch (e) {
      return { kind: 'fault', fault: this.toFault(e) }
    }
    const stop = this.stop
    this.stop = null
    return stop
  }

  private toFault(e: unknown): Fault {
    if (e instanceof MachineFault) return e.toFault(this.current)
    if (e instanceof Malformed) return { code: 'illegal-opcode', message: `An instruction the story's version doesn't have, at ${hex(this.current)}: ${e.message}`, pc: this.current }
    if (e instanceof OutOfBounds) return { code: 'bad-address', message: `The story read outside itself at ${hex(this.current)}: ${e.message}`, pc: this.current }
    return { code: 'bad-story', message: `Something went wrong at ${hex(this.current)}: ${e instanceof Error ? e.message : String(e)}`, pc: this.current }
  }

  private decode(pc: number): Instruction {
    const cached = this.cache.get(pc)
    if (cached) return cached
    const ins = decodeInstruction(this.text.bytes, pc, this.version, this.text)
    // Code in static or high memory can't change, so its decoding can be kept (§1.1).
    if (pc >= this.mem.staticBase) this.cache.set(pc, ins)
    return ins
  }

  private waiting(p: PendingInput): StopReason {
    if (p.kind === 'save') return { kind: 'save', data: this.quetzal(p.at!) }
    if (p.kind === 'restore') return { kind: 'restore' }
    if (p.kind === 'char') return p.timeout ? { kind: 'input-char', timeout: p.timeout } : { kind: 'input-char' }
    const { max, preloaded } = this.lineLimits(p.textBuffer)
    return p.timeout ? { kind: 'input-line', maxLength: max, timeout: p.timeout, preloaded } : { kind: 'input-line', maxLength: max, preloaded }
  }

  /** The most a text buffer takes, and any text already in it (v5+, §15 read). */
  private lineLimits(buffer: number): { max: number; preloaded: string } {
    const size = this.mem.byte(buffer)
    if (this.version <= 4) return { max: Math.max(0, size - 1), preloaded: '' }
    const n = Math.min(this.mem.byte(buffer + 1), size)
    let preloaded = ''
    for (let i = 0; i < n; i++) preloaded += zsciiText(this.mem.byte(buffer + 2 + i), this.text)
    return { max: size, preloaded }
  }

  /** Give the machine what it's waiting for: a line, a key, or the news that a timed read's interval ran out. */
  resume(input: InputValue): Fault | null {
    const p = this.state.input.pending
    if (!p) return { code: 'not-waiting', message: 'The story isn’t waiting for input.', pc: this.state.pc }
    try {
      if (p.kind === 'save' || p.kind === 'restore') {
        if (!('saved' in input) && !('restore' in input)) return { code: 'not-waiting', message: `The story is waiting for a ${p.kind}, not typed input.`, pc: this.state.pc }
        this.state.input.pending = null
        if ('saved' in input) {
          this.completeSave(p.at!, input.saved ? 1 : 0)
          return null
        }
        if (!input.restore) {
          this.completeSave(p.at!, 0)
          return null
        }
        const why = this.restoreQuetzal(input.restore)
        if (why) {
          this.completeSave(p.at!, 0)
          return { code: 'bad-save', message: why, pc: this.state.pc }
        }
        return null
      }
      if (!('line' in input) && !('char' in input) && !('timeout' in input)) return { code: 'not-waiting', message: 'The story is waiting for typed input, not a save file.', pc: this.state.pc }
      if ('timeout' in input) {
        if (!p.timeout) return { code: 'not-waiting', message: 'This read has no time limit.', pc: this.state.pc }
        // Run the interrupt routine (§10.2.4): it returns true to end the read.
        this.state.input.pending = null
        this.callRoutine(p.timeout.routine, [], null, true)
        this.interrupted = p
        return null
      }
      this.state.input.pending = null
      if ('line' in input) this.finishLine(p, input.line, 13)
      else this.finishChar(p, input.char)
    } catch (e) {
      return this.toFault(e)
    }
    return null
  }

  /** The read an interrupt routine is running for. */
  private interrupted: PendingInput | null = null

  // ── variables (§6) ────────────────────────────────────────────────────────

  private get frame(): Frame {
    return this.state.frames[this.state.frames.length - 1]!
  }

  private push(v: number): void {
    const s = this.frame.evalStack
    if (s.length >= MAX_EVAL_STACK) fail('stack-overflow', 'the evaluation stack overflowed')
    s.push(v & 0xffff)
  }

  private pop(): number {
    const v = this.frame.evalStack.pop()
    if (v === undefined) fail('stack-underflow', 'the story took a value from an empty stack')
    return v!
  }

  private peek(): number {
    const s = this.frame.evalStack
    if (!s.length) fail('stack-underflow', 'the story read the top of an empty stack')
    return s[s.length - 1]!
  }

  private readVar(n: number): number {
    if (n === 0) return this.pop()
    if (n < 16) {
      const l = this.frame.locals
      if (n > l.length) fail('bad-variable', `local ${n} doesn't exist (the routine has ${l.length})`)
      return l[n - 1]!
    }
    return this.mem.word(this.globals + (n - 16) * 2)
  }

  private writeVar(n: number, v: number): void {
    if (n === 0) return this.push(v)
    if (n < 16) {
      const l = this.frame.locals
      if (n > l.length) fail('bad-variable', `local ${n} doesn't exist (the routine has ${l.length})`)
      l[n - 1] = v & 0xffff
      return
    }
    this.mem.setWord(this.globals + (n - 16) * 2, v)
  }

  /** Indirect variable references (§6.3.4): variable 0 is the top of the stack, read or written in place. */
  private readVarInPlace(n: number): number {
    return n === 0 ? this.peek() : this.readVar(n)
  }

  private writeVarInPlace(n: number, v: number): void {
    if (n === 0) {
      this.peek()
      const s = this.frame.evalStack
      s[s.length - 1] = v & 0xffff
    } else this.writeVar(n, v)
  }

  // ── routines (§5, §6.4) ───────────────────────────────────────────────────

  private unpackRoutine(p: number): number {
    return p * (this.version <= 3 ? 2 : this.version <= 5 ? 4 : 8)
  }

  private unpackString(p: number): number {
    return this.unpackRoutine(p)
  }

  private callRoutine(packed: number, args: number[], store: number | null, interrupt = false): void {
    if (packed === 0) {
      // Calling routine 0 does nothing and returns false (§6.4.3).
      if (store !== null) this.writeVar(store, 0)
      return
    }
    if (this.state.frames.length >= MAX_FRAMES) fail('stack-overflow', `routines nested more than ${MAX_FRAMES} deep`)
    const address = this.unpackRoutine(packed)
    const count = this.mem.byte(address)
    if (count > 15) fail('bad-address', `there's no routine at ${hex(address)} (it would have ${count} locals)`)
    const locals: number[] = []
    let pc = address + 1
    for (let i = 0; i < count; i++) {
      // v1–4: initial values follow the count; v5+: locals start at 0 (§5.2).
      if (this.version <= 4) {
        locals.push(this.mem.word(pc))
        pc += 2
      } else locals.push(0)
    }
    for (let i = 0; i < Math.min(args.length, count); i++) locals[i] = args[i]! & 0xffff
    const frame: Frame = { returnPC: this.state.pc, locals, evalStack: [], storeVariable: store, argCount: args.length, routine: address }
    if (interrupt) frame.interrupt = true
    this.state.frames.push(frame)
    this.state.pc = pc
    this.hooks?.call?.(address, args, frame)
  }

  private ret(v: number): void {
    const f = this.state.frames.pop()!
    if (!this.state.frames.length) fail('stack-underflow', 'the main routine returned')
    this.hooks?.return?.(v, f)
    this.state.pc = f.returnPC
    if (f.interrupt) return this.afterInterrupt(v)
    if (f.storeVariable !== null) this.writeVar(f.storeVariable, v)
  }

  private branch(ins: Instruction, condition: boolean): void {
    const b = ins.branch!
    const taken = condition === b.onTrue
    this.hooks?.branch?.(ins.address, taken)
    if (!taken) return
    if (b.returns !== undefined) this.ret(b.returns ? 1 : 0)
    else this.state.pc = b.target!
  }

  private store(ins: Instruction, v: number): void {
    if (ins.store !== undefined) this.writeVar(ins.store, v)
  }

  // ── output (§7) ───────────────────────────────────────────────────────────

  /** ZSCII codes to the active output streams. */
  private print(codes: number[]): void {
    const streams = this.state.streams
    const s3 = streams.memory.at(-1)
    if (s3) {
      // Stream 3 takes everything, and nothing else gets it (§7.1.2.2). ZSCII 0 prints nothing
      // anywhere (§3.8.2.1).
      for (const c of codes) {
        if (c === 0) continue
        this.mem.setByte(s3.table + 2 + s3.count, c === 10 ? 13 : c)
        s3.count++
      }
      return
    }
    if (!streams.screen) return
    let text = ''
    for (const c of codes) if (c !== 0) text += zsciiText(c, this.text)
    this.screen.print(text)
    this.hooks?.print?.(text, this.state.screen.window)
  }

  private printString(s: string): void {
    this.print([...s].map(ch => unicodeToZscii(ch, this.text)))
  }

  /** @print_unicode: the character itself on the screen; ZSCII (or '?') into stream 3. */
  private printUnicode(cp: number): void {
    const ch = cp >= 32 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '?'
    const streams = this.state.streams
    if (streams.memory.length || !streams.screen) return this.printString(ch)
    this.screen.print(ch)
    this.hooks?.print?.(ch, this.state.screen.window)
  }

  private printNum(v: number): void {
    this.printString(String(signed(v)))
  }

  private printObject(o: number): void {
    if (o === 0) return
    const { address, words } = this.obj.shortName(o)
    if (words) this.print(zsciiAt(this.text, address))
  }

  /** Lower-window text since the last call: what the Node runner prints for a turn. */
  flushText(): string {
    return this.screen.take()
  }

  // ── input (§10, §13) ──────────────────────────────────────────────────────

  /** v3: the status line, from globals 0–2 (§8.2.2). */
  private showStatus(): void {
    if (this.version !== 3) return
    const g = (i: number) => this.mem.word(this.globals + i * 2)
    let location = ''
    try {
      const o = g(0)
      if (o) location = zsciiAt(this.text, this.obj.shortName(o).address).map(c => zsciiText(c, this.text)).join('')
    } catch {
      location = ''
    }
    const time = (this.mem.byte(H.flags1) & 0x02) !== 0
    this.state.screen.statusLine = time ? { location, hours: g(1), minutes: g(2) } : { location, score: signed(g(1)), moves: g(2) }
  }

  private read(ins: Instruction, ops: number[]): void {
    const [textBuffer = 0, parseBuffer = 0, time = 0, routine = 0] = ops
    this.showStatus()
    const p: PendingInput = { kind: 'line', store: ins.store ?? null, textBuffer, parseBuffer }
    if (this.version >= 4 && time && routine) p.timeout = { tenths: time, routine }
    this.state.input.pending = p
    this.stop = this.waiting(p)
  }

  private finishLine(p: PendingInput, line: string, terminator: number): void {
    const { max } = this.lineLimits(p.textBuffer)
    const codes = inputToZscii(line, this.text).filter(c => c !== 13).slice(0, max)
    if (this.version <= 4) {
      codes.forEach((c, i) => this.mem.setByte(p.textBuffer + 1 + i, c))
      this.mem.setByte(p.textBuffer + 1 + codes.length, 0)
    } else {
      this.mem.setByte(p.textBuffer + 1, codes.length)
      codes.forEach((c, i) => this.mem.setByte(p.textBuffer + 2 + i, c))
    }
    this.hooks?.input?.('line', line)
    this.state.counters.turns++
    if (p.parseBuffer) this.tokenise(p.textBuffer, p.parseBuffer, this.dictionary, false)
    if (p.store !== null) this.writeVar(p.store, terminator)
  }

  private finishChar(p: PendingInput, code: number): void {
    this.hooks?.input?.('char', code)
    if (p.store !== null) this.writeVar(p.store, code)
  }

  /** An interrupt routine for a timed read returned `v` (§10.2.4). */
  private afterInterrupt(v: number): void {
    const p = this.interrupted
    this.interrupted = null
    if (!p) return
    if (v) {
      // The read ends: an empty line with terminator 0, or character 0.
      if (p.kind === 'line') this.finishLine(p, '', 0)
      else this.finishChar(p, 0)
    } else {
      this.state.input.pending = p
      this.stop = this.waiting(p)
    }
  }

  /** The words of a text buffer, looked up in a dictionary, into a parse buffer (§13.6). */
  private tokenise(textBuffer: number, parseBuffer: number, dictionary: number, keepUnknown: boolean): void {
    const start = this.version <= 4 ? 1 : 2
    const codes: number[] = []
    if (this.version <= 4) {
      for (let i = start; ; i++) {
        const c = this.mem.byte(textBuffer + i)
        if (c === 0) break
        codes.push(c)
      }
    } else {
      const n = this.mem.byte(textBuffer + 1)
      for (let i = 0; i < n; i++) codes.push(this.mem.byte(textBuffer + 2 + i))
    }
    const dict = this.dictionaryAt(dictionary)
    const words: { at: number; codes: number[] }[] = []
    let cur: { at: number; codes: number[] } | null = null
    codes.forEach((c, i) => {
      if (c === 32) cur = null
      else if (dict.separators.includes(c)) {
        cur = null
        words.push({ at: i, codes: [c] })
      } else {
        if (!cur) {
          cur = { at: i, codes: [] }
          words.push(cur)
        }
        cur.codes.push(c)
      }
    })
    const max = this.mem.byte(parseBuffer)
    const found = Math.min(words.length, max)
    this.mem.setByte(parseBuffer + 1, found)
    for (let w = 0; w < found; w++) {
      const word = words[w]!
      const entry = dict.lookup(encodeWord(word.codes, this.text))
      const block = parseBuffer + 2 + w * 4
      if (entry === 0 && keepUnknown) continue
      this.mem.setWord(block, entry)
      this.mem.setByte(block + 2, word.codes.length)
      this.mem.setByte(block + 3, word.at + start)
    }
  }

  private readonly dictionaries = new Map<number, ReturnType<Machine['readDictionary']>>()

  private dictionaryAt(address: number) {
    // A dictionary in static memory can't change, so it's read once; one in dynamic memory each time.
    if (address < this.mem.staticBase) return this.readDictionary(address)
    let d = this.dictionaries.get(address)
    if (!d) this.dictionaries.set(address, (d = this.readDictionary(address)))
    return d
  }

  private readDictionary(address: number) {
    const n = this.mem.byte(address)
    const separators: number[] = []
    for (let i = 0; i < n; i++) separators.push(this.mem.byte(address + 1 + i))
    const entryLength = this.mem.byte(address + 1 + n)
    const count = signed(this.mem.word(address + 2 + n))
    const first = address + 4 + n
    const keyLength = this.version <= 3 ? 4 : 6
    const index = new Map<string, number>()
    // A negative count means unsorted (§13.4); either way, a map finds the entry.
    for (let i = 0; i < Math.abs(count); i++) {
      const at = first + i * entryLength
      let key = ''
      for (let b = 0; b < keyLength; b++) key += String.fromCharCode(this.mem.byte(at + b))
      if (!index.has(key)) index.set(key, at)
    }
    return {
      separators,
      lookup: (encoded: Uint8Array) => index.get(String.fromCharCode(...encoded)) ?? 0,
    }
  }

  // ── save files (Quetzal 1.4) ──────────────────────────────────────────────

  private storyId() {
    const m = this.story
    return { release: (m[0x02]! << 8) | m[0x03]!, serial: m.subarray(0x12, 0x18), checksum: (m[0x1c]! << 8) | m[0x1d]! }
  }

  /** The machine as a Quetzal file, with `at` as the save instruction's store or branch byte. */
  private quetzal(at: number): Uint8Array {
    const id = this.storyId()
    return writeQuetzal(
      { release: id.release, serial: id.serial, checksum: id.checksum, pc: at, dynamic: this.state.memory.subarray(0, this.mem.staticBase), frames: this.state.frames },
      this.story.subarray(0, this.mem.staticBase),
    )
  }

  /**
   * Finish a save or restore whose result is `value` (§15 save/restore): v4+ store it at the store
   * byte `at`; v3 branch on it from the branch byte(s) at `at`.
   */
  private completeSave(at: number, value: number): void {
    if (this.version >= 4) {
      this.state.pc = at + 1
      return this.writeVar(this.mem.byte(at), value)
    }
    const b = this.mem.byte(at)
    let offset: number
    let after: number
    if (b & 0x40) {
      offset = b & 0x3f
      after = at + 1
    } else {
      offset = (((b & 0x3f) << 8) | this.mem.byte(at + 1)) << 18 >> 18
      after = at + 2
    }
    this.state.pc = after
    if ((value !== 0) !== ((b & 0x80) !== 0)) return
    if (offset === 0 || offset === 1) return this.ret(offset)
    this.state.pc = after + offset - 2
  }

  /** Restore a Quetzal file; the reason in words when it can't be. */
  private restoreQuetzal(bytes: Uint8Array): string | null {
    let q
    try {
      q = readQuetzal(bytes, this.story.subarray(0, this.mem.staticBase))
    } catch (e) {
      return `That save file can\u2019t be restored: ${e instanceof Error ? e.message : String(e)}.`
    }
    const id = this.storyId()
    if (q.release !== id.release || q.checksum !== id.checksum || q.serial.some((b, i) => b !== id.serial[i])) {
      return 'That save file is from a different story (or a different release of this one).'
    }
    // Flags 2 survives a restore (§11.1.7.2… ZVM keeps the whole low byte).
    const flags2 = this.state.memory[0x11]!
    this.state.memory.set(q.dynamic, 0)
    this.state.memory[0x11] = flags2
    this.state.frames = q.frames
    this.writeHeader()
    this.state.random.mode = 'session'
    this.state.random.xorshift = 0
    this.state.streams.memory = []
    this.dictionaries.clear()
    // v3: the upper window collapses on a restore (§8.6.1.3).
    if (this.version === 3) this.screen.split(0, 3)
    this.completeSave(q.pc, 2)
    return null
  }

  // ── snapshots (autosave, workers) ─────────────────────────────────────────

  /** The whole machine as plain data. */
  snapshot(): MachineSnapshot {
    const id = this.storyId()
    const s = this.state
    return structuredCopy({
      version: 1,
      story: { release: id.release, serial: String.fromCharCode(...id.serial), checksum: id.checksum },
      dynamic: s.memory.slice(0, this.mem.staticBase),
      pc: s.pc,
      frames: s.frames,
      random: s.random,
      screen: s.screen,
      input: s.input,
      streams: s.streams,
      counters: s.counters,
      undo: s.undo,
      interrupted: this.interrupted,
    })
  }

  /** A machine in exactly the state of `snapshot`, or why it can't be (another story's). */
  static fromSnapshot(story: Uint8Array, snapshot: MachineSnapshot, options: MachineOptions): Machine | { fault: Fault } {
    const m = Machine.create(story, options)
    if (!(m instanceof Machine)) return m
    const id = m.storyId()
    const sid = snapshot.story
    if (snapshot.version !== 1 || sid.release !== id.release || sid.checksum !== id.checksum || sid.serial !== String.fromCharCode(...id.serial)) {
      return { fault: { code: 'bad-save', message: 'That saved state is from a different story (or a different release of this one).', pc: 0 } }
    }
    const c = structuredCopy(snapshot)
    m.state.memory.set(c.dynamic, 0)
    m.state.pc = c.pc
    m.state.frames = c.frames
    m.state.random = c.random
    Object.assign(m.state.screen, c.screen)
    m.state.input = c.input
    m.state.streams = c.streams
    m.state.counters = c.counters
    m.state.undo = c.undo
    m.interrupted = c.interrupted
    return m
  }

  // ── undo (§15 save_undo / restore_undo) ───────────────────────────────────

  private saveUndo(store: number | null): void {
    const s: Snapshot = {
      dynamic: this.state.memory.slice(0, this.mem.staticBase),
      frames: cloneFrames(this.state.frames),
      pc: this.state.pc,
      random: { ...this.state.random },
      store,
    }
    this.state.undo.push(s)
    const depth = this.options.undoDepth ?? 10
    while (this.state.undo.length > depth) this.state.undo.shift()
  }

  private restoreUndo(): boolean {
    const s = this.state.undo.pop()
    if (!s) return false
    // The transcript and fixed-pitch bits of Flags 2 survive (§11.1.7.2… as on restore).
    const flags2 = this.state.memory[H.flags2 + 1]! & 0x03
    this.state.memory.set(s.dynamic, 0)
    this.state.memory[H.flags2 + 1] = (this.state.memory[H.flags2 + 1]! & ~0x03) | flags2
    this.state.frames = cloneFrames(s.frames)
    this.state.pc = s.pc
    this.state.random = { ...s.random }
    if (s.store !== null) this.writeVar(s.store, 2)
    return true
  }

  // ── restart (§6.1.3, §11.1) ───────────────────────────────────────────────

  private restart(first = false): void {
    const m = this.state.memory
    // Flags 2's transcript and fixed-pitch bits survive a restart (§6.1.3).
    const keep = first ? 0 : m[H.flags2 + 1]! & 0x03
    m.set(this.story.subarray(0, this.mem.staticBase), 0)
    m[H.flags2 + 1] = (m[H.flags2 + 1]! & ~0x03) | keep
    this.writeHeader()
    // ZVM resets its seed on restart (update_header): back to the session stream, which goes on.
    this.state.random.mode = 'session'
    this.state.random.xorshift = 0
    this.state.frames = [{ returnPC: 0, locals: [], evalStack: [], storeVariable: null, argCount: 0 }]
    this.state.pc = this.mem.word(H.initialPc)
    this.state.input.pending = null
    this.state.streams.memory = []
    this.screen.erase(-1)
    this.state.screen.style = 0
    this.dictionaries.clear()
  }

  // ── the checksum (@verify) ────────────────────────────────────────────────

  private verify(): boolean {
    const scale = this.version <= 3 ? 2 : this.version <= 5 ? 4 : 8
    const length = Math.min(this.mem.word(H.fileLength) * scale, this.story.length)
    let sum = 0
    for (let i = 0x40; i < length; i++) sum = (sum + this.story[i]!) & 0xffff
    return sum === this.mem.word(H.checksum)
  }

  // ── tables ────────────────────────────────────────────────────────────────

  private copyTable(first: number, second: number, size: number): void {
    const n = Math.abs(signed(size))
    if (second === 0) {
      for (let i = 0; i < n; i++) this.mem.setByte(first + i, 0)
      return
    }
    // Positive size: copy as if through a buffer, so overlapping tables come out right; negative:
    // forwards, byte by byte, whatever that does to an overlap (§15 copy_table).
    if (signed(size) > 0 && second > first && second < first + n) {
      for (let i = n - 1; i >= 0; i--) this.mem.setByte(second + i, this.mem.byte(first + i))
    } else for (let i = 0; i < n; i++) this.mem.setByte(second + i, this.mem.byte(first + i))
  }

  private scanTable(x: number, table: number, length: number, form: number): number {
    const words = (form & 0x80) !== 0
    const step = form & 0x7f
    if (step === 0) return 0
    for (let i = 0; i < length; i++) {
      const at = table + i * step
      if ((words ? this.mem.word(at) : this.mem.byte(at)) === x) return at
    }
    return 0
  }

  private printTable(address: number, width: number, height: number, skip: number): void {
    for (let row = 0; row < height; row++) {
      if (row > 0) this.print([13])
      const codes: number[] = []
      for (let c = 0; c < width; c++) codes.push(this.mem.byte(address + row * (width + skip) + c))
      this.print(codes)
    }
  }

  // ── one instruction (§14, §15) ────────────────────────────────────────────

  private execute(ins: Instruction): void {
    const ops = ins.operands.map(o => (o.kind === 'variable' ? this.readVar(o.value) : o.value))
    const [a = 0, b = 0, c = 0, d = 0] = ops
    const s = signed
    switch (ins.name) {
      // ── arithmetic and logic (§2) ──
      case 'ADD': return this.store(ins, s(a) + s(b))
      case 'SUB': return this.store(ins, s(a) - s(b))
      case 'MUL': return this.store(ins, Math.imul(s(a), s(b)))
      case 'DIV':
        if (s(b) === 0) fail('division-by-zero', 'division by zero')
        return this.store(ins, Math.trunc(s(a) / s(b)))
      case 'MOD':
        if (s(b) === 0) fail('division-by-zero', 'remainder of division by zero')
        return this.store(ins, s(a) % s(b))
      case 'OR': return this.store(ins, a | b)
      case 'AND': return this.store(ins, a & b)
      case 'NOT': return this.store(ins, ~a)
      case 'LOG_SHIFT': return this.store(ins, s(b) >= 0 ? a << s(b) : a >>> -s(b))
      case 'ART_SHIFT': return this.store(ins, s(b) >= 0 ? s(a) << s(b) : s(a) >> -s(b))

      // ── branches ──
      // @je with one operand never branches (§15: "@je a never jumps").
      case 'JE': return this.branch(ins, ops.slice(1).some(x => x === a))
      case 'JL': return this.branch(ins, s(a) < s(b))
      case 'JG': return this.branch(ins, s(a) > s(b))
      case 'JZ': return this.branch(ins, a === 0)
      case 'TEST': return this.branch(ins, (a & b) === b)
      case 'JUMP':
        this.state.pc = ins.jumpTarget!
        return
      case 'DEC_CHK': {
        // The variable is named by the operand, read and written in place (§6.3.4); compared signed.
        const v = u16(this.readVarInPlace(a) - 1)
        this.writeVarInPlace(a, v)
        return this.branch(ins, s(v) < s(b))
      }
      case 'INC_CHK': {
        const v = u16(this.readVarInPlace(a) + 1)
        this.writeVarInPlace(a, v)
        return this.branch(ins, s(v) > s(b))
      }

      // ── variables ──
      case 'STORE': return this.writeVarInPlace(a, b)
      case 'LOAD': return this.store(ins, this.readVarInPlace(a))
      case 'INC': return this.writeVarInPlace(a, this.readVarInPlace(a) + 1)
      case 'DEC': return this.writeVarInPlace(a, this.readVarInPlace(a) - 1)
      case 'PUSH': return this.push(a)
      case 'PULL': return this.writeVarInPlace(a, this.pop())
      case 'POP':
        this.pop()
        return

      // ── memory ──
      case 'LOADW': return this.store(ins, this.mem.word(u16(a + 2 * s(b))))
      case 'LOADB': return this.store(ins, this.mem.byte(u16(a + s(b))))
      case 'STOREW': return this.mem.setWord(u16(a + 2 * s(b)), c)
      case 'STOREB': return this.mem.setByte(u16(a + s(b)), c)
      case 'COPY_TABLE': return this.copyTable(a, b, c)
      case 'SCAN_TABLE': {
        const at = this.scanTable(a, b, c, ops.length > 3 ? d : 0x82)
        this.store(ins, at)
        return this.branch(ins, at !== 0)
      }

      // ── objects ──
      case 'GET_PARENT': return this.store(ins, this.obj.parent(a))
      case 'GET_SIBLING': {
        const o = this.obj.sibling(a)
        this.store(ins, o)
        return this.branch(ins, o !== 0)
      }
      case 'GET_CHILD': {
        const o = this.obj.child(a)
        this.store(ins, o)
        return this.branch(ins, o !== 0)
      }
      case 'JIN': return this.branch(ins, this.obj.parent(a) === b)
      case 'INSERT_OBJ': return this.obj.insert(a, b)
      case 'REMOVE_OBJ': return this.obj.remove(a)
      case 'TEST_ATTR': return this.branch(ins, this.obj.testAttr(a, b))
      case 'SET_ATTR': return this.obj.setAttr(a, b, true)
      case 'CLEAR_ATTR': return this.obj.setAttr(a, b, false)
      case 'GET_PROP': return this.store(ins, this.obj.get(a, b))
      case 'GET_PROP_ADDR': return this.store(ins, this.obj.find(a, b)?.data ?? 0)
      case 'GET_PROP_LEN': return this.store(ins, this.obj.propLen(a))
      case 'GET_NEXT_PROP': return this.store(ins, this.obj.next(a, b))
      case 'PUT_PROP': return this.obj.put(a, b, c)

      // ── calls and returns (§6.4) ──
      case 'CALL':
      case 'CALL_VS':
      case 'CALL_VS2':
      case 'CALL_1S':
      case 'CALL_2S':
        return this.callRoutine(a, ops.slice(1), ins.store ?? null)
      case 'CALL_VN':
      case 'CALL_VN2':
      case 'CALL_1N':
      case 'CALL_2N':
        return this.callRoutine(a, ops.slice(1), null)
      case 'RET': return this.ret(a)
      case 'RTRUE': return this.ret(1)
      case 'RFALSE': return this.ret(0)
      case 'RET_POPPED': return this.ret(this.pop())
      case 'CHECK_ARG_COUNT': return this.branch(ins, a <= this.frame.argCount)
      case 'CATCH': return this.store(ins, this.state.frames.length)
      case 'THROW': {
        // Unwind to the frame @catch named, and return from it (§6.4.4… §15 throw).
        if (b < 1 || b > this.state.frames.length) fail('stack-underflow', `@throw to frame ${b}, which isn't on the stack`)
        this.state.frames.length = b
        return this.ret(a)
      }

      // ── printing (§7) ──
      case 'PRINT': return this.print(zsciiAt(this.text, ins.text!.address))
      case 'PRINT_RET':
        this.print(zsciiAt(this.text, ins.text!.address))
        this.print([13])
        return this.ret(1)
      case 'NEW_LINE': return this.print([13])
      case 'PRINT_CHAR': return this.print([a])
      case 'PRINT_NUM': return this.printNum(a)
      case 'PRINT_ADDR': return this.print(zsciiAt(this.text, a))
      case 'PRINT_PADDR': return this.print(zsciiAt(this.text, this.unpackString(a)))
      case 'PRINT_OBJ': return this.printObject(a)
      case 'PRINT_TABLE': return this.printTable(a, b, ops.length > 2 ? c : 1, ops.length > 3 ? d : 0)
      case 'PRINT_UNICODE': return this.printUnicode(a)
      case 'CHECK_UNICODE':
        // Bit 0: can print it; bit 1: can read it from the keyboard (§15 check_unicode).
        return this.store(ins, a >= 32 && a <= 0xfffd && !(a >= 0x7f && a <= 0x9f) && !(a >= 0xd800 && a <= 0xdfff) ? 3 : 0)
      case 'OUTPUT_STREAM': return this.outputStream(s(a), b)
      case 'INPUT_STREAM': return

      // ── the screen (§8) ──
      case 'SHOW_STATUS': return this.showStatus()
      case 'SPLIT_WINDOW': return this.screen.split(a, this.version)
      case 'SET_WINDOW': return this.screen.setWindow(a)
      case 'ERASE_WINDOW': return this.screen.erase(s(a))
      case 'ERASE_LINE':
        if (a === 1) this.screen.eraseLine()
        return
      case 'SET_CURSOR': return this.screen.setCursor(s(a), s(b))
      case 'GET_CURSOR': {
        const [row, col] = this.screen.cursor()
        this.mem.setWord(a, row)
        this.mem.setWord(a + 2, col)
        return
      }
      case 'SET_TEXT_STYLE':
        // 0 is roman; otherwise styles combine (§8.7.1.1).
        this.state.screen.style = a === 0 ? 0 : this.state.screen.style | a
        return
      case 'BUFFER_MODE':
        this.state.screen.lower.bufferMode = a !== 0
        return
      case 'SET_COLOUR':
        if (a) this.state.screen.colours.fg = a
        if (b) this.state.screen.colours.bg = b
        return
      case 'SET_TRUE_COLOUR': return
      case 'SET_FONT': {
        // Fonts 1 (normal) and 4 (fixed-pitch); 0 asks which is current (§8.1.3).
        const prev = this.state.screen.font
        if (a === 0) return this.store(ins, prev)
        if (a === 1 || a === 4) {
          this.state.screen.font = a
          return this.store(ins, prev)
        }
        return this.store(ins, 0)
      }
      case 'SOUND_EFFECT':
        if (a === 1 || a === 2) this.state.screen.beeps.push(a)
        return
      case 'BUFFER_SCREEN': return this.store(ins, 0)

      // ── input (§10, §13) ──
      case 'READ': return this.read(ins, ops)
      case 'READ_CHAR': {
        const p: PendingInput = { kind: 'char', store: ins.store ?? null, textBuffer: 0, parseBuffer: 0 }
        if (b && c) p.timeout = { tenths: b, routine: c }
        this.state.input.pending = p
        this.stop = this.waiting(p)
        return
      }
      case 'TOKENISE': return this.tokenise(a, b, ops.length > 2 && c ? c : this.dictionary, ops.length > 3 && d !== 0)
      case 'ENCODE_TEXT': {
        const codes: number[] = []
        for (let i = 0; i < b; i++) codes.push(this.mem.byte(a + c + i))
        const bytes = encodeWord(codes, this.text)
        bytes.forEach((x, i) => this.mem.setByte(d + i, x))
        return
      }

      // ── the game ──
      case 'RANDOM': return this.store(ins, random(this.state.random, s(a)))
      case 'NOP': return
      case 'PIRACY': return this.branch(ins, true)
      case 'VERIFY': return this.branch(ins, this.verify())
      case 'QUIT':
        this.stop = { kind: 'quit' }
        this.state.pc = this.current
        return
      case 'RESTART': return this.restart()
      case 'SAVE':
      case 'RESTORE': {
        // v5+'s auxiliary-file forms (@save table bytes name) fail, as the Standard allows (§15).
        if (ins.operands.length) return this.store(ins, 0)
        // Quetzal's PC: the store byte (v4+), or the branch byte(s) (v3), which in this 0OP form
        // follow the opcode byte directly.
        const at = this.version <= 3 ? ins.address + 1 : ins.address + ins.length - 1
        const p: PendingInput = { kind: ins.name === 'SAVE' ? 'save' : 'restore', store: null, textBuffer: 0, parseBuffer: 0, at }
        this.state.input.pending = p
        this.stop = this.waiting(p)
        return
      }
      case 'SAVE_UNDO':
        this.saveUndo(ins.store ?? null)
        return this.store(ins, 1)
      case 'RESTORE_UNDO':
        if (!this.restoreUndo()) this.store(ins, 0)
        return
    }
    fail('illegal-opcode', `${ins.name} isn't implemented`)
  }

  private outputStream(n: number, table: number): void {
    const st = this.state.streams
    switch (n) {
      case 1: st.screen = true; return
      case -1: st.screen = false; return
      case 2:
      case -2: {
        st.transcript = n > 0
        const f = this.mem.word(H.flags2)
        this.mem.setWord(H.flags2, n > 0 ? f | 1 : f & ~1)
        return
      }
      case 3:
        if (st.memory.length >= 16) fail('stack-overflow', 'output stream 3 nested more than 16 deep (§7.1.2.1.1)')
        st.memory.push({ table, count: 0 })
        return
      case -3: {
        const t = st.memory.pop()
        if (t) this.mem.setWord(t.table, t.count)
        return
      }
      case 4: st.commands = true; return
      case -4: st.commands = false; return
    }
  }
}

const cloneFrames = (frames: Frame[]): Frame[] => frames.map(f => ({ ...f, locals: f.locals.slice(), evalStack: f.evalStack.slice() }))

/** A deep copy of plain data (Uint8Arrays included), without structuredClone (not in this package's lib). */
function structuredCopy<T>(x: T): T {
  if (x instanceof Uint8Array) return x.slice() as T
  if (Array.isArray(x)) return x.map(structuredCopy) as T
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x)) out[k] = structuredCopy(v)
    return out as T
  }
  return x
}
