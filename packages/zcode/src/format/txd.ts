/**
 * txd-format disassembly. Learned from txd's output (clean-room, as with
 * infodump): see test/txd.test.ts and docs/03-phase-2-disassembler.md.
 */
import { packedScale, unpack } from '../address.js'
import type { Instruction, Operand } from '../decode.js'
import type { Routine } from '../routines.js'
import { readString, textContextFor, type TextContext } from '../text.js'
import type { Id, StoryFile, Version } from '../types.js'
import { grammarLineText, grammarLines } from './grammar.js'
import { Writer } from './writer.js'

const hx = (n: number, w = 0) => n.toString(16).padStart(w, '0')

export interface TxdOptions {
  /** As txd prints it on its first line? (txd has no banner; kept for the CLI's own use.) */
  fileName?: string
  /** txd -n: addresses instead of labels (R0001, L0001); strings are numbered either way. */
  addresses?: boolean
  /** Wrap width (default 79, as txd; 0 = no wrapping). */
  width?: number
  /** txd -g: leave out the grammar annotations ("Action routine for: …"). */
  noGrammar?: boolean
}

/** What formatting needs, worked out once per story and mode. */
interface Context {
  story: StoryFile
  addresses: boolean
  unpack: (packed: number) => number
  routineNumber: Map<number, number>
  stringNumber: Map<number, number>
  text: TextContext
  /** Labels of the routine being formatted: target address → L-number. */
  labels: Map<number, number>
  /** Routine address → its grammar annotation lines ("    Action routine for:", …). */
  annotations: Map<number, string[]>
}

function makeContext(story: StoryFile, opts: TxdOptions): Context {
  const v = story.header.version as Version
  return {
    story,
    addresses: !!opts.addresses,
    unpack: p => unpack(p, v, v === 6 || v === 7 ? story.header.routinesOffset : undefined),
    routineNumber: new Map(story.code.routines.map((r, i) => [r.address, i + 1])),
    stringNumber: new Map(story.strings.map((s, i) => [s.address, i + 1])),
    text: textContextFor(story),
    labels: new Map(),
    annotations: opts.noGrammar ? new Map() : grammarAnnotations(story, opts.width ?? 79),
  }
}

/**
 * txd's notes above a routine that the grammar names: "Action routine for:"
 * with every grammar line whose action it is, "Parsing routine for:" with
 * every line whose token calls it — each line indented 8 and wrapped there.
 */
function grammarAnnotations(story: StoryFile, width: number): Map<number, string[]> {
  const out = new Map<number, string[]>()
  const g = story.grammar
  if (!g) return out
  const v = story.header.version as Version
  const lines = grammarLines(story)
  type Listed = { verb: string; line: import('../grammar.js').GrammarLine }
  const add = (routine: number, heading: string, listed: Listed[]) => {
    const list = out.get(routine) ?? []
    const text = (x: Listed) => `        "${grammarLineText(story, x.verb, x.line)}"${x.line.reverse ? ' REVERSE' : ''}`
    // An action routine no grammar line uses still gets its heading, over an empty line.
    list.push(`    ${heading} routine for:`, ...(listed.length ? listed.map(x => wrapIndented(text(x), 8, width)) : ['        ']))
    out.set(routine, list)
  }
  const actionRoutines = [...new Set(g.actions)]
  for (const routine of actionRoutines) {
    add(routine, 'Action', lines.filter(x => g.actions[x.line.action] === routine))
  }
  // Parsing routines: GV1's table by number; GV2's tokens name packed routines directly.
  const parsing = new Set<number>()
  const parsingRoutine = (t: { kind: string; data: number }) =>
    g.version === 1
      ? t.kind === 'routine' || t.kind === 'noun-routine' || t.kind === 'scope-routine'
        ? g.parsingRoutines[t.data]
        : undefined
    : g.version === 2 && (t.kind === 'routine' || t.kind === 'noun-routine' || t.kind === 'scope-routine') ? unpack(t.data, v) : undefined
  for (const x of lines) for (const t of x.line.tokens) {
    const r = parsingRoutine(t)
    if (r !== undefined) parsing.add(r)
  }
  for (const routine of parsing) {
    add(routine, 'Parsing', lines.filter(x => x.line.tokens.some(t => parsingRoutine(t) === routine)))
  }
  return out
}

