/**
 * The decompiler's proof (docs/09-decompiler.md §4): decompile a story, compile the source again
 * with the same Inform and library, and compare the two stories part by part. Addresses don't count,
 * only what they point to: a routine by its name, a string by its text, a word by its spelling.
 */
import { compile } from '@frotzinc/inform6-wasm'
import { decompileInform, findReference, inferSymbols, parseStory, readSymbols, type StoryFile, type Symbols } from '../src/index.js'
import { informLine } from '../src/inform/grammar.js'

export type PartResult = 'identical' | 'equivalent' | 'different'
export interface RoundTrip {
  source: string
  problems: string[]
  compiled: boolean
  errors: string[]
  /** Every byte after the header the same. */
  identical: boolean
  parts: Record<string, { result: PartResult; differences: string[] }>
}

/**
 * A view of one story where every address is replaced by what's there. `anonymous`: by position
 * instead of by name (routines and arrays by their order, actions and attributes by number), for
 * comparing with a story decompiled without its debug file, whose names were made up.
 */
function canon(story: StoryFile, sym: Symbols, anonymous = false) {
  const v = story.header.version
  const scale = v <= 3 ? 2 : v <= 5 ? 4 : 8
  const routines = new Map(story.code.routines.map(r => [r.address / scale, r]))
  const strings = new Map(story.strings.map(s => [s.address / scale, s.text]))
  const dict = new Map(story.dictionary.entries.map(e => [e.address, e.word]))
  const arrays = new Map(sym.arrays.map(a => [a.address, a.name]))
  const routineIndex = new Map(story.code.routines.map((r, i) => [r.address, i]))
  const arrayIndex = new Map(sym.arrays.slice().sort((a, b) => a.address - b.address).map((a, i) => [a.address, i]))
  const routineName = (address: number) => (anonymous ? `#${routineIndex.get(address)}` : sym.routines[address]?.name ?? `?routine@${address}`)
  // Every reading of a word: a routine, string, dictionary word or array at that address can all
  // coincide, so each is kept ("R:x|D:y"), and two words match when they share one (see same()).
  const value = (w: number): string => {
    const readings: string[] = []
    if (w >= 256) {
      const r = routines.get(w)
      if (r) readings.push(`R:${routineName(r.address)}`)
      const s = strings.get(w)
      if (s !== undefined) readings.push(`S:${s}`)
      const d = dict.get(w)
      if (d !== undefined) readings.push(`D:${d}`)
      const a = arrays.get(w)
      if (a !== undefined) readings.push(`A:${anonymous ? arrayIndex.get(w) : a}`)
    }
    return readings.length ? `\u0002${readings.join('\u0001')}\u0002` : String(w)
  }
  const words = (data: number[]) => Array.from({ length: data.length >> 1 }, (_, k) => value((data[2 * k]! << 8) | data[2 * k + 1]!)).join(' ')
  const individuals = (data: number[]) => {
    if (data.length < 2) return ''
    let a = (data[0]! << 8) | data[1]!
    const out: string[] = []
    const b = story.bytes
    for (let g = 0; a + 3 <= b.length && ((b[a]! << 8) | b[a + 1]!) && g < 256; g++) {
      const id = ((b[a]! << 8) | b[a + 1]!) & 0x7fff
      const len = b[a + 2]!
      out.push(`${anonymous ? id : sym.properties[id] ?? id}=${words(Array.from(b.subarray(a + 3, a + 3 + len)))}`)
      a += 3 + len
    }
    return out.sort().join('; ')
  }

  const objects = new Map<string, string>()
  for (const o of story.objects.objects) {
    const props = o.properties
      .map(p => (p.number === 3 ? `individual: ${individuals(p.data)}` : `${anonymous ? p.number : sym.properties[p.number] ?? p.number}=${words(p.data)}`))
      .sort()
    objects.set(`${o.number}`, [`"${o.shortName.text}"`, `in ${o.parent} next ${o.sibling} first ${o.child}`, `has ${o.attributes.join(',')}`, ...props].join(' | '))
  }
  const defaults = new Map(story.objects.propertyDefaults.map((d, i) => [`${i + 1}`, value(d)]))
  const globals = new Map(story.globals.map(g => [anonymous ? `g${g.number}` : sym.globals[g.number] ?? `g${g.number}`, value(g.value)]))
  // Without names, arrays are compared as the bytes of the array space (their bounds were guessed).
  const arraySpace = (() => {
    const start = story.header.globals + 480
    const end = story.grammar?.address ?? story.header.staticMemory
    const ws: string[] = []
    for (let a = start; a + 1 < end; a += 2) ws.push(value((story.bytes[a]! << 8) | story.bytes[a + 1]!))
    return ws.join(' ')
  })()
  const arrayContents = anonymous ? new Map([['array space', arraySpace]]) : new Map(sym.arrays.map(a => {
    const data = Array.from(story.bytes.subarray(a.address, a.address + a.byteCount))
    return [a.name, a.bytesPerElement === 2 ? words(data) : data.join(' ')]
  }))
  const dictionary = new Map(story.dictionary.entries.map(e => [e.word, JSON.stringify(e.inform ?? {})]))
  const names = { routine: (a: number) => routineName(a), action: (n: number) => (anonymous ? `${n}` : sym.actions[n] ?? `${n}`), attribute: (n: number) => (anonymous ? `${n}` : sym.attributes[n] ?? `${n}`) }
  const grammar = new Map((story.grammar?.verbs ?? []).map(verb => [verb.words.join(' '), verb.lines.map(l => informLine(story, l, names) ?? '?').join(' / ')]))
  const code = new Map<string, string>()
  for (const r of story.code.routines) {
    const index = new Map(r.instructions.map((i, k) => [i.address, k]))
    const text = r.instructions.map(i => {
      const ops = i.operands.map(o => (o.kind === 'variable' ? `v${o.value}` : o.kind === 'large' ? value(o.value) : `${o.value}`)).join(',')
      const branch = i.branch ? (i.branch.returns !== undefined ? `?${i.branch.onTrue}:${i.branch.returns}` : `?${i.branch.onTrue}:@${index.get(i.branch.target!)}`) : ''
      const jump = i.jumpTarget !== undefined ? `@${index.get(i.jumpTarget)}` : ''
      return `${i.name} ${i.name === 'JUMP' ? jump : ops}${i.store !== undefined ? ` ->${i.store}` : ''}${branch}${i.text ? ` "${i.text.text}"` : ''}`
    })
    code.set(routineName(r.address), `${r.locals} | ${text.join('; ')}`)
  }
  // Each action's number: the code compares actions by number, so a renumbering is a difference.
  const actions = new Map((story.grammar?.actions ?? []).map((a, n) => [anonymous ? `${n}` : sym.actions[n] ?? `${n}`, `${n} ${routineName(a)}`]))
  // Without names, the strings that are only names (Inform keeps the properties', attributes' and
  // actions' for printing) aren't compared.
  const names_ = new Set([...Object.values(sym.properties), ...Object.values(sym.attributes), ...Object.values(sym.actions), ...Object.values(sym.classes), ...Object.values(sym.objects), ...Object.values(sym.globals), ...sym.arrays.map(a => a.name), ...Object.values(sym.routines).map(r => r.name)])
  const stringSet = new Map<string, string>()
  for (const s of story.strings) if (!anonymous || !names_.has(s.text)) stringSet.set(s.text, String(Number(stringSet.get(s.text) ?? 0) + 1))
  return { objects, defaults, globals, arrays: arrayContents, dictionary, grammar, actions, routines: code, strings: stringSet }
}

