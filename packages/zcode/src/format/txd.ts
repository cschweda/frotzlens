/**
 * txd-format disassembly. Learned from txd's output (clean-room, as with
 * infodump): see test/txd.test.ts and docs/03-phase-2-disassembler.md.
 */
import { packedScale, unpack } from '../address.js'
import type { Instruction, Operand } from '../decode.js'
import type { Routine } from '../routines.js'
import { readString, textContextFor, type TextContext } from '../text.js'
import type { StoryFile, Version } from '../types.js'
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
    g.version === 1 ? (t.kind === 'routine' ? g.parsingRoutines[t.data] : undefined)
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
  const { entries, entryLength } = c.story.dictionary
  if (!entries.length || !entryLength) return undefined
  const offset = address - entries[0]!.address
  if (offset < 0 || offset % entryLength) return undefined
  const index = offset / entryLength
  if (index < entries.length) return entries[index]!.word
  if (index > entries.length) return undefined
  try {
    return readString(c.text, address).text
  } catch {
    return undefined
  }
}

function operand(ins: Instruction, i: number, c: Context): string {
  const o = ins.operands[i]!
  if (o.kind === 'variable') return variable(o.value, false)
  const kind: Kind = operandKind(ins, i)
  switch (kind) {
    case 'ref':
      return variable(o.value, false)
    case 'obj': {
      const obj = o.value > 0 ? c.story.objects.objects[o.value - 1] : undefined
      return obj ? `"${obj.shortName.text}"` : num(o)
    }
    case 'style':
      return (o.kind === 'small' && STYLES[o.value]) || num(o)
    case 'stream':
      return (o.kind === 'small' && STREAMS[o.value]) || num(o)
    case 'char':
      return o.kind === 'small' && o.value >= 32 && o.value <= 126 ? `'${String.fromCharCode(o.value)}'` : num(o)
    case 'routine':
      return routineName(c, c.unpack(o.value))
    case 'paddr': {
      const s = c.stringNumber.get(c.unpack(o.value))
      return s !== undefined ? stringName(s) : num(o)
    }
    case 'low': {
      const t = o.kind === 'large' ? dictionaryText(c, o.value) : undefined
      return t !== undefined ? `"${t}"` : num(o)
    }
    case 'any': {
      if (o.kind !== 'large') return num(o)
      const s = c.stringNumber.get(c.unpack(o.value))
      const t = dictionaryText(c, o.value)
      const str = s !== undefined ? stringName(s) : undefined
      if (str && t !== undefined) return `${str} OR "${t}"`
      if (str) return str
      if (t !== undefined) return `"${t}"`
      return num(o)
    }
    default:
      return num(o)
  }
}

/** One instruction's text after the address column: name, operands, store, branch. */
export function instructionText(ins: Instruction, c: Context): string {
  let ops: string
  const all = ins.operands.map((_, i) => operand(ins, i, c))
  if (ins.info.call && ins.operands[0]) {
    const args = all.slice(1)
    ops = args.length ? `${all[0]} (${args.join(',')})` : all[0]!
  } else if (ins.jumpTarget !== undefined) {
    ops = labelName(c, ins.jumpTarget)
  } else {
    ops = all.join(',')
  }
  if (ins.text) ops = `"${ins.text.text}"`
  // With no operands, the store or branch follows the padded name with no space of its own.
  let s = ins.name.padEnd(16) + ops
  const sep = () => (s.length > 16 ? ' ' : '')
  if (ins.store !== undefined) s += `${sep()}-> ${variable(ins.store, true)}`
  if (ins.branch) {
    const where = ins.branch.returns !== undefined ? (ins.branch.returns ? 'RTRUE' : 'RFALSE') : labelName(c, ins.branch.target!)
    s += `${sep()}[${ins.branch.onTrue ? 'TRUE' : 'FALSE'}] ${where}`
  }
  return s
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
export function routineHeader(r: Routine, isMain: boolean, name: string, version: number): string {
  const head = `${isMain ? 'Main routine' : 'Routine'} ${name}, ${r.locals} ${r.locals === 1 ? 'local' : 'locals'}`
  if (version > 4) return head
  // v1–4: the initial values, even when there are none ("()").
  const open = `${head} (`
  return wrapIndented(`${open}${r.initialValues.map(v => hx(v, 4)).join(', ')})`, open.length)
}

/** One routine: its header line, a blank line, its instructions (each wrapped). */
function routineBlock(r: Routine, c: Context, width: number): string {
  // Labels: every branch and jump target inside the routine, numbered in address order.
  const targets = new Set<number>()
  for (const ins of r.instructions) {
    if (ins.branch?.target !== undefined) targets.add(ins.branch.target)
    if (ins.jumpTarget !== undefined) targets.add(ins.jumpTarget)
  }
  const starts = new Set(r.instructions.map(i => i.address))
  c.labels = new Map([...targets].filter(t => starts.has(t)).sort((a, b) => a - b).map((t, i) => [t, i + 1]))

  const name = routineName(c, r.address)
  const lines = [routineHeader(r, r.address === c.story.code.main, name, c.story.header.version), ...(c.annotations.get(r.address) ?? []), '']
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