const routineName = (c: Context, address: number) => {
  const n = c.routineNumber.get(address)
  return c.addresses || n === undefined ? hx(address) : `R${String(n).padStart(4, '0')}`
}
const labelName = (c: Context, address: number) => {
  const n = c.labels.get(address)
  return c.addresses || n === undefined ? hx(address) : `L${String(n).padStart(4, '0')}`
}
const stringName = (n: number) => `S${String(n).padStart(3, '0')}`

import { operandKind, type Kind } from '../operands.js'

const STYLES: Record<number, string> = { 0: 'ROMAN', 1: 'REVERSE', 2: 'BOLDFACE', 4: 'EMPHASIS', 8: 'FIXED_FONT' }
const STREAMS: Record<number, string> = { 1: 'OUTPUT_ENABLE', 2: 'SCRIPTING_ENABLE', 3: 'REDIRECT_ENABLE', 4: 'RECORD_ENABLE' }

/** A variable as txd writes it: (SP)+ read, -(SP) written, L00–L0e locals, G00–Gef globals. */
export function variable(v: number, written: boolean): string {
  if (v === 0) return written ? '-(SP)' : '(SP)+'
  if (v < 16) return `L${hx(v - 1, 2)}`
  return `G${hx(v - 16, 2)}`
}

const num = (o: Operand) => (o.kind === 'large' ? `#${hx(o.value, 4)}` : `#${hx(o.value, 2)}`)

/**
 * The text for a constant that is a dictionary entry's address: one a whole
 * number of entries from the first, counting up to and including the entry
 * count — one past the end, which txd decodes too (whatever text follows the
 * dictionary). Observed: `#12d9` in a 193-word v3 dictionary is entry 193.
 */
function dictionaryText(c: Context, address: number): string | undefined {
  return dictionaryAt(c, address)?.text
}

/** dictionaryText, and whether the address is one of the entries (not txd's one past the end). */
function dictionaryAt(c: Context, address: number): { text: string; entry: boolean } | undefined {
  const { entries, entryLength } = c.story.dictionary
  if (!entries.length || !entryLength) return undefined
  const offset = address - entries[0]!.address
  if (offset < 0 || offset % entryLength) return undefined
  const index = offset / entryLength
  if (index < entries.length) return { text: entries[index]!.word, entry: true }
  if (index > entries.length) return undefined
  try {
    return { text: readString(c.text, address).text, entry: false }
  } catch {
    return undefined
  }
}

/**
 * A piece of a disassembly line: its text, and what it names, if anything —
 * a routine, string, object or dictionary word (`id`), or a label in the same
 * routine (`target`, an instruction's address). Joined, the pieces are exactly
 * txd's text; the app turns the named ones into links.
 */
export interface DisassemblyPiece {
  text: string
  id?: Id
  target?: number
}

const objectId = (n: number): Id => `object:${n}`
const routineId = (a: number): Id => `routine:${hx(a, 4)}`
const stringId = (a: number): Id => `string:${hx(a, 4)}`
const dictId = (a: number): Id => `dict:${hx(a, 4)}`