/** Two canonical texts match when they're the same but for values, and each value shares a reading. */
function same(x: string, y: string): boolean {
  if (x === y) return true
  const a = x.split('\u0002')
  const b = y.split('\u0002')
  if (a.length !== b.length) return false
  return a.every((p, i) => {
    const q = b[i]!
    if (i % 2 === 0) return p === q
    const rq = new Set(q.split('\u0001'))
    return p.split('\u0001').some(r => rq.has(r))
  })
}
const shown = (s: string) => s.replace(/\u0002/g, '').replace(/\u0001/g, '|').slice(0, 300)

function comparePart(a: Map<string, string>, b: Map<string, string>, max = 5): { same: boolean; differences: string[] } {
  const differences: string[] = []
  for (const [k, x] of a) {
    const y = b.get(k)
    if (y === undefined) differences.push(`${k}: only in the original`)
    else if (!same(x, y)) differences.push(`${k}:\n      was ${shown(x)}\n      now ${shown(y)}`)
  }
  for (const k of b.keys()) if (!a.has(k)) differences.push(`${k}: only in the recompiled story`)
  return { same: !differences.length, differences: differences.slice(0, max) }
}

/**
 * `withoutSymbols`: decompile as if there were no debug file (the symbols worked out from the
 * library compiled alone), and compare without names; the debug file is still what the original is
 * read with.
 */
export async function roundTrip(bytes: Uint8Array, dbg: string, withoutSymbols = false): Promise<RoundTrip> {
  const story = parseStory(bytes)
  const truth = readSymbols(dbg)
  let symbols = truth
  if (withoutSymbols) {
    const ref = await findReference(story, async (source, library, version) => {
      const out = await compile(source, { version, library, debug: true })
      // An extension that won't compile alone is a reference not to use.
      if (!out.ok || !out.story || !out.dbg) return undefined
      return { story: parseStory(out.story), symbols: readSymbols(out.dbg) }
    })
    if (!ref) throw new Error('No library to compile a reference with.')
    symbols = inferSymbols(story, ref)
  }
  const { source, problems } = decompileInform(story, { symbols })
  const library = story.fingerprint?.library?.name === 'PunyInform' ? 'puny' : 'std'
  const out = await compile(source, { version: `z${story.header.version}` as 'z5', library, debug: true })
  const errors = out.diagnostics.filter(d => d.severity !== 'warning').map(d => `${d.line}: ${d.message}`)
  const result: RoundTrip = { source, problems, compiled: !!out.story && out.ok, errors, identical: false, parts: {} }
  if (!out.story) return result
  if (!out.dbg) {
    result.errors.push('The compiler wrote no debug file, so the stories can\'t be compared.')
    return result
  }
  const b = out.story
  result.identical = bytes.length === b.length && bytes.subarray(0x40).every((x, i) => x === b[0x40 + i])
  const A = canon(story, truth, withoutSymbols)
  const B = canon(parseStory(b), readSymbols(out.dbg), withoutSymbols)
  for (const part of Object.keys(A) as (keyof typeof A)[]) {
    const { same, differences } = comparePart(A[part], B[part])
    result.parts[part] = { result: !same ? 'different' : result.identical ? 'identical' : 'equivalent', differences }
  }
  return result
}