function operandPieces(ins: Instruction, i: number, c: Context): DisassemblyPiece[] {
  const o = ins.operands[i]!
  const plain = (text: string): DisassemblyPiece[] => [{ text }]
  if (o.kind === 'variable') return plain(variable(o.value, false))
  const kind: Kind = operandKind(ins, i)
  // A dictionary word, linked when it is one of the entries (not txd's one-past-the-end).
  const word = (address: number): DisassemblyPiece | undefined => {
    const d = dictionaryAt(c, address)
    return d && (d.entry ? { text: `"${d.text}"`, id: dictId(address) } : { text: `"${d.text}"` })
  }
  switch (kind) {
    case 'ref':
      return plain(variable(o.value, false))
    case 'obj': {
      const obj = o.value > 0 ? c.story.objects.objects[o.value - 1] : undefined
      return obj ? [{ text: `"${obj.shortName.text}"`, id: objectId(obj.number) }] : plain(num(o))
    }
    case 'style':
      return plain((o.kind === 'small' && STYLES[o.value]) || num(o))
    case 'stream':
      return plain((o.kind === 'small' && STREAMS[o.value]) || num(o))
    case 'char':
      return plain(o.kind === 'small' && o.value >= 32 && o.value <= 126 ? `'${String.fromCharCode(o.value)}'` : num(o))
    case 'routine': {
      const address = c.unpack(o.value)
      return [c.routineNumber.has(address) ? { text: routineName(c, address), id: routineId(address) } : { text: routineName(c, address) }]
    }
    case 'paddr': {
      const address = c.unpack(o.value)
      const s = c.stringNumber.get(address)
      return s !== undefined ? [{ text: stringName(s), id: stringId(address) }] : plain(num(o))
    }
    case 'low': {
      const w = o.kind === 'large' ? word(o.value) : undefined
      return w ? [w] : plain(num(o))
    }
    case 'any': {
      if (o.kind !== 'large') return plain(num(o))
      const address = c.unpack(o.value)
      const s = c.stringNumber.get(address)
      const w = word(o.value)
      const str: DisassemblyPiece | undefined = s !== undefined ? { text: stringName(s), id: stringId(address) } : undefined
      if (str && w) return [str, { text: ' OR ' }, w]
      if (str) return [str]
      if (w) return [w]
      return plain(num(o))
    }
    default:
      return plain(num(o))
  }
}

/** A branch or jump target: a link to its line when it is one of this routine's labels. */
const label = (c: Context, target: number): DisassemblyPiece =>
  c.labels.has(target) ? { text: labelName(c, target), target } : { text: labelName(c, target) }

const joined = (parts: DisassemblyPiece[][], sep: string): DisassemblyPiece[] =>
  parts.flatMap((p, i) => (i ? [{ text: sep }, ...p] : p))

/** One instruction after the address column, as pieces: name, operands, store, branch. */
function instructionPieces(ins: Instruction, c: Context): DisassemblyPiece[] {
  const all = ins.operands.map((_, i) => operandPieces(ins, i, c))
  let ops: DisassemblyPiece[]
  if (ins.info.call && ins.operands[0]) {
    const args = all.slice(1)
    ops = args.length ? [...all[0]!, { text: ' (' }, ...joined(args, ','), { text: ')' }] : all[0]!
  } else if (ins.jumpTarget !== undefined) {
    ops = [label(c, ins.jumpTarget)]
  } else {
    ops = joined(all, ',')
  }
  if (ins.text) ops = [{ text: `"${ins.text.text}"` }]
  // With no operands, the store or branch follows the padded name with no space of its own.
  const out: DisassemblyPiece[] = [{ text: ins.name.padEnd(16) }, ...ops]
  let length = out.reduce((n, p) => n + p.text.length, 0)
  const push = (p: DisassemblyPiece) => {
    out.push(p)
    length += p.text.length
  }
  const sep = () => (length > 16 ? ' ' : '')
  if (ins.store !== undefined) push({ text: `${sep()}-> ${variable(ins.store, true)}` })
  if (ins.branch) {
    push({ text: `${sep()}[${ins.branch.onTrue ? 'TRUE' : 'FALSE'}] ` })
    if (ins.branch.returns !== undefined) push({ text: ins.branch.returns ? 'RTRUE' : 'RFALSE' })
    else push(label(c, ins.branch.target!))
  }
  return out
}

/** One instruction's text after the address column: name, operands, store, branch. */
export function instructionText(ins: Instruction, c: Context): string {
  return instructionPieces(ins, c).map(p => p.text).join('')
}

/**
 * Wrap `text` at `width` columns at the last space, as txd does, with every
 * continuation line indented to `indent` (txd lines a routine header's
 * initial values up under the "(").
 */
export function wrapIndented(text: string, indent: number, width = 79): string {
  const out: string[] = []
  let line = text
  while (width && line.length > width) {
    const space = line.lastIndexOf(' ', width)
    if (space <= indent) break
    out.push(line.slice(0, space))
    line = ' '.repeat(indent) + line.slice(space + 1)
  }
  out.push(line)
  return out.join('\n')
}

/** A routine's header line: "Routine 4f4, 2 locals", plus v1–4's initial values in parentheses. */
export function routineHeader(r: Routine, isMain: boolean, name: string, version: number, width = 79): string {
  const head = `${isMain ? 'Main routine' : 'Routine'} ${name}, ${r.locals} ${r.locals === 1 ? 'local' : 'locals'}`
  if (version > 4) return head
  // v1–4: the initial values, even when there are none ("()").
  const open = `${head} (`
  return wrapIndented(`${open}${r.initialValues.map(v => hx(v, 4)).join(', ')})`, open.length, width)
}

/** One routine: its header line, a blank line, its instructions (each wrapped). */
/** Labels: every branch and jump target inside the routine, numbered in address order. */
function setLabels(r: Routine, c: Context): void {
  const targets = new Set<number>()
  for (const ins of r.instructions) {
    if (ins.branch?.target !== undefined) targets.add(ins.branch.target)
    if (ins.jumpTarget !== undefined) targets.add(ins.jumpTarget)
  }
  const starts = new Set(r.instructions.map(i => i.address))
  c.labels = new Map([...targets].filter(t => starts.has(t)).sort((a, b) => a - b).map((t, i) => [t, i + 1]))
}

function routineBlock(r: Routine, c: Context, width: number): string {
  setLabels(r, c)

  const name = routineName(c, r.address)
  const lines = [routineHeader(r, r.address === c.story.code.main, name, c.story.header.version, width), ...(c.annotations.get(r.address) ?? []), '']
  const w = new Writer(width)
  for (const ins of r.instructions) {
    const label = c.labels.get(ins.address)
    const lead = c.addresses
      ? `${hx(ins.address).padStart(5)}:  `
      : label !== undefined
        ? `L${String(label).padStart(4, '0')}: `
        : '       '
    w.write(`${lead}${instructionText(ins, c)}\n`)
  }
  return `${lines.join('\n')}\n${w.toString()}`
}

/** One routine as txd prints it (txd's `R…` and `S…` numbers come from the whole story). */
export function formatRoutine(story: StoryFile, address: number, opts: TxdOptions = {}): string | undefined {
  const r = story.code.routines.find(x => x.address === address)
  return r ? routineBlock(r, makeContext(story, opts), opts.width ?? 79) : undefined
}

const numbers = new WeakMap<StoryFile, { routines: Map<number, number>; strings: Map<number, number> }>()
const storyNumbers = (story: StoryFile) => {
  let n = numbers.get(story)
  if (!n) numbers.set(story, (n = { routines: new Map(story.code.routines.map((r, i) => [r.address, i + 1])), strings: new Map(story.strings.map((s, i) => [s.address, i + 1])) }))
  return n
}

/** txd's name for the routine at `address` (R0001), or its address when it isn't one of the story's. */
export function txdRoutineName(story: StoryFile, address: number): string {
  const n = storyNumbers(story).routines.get(address)
  return n === undefined ? hx(address) : `R${String(n).padStart(4, '0')}`
}

/** txd's name for the string at `address` (S001), or its address when it isn't one of the story's. */
export function txdStringName(story: StoryFile, address: number): string {
  const n = storyNumbers(story).strings.get(address)
  return n === undefined ? hx(address) : stringName(n)
}

/** One routine, for display: txd's text in pieces, unwrapped, with what each piece names. */
export interface RoutineView {
  address: number
  /** txd's name for it: R0001, or the address with `addresses`. */
  name: string
  /** "Routine R0001, 2 locals" (v1–4: and the initial values), unwrapped. */
  header: string
  /** txd's grammar notes ("Action routine for:" and its lines), unwrapped. */
  notes: string[]
  lines: {
    address: number
    /** L0001, when something branches or jumps here. */
    label?: string
    pieces: DisassemblyPiece[]
  }[]
}

/**
 * One routine as pieces, for the app: the same text as formatRoutine (with no
 * wrapping), and each routine, string, object, dictionary word and label it
 * names marked, so it can be shown with links. Numbers (R…, S…) come from the
 * whole story, as txd's do.
 */
export function routineView(story: StoryFile, address: number, opts: Omit<TxdOptions, 'width' | 'fileName'> = {}): RoutineView | undefined {
  const r = story.code.routines.find(x => x.address === address)
  if (!r) return undefined
  const c = makeContext(story, { ...opts, width: 0 })
  setLabels(r, c)
  const name = routineName(c, r.address)
  return {
    address: r.address,
    name,
    header: routineHeader(r, r.address === story.code.main, name, story.header.version, 0),
    notes: c.annotations.get(r.address) ?? [],
    lines: r.instructions.map(ins => {
      const n = c.labels.get(ins.address)
      return { address: ins.address, ...(n !== undefined && { label: `L${String(n).padStart(4, '0')}` }), pieces: instructionPieces(ins, c) }
    }),
  }
}

/** The strings after the code, as txd lists them (S001: "…"), for copying. */
export function formatStrings(story: StoryFile, opts: Pick<TxdOptions, 'addresses' | 'width'> = {}): string {
  const t = new Writer(opts.width ?? 79)
  story.strings.forEach((s, i) => {
    t.write(opts.addresses ? `${hx(s.address).padStart(5)}: ${stringName(i + 1)} "${s.text}"\n` : `${stringName(i + 1)}: "${s.text}"\n`)
  })
  return t.toString()
}

/**
 * The whole disassembly, as txd prints it: the analysis lines, every routine,
 * and the strings after the code.
 */
export function formatTxd(story: StoryFile, opts: TxdOptions = {}): string {
  const c = makeContext(story, opts)
  const width = opts.width ?? 79
  const { code, strings, header } = story
  const routines = code.routines
  const at = (label: string, address: number) => (c.addresses ? `[${label} at ${hx(address)}]` : `[${label}]`)
  const out: string[] = []
  const w = new Writer(width)
  w.write(`Resident data ends at ${hx(header.highMemory)}, program starts at ${hx(header.highMemory)}, file ends at ${hx(header.fileLength)}\n\n`)
  w.write(`Starting analysis pass at address ${hx(code.analysisStart)}\n\n`)
  // txd's "high address" is where the second-to-last routine ends: where it began looking for the last.
  const high = routines.length > 1 ? routines.at(-2)!.end : (routines[0]?.address ?? code.analysisStart)
  w.write(`End of analysis pass, low address = ${hx(routines[0]?.address ?? code.analysisStart)}, high address = ${hx(high)}\n\n`)
  // Data between the dictionary and the first routine (PunyInform leaves some), when it's more
  // than alignment padding.
  const first = routines[0]?.address ?? code.analysisStart
  if (first - code.analysisStart >= packedScale(header.version as Version)) {
    w.write(`${first - code.analysisStart} bytes of data before code from ${hx(code.analysisStart)} to ${hx(first)}\n\n`)
  }
  w.write(`${at('Start of code', routines[0]?.address ?? code.analysisStart)}\n`)
  out.push(w.toString())
  for (const r of routines) out.push(`\n${routineBlock(r, c, width)}`)
  const t = new Writer(width)
  t.write(`\n${at('End of code', code.end)}\n\n`)
  t.write(`${at('Start of text', strings[0]?.address ?? code.end)}\n\n`)
  strings.forEach((s, i) => {
    t.write(c.addresses ? `${hx(s.address).padStart(5)}: ${stringName(i + 1)} "${s.text}"\n` : `${stringName(i + 1)}: "${s.text}"\n`)
  })
  const textEnd = strings.length ? strings.at(-1)!.address + strings.at(-1)!.length : code.end
  t.write(`\n${at('End of text', header.fileLength || textEnd)}\n\n[End of file]\n`)
  out.push(t.toString())
  return out.join('')
}
