/**
 * Phase 6a without a debug file: the symbols a gameinfo.dbg would have given, worked out by
 * comparing the story with its library compiled alone (an empty game, `referenceSource`), so the
 * decompiler can run as it does with one.
 *
 * 1. The routines are lined up with the reference's, in order, by their shape (locals and opcodes):
 *    the library's come in the same order in both, the game's fall between.
 * 2. Each lined-up pair is then walked instruction by instruction. Where the reference's operand is
 *    something with a name (a routine it calls, a global, an array, a string, an object, a property
 *    or attribute), the story's operand there is the same thing. Counted over every pair, the votes
 *    name the library's routines (stubs and entry points included: a call to NewRoom in the
 *    reference is a call to the game's NewRoom in the story), globals, arrays and objects.
 * 3. What's left is the game's, and gets a name made up from what the story says: an object from
 *    its short name, an embedded routine from its object and property, an action routine from its
 *    verb, anything else from its address or number.
 */
import type { Routine } from '../routines.js'
import type { SourceLocation, SymbolDeclaration, Symbols } from '../debug.js'
import { routineShape } from '../fingerprint.js'
import type { StoryFile } from '../types.js'
import { classPrototype, individualProperties } from './objects.js'

/** The library alone, compiled as the story was: its story file and its debug file, read. */
export interface Reference {
  story: StoryFile
  symbols: Symbols
  /** The library's constants the game set, as found by findReference: a value, or none for `Constant X;`. */
  constants?: { name: string; value?: number }[]
}

const includes = (names: string[]) => names.map(n => `Include "${n}";\n`).join('')
const constants = (cs: { name: string; value?: number }[]) => cs.map(c => `Constant ${c.name}${c.value === undefined ? '' : ` = ${c.value}`};\n`).join('')
const STD_SKELETON = (strict: boolean, debug: boolean, extensions: string[], cs: { name: string; value?: number }[]) => `${strict ? '' : '!% -~S\n'}${debug ? 'Constant DEBUG;\n' : ''}${constants(cs)}Constant Story "Frotzlens reference story";
Constant Headline "^Frotzlens reference headline^";
Include "Parser";
Include "VerbLib";
Object Room "Room" has light;
[ Initialise; location = Room; ];
${includes(extensions)}Include "Grammar";
`
const PUNY_SKELETON = (debug: boolean, extensions: string[], cs: { name: string; value?: number }[]) => `!% -~S
${debug ? 'Constant DEBUG;\n' : ''}${constants(cs)}Constant Story "Frotzlens reference story";
Constant Headline "^Frotzlens reference headline^";
Constant INITIAL_LOCATION_VALUE = Room;
Include "globals.h";
${includes(extensions.filter(e => e === 'ext_flags.h'))}Include "puny.h";
${includes(extensions.filter(e => e !== 'ext_flags.h'))}Object Room "Room" has light;
[ Initialise; ];
`

/** The extensions @frotzinc/inform6-wasm has for each library: a story may have included any of them. */
export const REFERENCE_EXTENSIONS: Record<'std' | 'puny', string[]> = {
  std: ['Exits'],
  puny: ['ext_flags.h', 'ext_menu.h', 'ext_quote_box.h', 'ext_talk_menu.h', 'ext_waittime.h', 'ext_cheap_scenery.h'],
}

/**
 * The empty game to compile as the story's reference, with the library and switches the story
 * shows: compile it with @frotzinc/inform6-wasm (`debug: true`, the version and library given) and
 * pass the result to decompileInform as `reference`. Undefined for a story without a known library.
 * (PunyInform's reference keeps every library routine, without `$OMIT_UNUSED_ROUTINES`, so whatever
 * the game used is in it.)
 */
/**
 * The Standard Library's settings a game can make, which change what the library compiles to:
 * switches it tests with #Ifdef (`Constant NO_SCORE;`), and numbers it gives defaults to.
 * (`TASKS_PROVIDED` and `AMUSING_PROVIDED` are both: defined without a value, they're 0, which turns
 * the feature on.)
 */
export const LIBRARY_SWITCHES: Record<'std' | 'puny', string[]> = {
  std: ['TASKS_PROVIDED', 'AMUSING_PROVIDED', 'NO_SCORE', 'NO_PLACES', 'MANUAL_PRONOUNS', 'DIALECT_US', 'TRADITIONAL_TAKE_ALL', 'NO_TAKE_ALL', 'WITHOUT_DIRECTIONS', 'SERIAL_COMMAS', 'NOINITIAL_LOOK', 'DEATH_MENTION_UNDO', 'OOPS_CHECK'],
  puny: [],
}
export const LIBRARY_NUMBERS: Record<'std' | 'puny', string[]> = {
  std: ['MAX_SCORE', 'NUMBER_TASKS', 'OBJECT_SCORE', 'ROOM_SCORE', 'MAX_CARRIED', 'SACK_OBJECT'],
  puny: [],
}

export function referenceSource(story: StoryFile, extensions: string[] = [], settings: { name: string; value?: number }[] = []): { source: string; library: 'std' | 'puny'; version: 'z3' | 'z4' | 'z5' | 'z8' } | undefined {
  const lib = story.fingerprint?.library?.name
  if (story.fingerprint?.compiler !== 'inform6') return undefined
  const v = story.header.version
  const version = v === 3 ? 'z3' : v === 4 ? 'z4' : v === 8 ? 'z8' : 'z5'
  const strict = Object.values(story.fingerprint?.veneer ?? {}).some(n => n.startsWith('RT__Ch'))
  // No library: an empty Main, which gives the veneer's routines their names and nothing else.
  if (!lib) return { source: `${strict ? '' : '!% -~S\n'}[ Main; ];\n`, library: 'std', version }
  // The library's debugging verbs are in the story when it was compiled with DEBUG.
  const debug = story.dictionary.entries.some(e => e.word === 'purloin')
  return lib === 'PunyInform'
    ? { source: PUNY_SKELETON(debug, extensions, settings), library: 'puny', version }
    : { source: STD_SKELETON(strict, debug, extensions, settings), library: 'std', version }
}

/**
 * How well the reference fits: each of the story's routines that lines up with one of the
 * reference's counts, and more when its small numbers are the same too (a setting that changes only
 * a number shows up there).
 */
export function referenceMatch(story: StoryFile, ref: Reference): number {
  const R = ref.story.code.routines.filter(r => ref.symbols.routines[r.address]?.location?.file !== 0)
  const S = story.code.routines
  let score = 0
  for (const [i, j] of align(S.map(key), R.map(key))) {
    score += 1000
    const a = S[i]!.instructions
    const b = R[j]!.instructions
    if (a.every((x, k) => x.operands.every((o, n) => o.kind !== 'small' || b[k]!.operands[n]?.value === o.value))) score++
  }
  return score
}

/**
 * The story's reference: its library compiled alone, set up as the story's was. Each extension the
 * library has, and each switch the game can set, is tried in turn and kept if more of the story's
 * routines line up; then each number the game can set is found by compiling the library with an
 * unusual value for it, seeing which operands change, and reading the story's there. `compile` is
 * @frotzinc/inform6-wasm's (or anything that compiles the same); it gives undefined for a source
 * that doesn't compile.
 */
export async function findReference(
  story: StoryFile,
  compile: (source: string, library: 'std' | 'puny', version: 'z3' | 'z4' | 'z5' | 'z8') => Promise<Reference | undefined>,
): Promise<Reference | undefined> {
  const first = referenceSource(story)
  if (!first) return undefined
  const lib = first.library
  const chosen: string[] = []
  const settings: { name: string; value?: number }[] = []
  const build = async (ext: string[], set: { name: string; value?: number }[]) => {
    const r = referenceSource(story, ext, set)!
    return compile(r.source, r.library, r.version)
  }
  let best = await build([], [])
  if (!best) return undefined
  let score = referenceMatch(story, best)
  const tryWith = async (ext: string[], set: { name: string; value?: number }[]) => {
    const r = await build(ext, set)
    if (!r) return false
    const s = referenceMatch(story, r)
    if (s <= score) return false
    best = r
    score = s
    return true
  }
  if (!story.fingerprint?.library) return { ...best, constants: [] }
  for (const ext of REFERENCE_EXTENSIONS[lib]) if (await tryWith([...chosen, ext], settings)) chosen.push(ext)
  for (const name of LIBRARY_SWITCHES[lib]) if (await tryWith(chosen, [...settings, { name }])) settings.push({ name })

  // The numbers: where an unusual value turns up in the library's code is where the story's is.
  const S = story.code.routines
  for (const name of LIBRARY_NUMBERS[lib]) {
    if (settings.some(s => s.name === name)) continue
    // Two unusual values, so a place where the library has one of them anyway isn't taken for it.
    const PROBES = [211, 223] as const
    const probes = await Promise.all(PROBES.map(value => build(chosen, [...settings, { name, value }])))
    if (probes.some(p => !p)) continue
    const at = probes.map((probe, p) => {
      const R = probe!.story.code.routines.filter(r => probe!.symbols.routines[r.address]?.location?.file !== 0)
      const places = new Map<string, number>() // "story routine:instruction:operand" -> the story's value there
      for (const [i, j] of align(S.map(key), R.map(key))) {
        const a = S[i]!.instructions
        R[j]!.instructions.forEach((y, k) => y.operands.forEach((o, n) => {
          if (o.kind === 'variable' || o.value !== PROBES[p]) return
          const x = a[k]?.operands[n]
          if (x && x.kind === o.kind) places.set(`${i}:${k}:${n}`, x.value)
        }))
      }
      return places
    })
    const seen = new Map<number, number>()
    for (const [place, v] of at[0]!) if (at[1]!.has(place)) seen.set(v, (seen.get(v) ?? 0) + 1)
    const found = [...seen].sort((x, y) => y[1] - x[1])[0]
    if (!found) continue
    const set = [...settings, { name, value: found[0] }]
    const r = await build(chosen, set)
    if (r && referenceMatch(story, r) >= score) {
      best = r
      score = referenceMatch(story, r)
      settings.push({ name, value: found[0] })
    }
  }
  return { ...best, constants: settings }
}

const key = (r: Routine) => routineShape(r)
/** Opcodes whose first operand names a variable by number (§14.2.3). */
const VARIABLE_REFERENCE = new Set(['INC', 'DEC', 'INC_CHK', 'DEC_CHK', 'STORE', 'LOAD', 'PULL'])

/** The longest common subsequence of two key lists, as index pairs. */
function align(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) out.push([i++, j++])
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  return out
}

/** Votes: for each key in the story, how often each reference key was seen opposite it. */
class Votes {
  private m = new Map<number, Map<number, number>>()
  add(story: number, ref: number) {
    const v = this.m.get(story) ?? new Map<number, number>()
    v.set(ref, (v.get(ref) ?? 0) + 1)
    this.m.set(story, v)
  }
  /** Each story key's most-voted reference key, each reference key given to one story key at most. */
  winners(): Map<number, number> {
    const all: [number, number, number][] = []
    for (const [s, v] of this.m) for (const [r, n] of v) all.push([s, r, n])
    all.sort((x, y) => y[2] - x[2])
    const out = new Map<number, number>()
    const taken = new Set<number>()
    for (const [s, r] of all) if (!out.has(s) && !taken.has(r)) (out.set(s, r), taken.add(r))
    return out
  }
}

/** Inform's identifiers: letters, digits and underscores, starting with a letter or underscore. */
function identifier(text: string, fallback: string): string {
  const s = text.normalize('NFKD').replace(/[^\w ]+/g, '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 28)
  if (!s) return fallback
  return /^[a-z_]/.test(s) ? s : `_${s}`
}

export function inferSymbols(story: StoryFile, ref: Reference): Symbols {
  const rs = ref.symbols
  const v = story.header.version
  const scale = v <= 3 ? 2 : v <= 5 ? 4 : 8
  const problems: string[] = []

  // ── 1. Routines, lined up ─────────────────────────────────────────
  const S = story.code.routines
  // The reference's own game (its Initialise, its room) has nothing to match.
  const R = ref.story.code.routines.filter(r => rs.routines[r.address]?.location?.file !== 0)
  const pairs = align(S.map(key), R.map(key))
  const refRoutineByPacked = new Map(ref.story.code.routines.map(r => [r.address / scale, r]))
  const storyRoutineByPacked = new Map(S.map(r => [r.address / scale, r]))

  // ── 2. Operands, side by side ─────────────────────────────────────
  const routineVotes = new Votes()
  const globalVotes = new Votes()
  const arrayVotes = new Votes()
  const stringVotes = new Votes()
  const objectVotes = new Votes()
  const refArrays = new Map(rs.arrays.map(a => [a.address, a]))
  const refStrings = new Map(ref.story.strings.map(s => [s.address / scale, s]))
  const storyStrings = new Map(story.strings.map(s => [s.address / scale, s]))
  const OBJECT_OPS = new Set(['JIN', 'GET_PARENT', 'GET_CHILD', 'GET_SIBLING', 'INSERT_OBJ', 'REMOVE_OBJ', 'PRINT_OBJ', 'TEST_ATTR', 'SET_ATTR', 'CLEAR_ATTR', 'GET_PROP', 'PUT_PROP', 'GET_PROP_ADDR', 'GET_NEXT_PROP'])
  for (const [i, j] of pairs) {
    routineVotes.add(S[i]!.address, R[j]!.address)
    const a = S[i]!.instructions
    const b = R[j]!.instructions
    for (let k = 0; k < a.length && k < b.length; k++) {
      const x = a[k]!
      const y = b[k]!
      x.operands.forEach((ox, n) => {
        const oy = y.operands[n]
        if (!oy || ox.kind !== oy.kind) return
        if (ox.kind === 'variable' || (n === 0 && VARIABLE_REFERENCE.has(x.name))) {
          if (ox.value >= 16 && oy.value >= 16) globalVotes.add(ox.value - 16, oy.value - 16)
          return
        }
        if (x.info.call && n === 0) {
          const rr = refRoutineByPacked.get(oy.value)
          const sr = storyRoutineByPacked.get(ox.value)
          if (rr && sr) routineVotes.add(sr.address, rr.address)
          return
        }
        if (OBJECT_OPS.has(x.name) && n === 0 && oy.value > 0 && oy.value <= ref.story.objects.objects.length) {
          objectVotes.add(ox.value, oy.value)
          return
        }
        if (oy.kind !== 'large') return
        if (refArrays.has(oy.value)) arrayVotes.add(ox.value, oy.value)
        else if (refStrings.has(oy.value) && storyStrings.has(ox.value)) stringVotes.add(ox.value, oy.value)
        else if (refRoutineByPacked.has(oy.value) && storyRoutineByPacked.has(ox.value)) routineVotes.add(storyRoutineByPacked.get(ox.value)!.address, refRoutineByPacked.get(oy.value)!.address)
        else if (oy.value > 0 && oy.value <= ref.story.objects.objects.length && ox.value <= story.objects.objects.length) objectVotes.add(ox.value, oy.value)
      })
      if (x.store !== undefined && y.store !== undefined && x.store >= 16 && y.store >= 16) globalVotes.add(x.store - 16, y.store - 16)
    }
  }
  const routineOf = routineVotes.winners()
  const globalOf = globalVotes.winners()
  const arrayOf = arrayVotes.winners()
  const stringOf = stringVotes.winners()
  const objectOf = objectVotes.winners()

  // ── The symbols ──────────────────────────────────────────────────
  // The reference's sources are the library's; the story's own file is 0, as in a debug file.
  const out: Symbols = {
    creator: 'Inform',
    ...(story.fingerprint?.compilerVersion ? { creatorVersion: story.fingerprint.compilerVersion } : {}),
    sources: rs.sources.slice(),
    routines: {}, objects: {}, globals: {}, properties: {}, attributes: {}, actions: {}, classes: {}, arrays: [], constants: {}, declarations: [], problems, inferred: true,
  }
  const refDecl = new Map<string, SymbolDeclaration>()
  for (const d of rs.declarations) refDecl.set(`${d.kind}:${d.value}`, d)
  const libraryLocation = (kind: SymbolDeclaration['kind'], refValue: number): SourceLocation | undefined => {
    const d = refDecl.get(`${kind}:${refValue}`)
    return d && d.location.file !== 0 ? d.location : undefined
  }
  /** The game's declarations, in the order the compiler met them: `order` is a key into that. */
  const gameDecl = (kind: SymbolDeclaration['kind'], name: string, value: number, order: number) =>
    out.declarations.push({ kind, name, value, location: { file: 0, line: 0, character: 0, position: order } })

  // Routines. A reference routine without a location is the veneer's.
  const named = new Set<string>()
  for (const [s, r] of routineOf) {
    const rr = rs.routines[r]
    if (!rr) continue
    // The reference's own game routines (its Initialise) are entry points: the story's is the game's.
    // So is a routine named by the library's calls to it that isn't the library's (another shape):
    // the game's own entry point (the library only stubs it) or its replacement of a library routine.
    const storyRoutine = S.find(x => x.address === s)
    const refRoutine = ref.story.code.routines.find(x => x.address === r)
    const differs = !!storyRoutine && !!refRoutine && key(storyRoutine) !== key(refRoutine)
    if (rr.location?.file === 0 || (differs && rr.location && !rr.artificial)) {
      out.routines[s] = { name: rr.name, artificial: false, address: s, locals: [] }
      named.add(rr.name)
      gameDecl('routine', rr.name, s, s)
      continue
    }
    out.routines[s] = { name: rr.name, artificial: rr.artificial, address: s, locals: rr.locals.slice(), ...(rr.location ? { location: rr.location } : {}) }
    named.add(rr.name)
    if (rr.location && rr.location.file !== 0 && !rr.artificial) out.declarations.push({ kind: 'routine', name: rr.name, value: s, location: rr.location })
  }
  // The compiler's own: Main__ first (as the fingerprint knows), Symb__Tab last.
  for (const [a, name] of Object.entries(story.fingerprint?.veneer ?? {})) if (!out.routines[Number(a)]) out.routines[Number(a)] = { name, artificial: false, address: Number(a), locals: [] }
  const last = S.at(-1)
  if (last && !out.routines[last.address] && last.locals === 2 && last.instructions.length === 1 && last.instructions[0]!.name === 'RFALSE') out.routines[last.address] = { name: 'Symb__Tab', artificial: false, address: last.address, locals: [] }

  // Globals: the library's by the votes, the rest the game's.
  const refGlobalName = (n: number) => rs.globals[n]
  for (const [s, r] of globalOf) {
    const name = refGlobalName(r)
    if (!name) continue
    out.globals[s] = name
    const loc = libraryLocation('global', r)
    if (loc) out.declarations.push({ kind: 'global', name, value: s, location: loc })
  }
  // Every global the game has (it uses up to the last nonzero or referenced one), beyond the library's.
  const used = new Set<number>()
  for (const r of S) for (const i of r.instructions) {
    i.operands.forEach((o, n) => {
      if ((o.kind === 'variable' || (n === 0 && VARIABLE_REFERENCE.has(i.name))) && o.value >= 16) used.add(o.value - 16)
    })
    if (i.store !== undefined && i.store >= 16) used.add(i.store - 16)
  }
  for (const n of [...used].sort((a, b) => a - b)) {
    if (out.globals[n]) continue
    out.globals[n] = `g${n}`
    gameDecl('global', `g${n}`, n, -1000 + n)
  }

  // Arrays: the library's by the votes (with the reference's sizes); the gaps between them in the
  // array space are the game's, split where the game's code points into them.
  const globalsEnd = story.header.globals + 480
  const arraysEnd = story.grammar?.address ?? story.header.staticMemory
  // A library array is the game's when its room in the story isn't the library's size: the library
  // defines some (task_scores) only when the game hasn't, so the game's has the library's name.
  const starts = [...arrayOf.keys(), arraysEnd].sort((x, y) => x - y)
  const gameNamed: { name: string; address: number; byteCount: number }[] = []
  for (const [s, r] of arrayOf) {
    const a = refArrays.get(r)!
    const room = starts.find(x => x > s)! - s
    if (room < a.byteCount || (room > a.byteCount && starts.indexOf(s) === 0 && s === globalsEnd)) {
      gameNamed.push({ name: a.name, address: s, byteCount: a.byteCount })
      continue
    }
    out.arrays.push({ ...a, address: s })
    const loc = libraryLocation('array', r)
    if (loc) out.declarations.push({ kind: 'array', name: a.name, value: s, location: loc })
  }
  const libraryArrays = out.arrays.slice().sort((a, b) => a.address - b.address)
  const pointedAt = new Set<number>(gameNamed.map(g => g.address))
  const wordAccess = new Set<number>()
  for (const r of S) {
    if (out.routines[r.address]?.location) continue // the library's own
    for (const i of r.instructions) i.operands.forEach((o, n) => {
      if (o.kind !== 'large' || o.value < globalsEnd || o.value >= arraysEnd) return
      pointedAt.add(o.value)
      // Read as words: loadw/storew, or strict mode's checked forms, RT__ChLDW(array, i) and RT__ChSTW.
      const callee = i.info.call && n === 1 ? out.routines[storyRoutineByPacked.get(i.operands[0]!.value)?.address ?? -1]?.name : undefined
      if (i.name === 'LOADW' || i.name === 'STOREW' || callee === 'RT__ChLDW' || callee === 'RT__ChSTW') wordAccess.add(o.value)
    })
  }
  let at = globalsEnd
  const gaps: [number, number][] = []
  for (const a of [...libraryArrays, { address: arraysEnd, byteCount: 0 }]) {
    if (a.address > at) gaps.push([at, a.address])
    at = Math.max(at, a.address + a.byteCount)
  }
  // A single byte left just before the grammar table is Inform's padding (it starts on an even address).
  if (gaps.length && gaps.at(-1)![1] === arraysEnd && gaps.at(-1)![1] - gaps.at(-1)![0] === 1) gaps.pop()
  for (const [start, end] of gaps) {
    const cuts = [start, ...[...pointedAt].filter(p => p > start && p < end).sort((x, y) => x - y), end]
    for (let k = 0; k + 1 < cuts.length; k++) {
      const s = cuts[k]!
      let e = cuts[k + 1]!
      // Words when the code reads it as words, or when every entry is a dictionary word, a string or a
      // routine; an odd byte left at the end of the array space is Inform's padding before the grammar.
      const ws = Array.from({ length: (e - s) >> 1 }, (_, q) => (story.bytes[s + 2 * q]! << 8) | story.bytes[s + 2 * q + 1]!)
      const set = ws.filter(w => w)
      const oneKind = set.length > 0 && (set.every(w => story.dictionary.entries.some(d => d.address === w)) || set.every(w => storyStrings.has(w)) || set.every(w => storyRoutineByPacked.has(w)))
      if ((wordAccess.has(s) || oneKind) && (e - s) % 2 === 1 && e === arraysEnd) e--
      const words = (wordAccess.has(s) || oneKind) && (e - s) % 2 === 0
      const name = gameNamed.find(g => g.address === s)?.name ?? `array_${s.toString(16)}`
      out.arrays.push({ name, address: s, byteCount: e - s, bytesPerElement: words ? 2 : 1, lengthFirst: false })
      gameDecl('array', name, s, -500 + k + s / 65536)
    }
  }

  // Properties and attributes: the library's numbers are the reference's (the game's follow them).
  const refCommonMax = Math.max(0, ...Object.keys(rs.properties).map(Number).filter(n => n < 64))
  const refIndividualMax = Math.max(0, ...Object.keys(rs.properties).map(Number).filter(n => n >= 64))
  for (const [k, name] of Object.entries(rs.properties)) out.properties[Number(k)] = name
  for (const [k, name] of Object.entries(rs.attributes)) out.attributes[Number(k)] = name
  for (const d of rs.declarations) if ((d.kind === 'property' || d.kind === 'attribute') && d.location.file !== 0) out.declarations.push(d)
  const objects = story.objects.objects
  const propsSeen = new Set<number>()
  const attrsSeen = new Set<number>()
  for (const o of objects) {
    for (const p of o.properties) propsSeen.add(p.number)
    for (const a of o.attributes) attrsSeen.add(a)
  }
  for (const n of [...propsSeen].sort((a, b) => a - b)) {
    if (out.properties[n] || n <= 3) continue
    out.properties[n] = `prop_${n}`
    if (n > refCommonMax) gameDecl('property', `prop_${n}`, n, -1500 + n)
  }
  for (const n of [...attrsSeen].sort((a, b) => a - b)) {
    if (out.attributes[n]) continue
    out.attributes[n] = `attr_${n}`
    gameDecl('attribute', `attr_${n}`, n, -2000 + n)
  }
  void refIndividualMax

  // Objects: the metaclasses and the library's by the votes, or failing those by number (the
  // library's objects come first, in the same order); classes are the children of Class (object 1).
  const refObjects = ref.story.objects.objects
  const libraryObjectCount = refObjects.filter(o => (rs.declarations.find(d => (d.kind === 'object' || d.kind === 'class') && d.value === o.number)?.location.file ?? 1) !== 0).length
  for (let n = 1; n <= libraryObjectCount && n <= objects.length; n++) {
    const name = rs.objects[n] ?? rs.classes[n]
    if (!name) continue
    if (rs.classes[n] !== undefined) out.classes[n] = rs.classes[n]!
    else out.objects[n] = name
    const loc = libraryLocation(rs.classes[n] !== undefined ? 'class' : 'object', n)
    if (loc) out.declarations.push({ kind: rs.classes[n] !== undefined ? 'class' : 'object', name, value: n, location: loc })
  }
  void objectOf
  // Made-up names steer clear of every name the library has (an object called "banner" would be
  // the library's routine Banner: Inform's names don't care about case).
  const taken = new Set(
    [
      ...Object.values(out.objects), ...Object.values(out.classes), ...named, ...Object.values(out.globals),
      // (not the reference's own game: its room and its Initialise)
      ...Object.values(rs.routines).filter(r => r.location?.file !== 0).map(r => r.name),
      ...Object.entries(rs.objects).filter(([n]) => Number(n) <= libraryObjectCount).map(([, o]) => o), ...Object.values(rs.classes), ...Object.values(rs.globals),
      ...Object.values(rs.properties), ...Object.values(rs.attributes), ...rs.arrays.map(a => a.name), ...Object.keys(rs.constants),
      ...Object.values(rs.actions).flatMap(a => [a, `${a}Sub`]),
    ].map(n => n.toLowerCase()),
  )
  const unique = (base: string) => {
    let name = base
    for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${base}_${k}`
    taken.add(name.toLowerCase())
    return name
  }
  for (let n = libraryObjectCount + 1; n <= objects.length; n++) {
    const o = objects[n - 1]!
    const isClass = o.parent === 1
    // A class object's short name is the class's name; an object Inform gave none is "(its_name)".
    const text = o.shortName.text.replace(/^\((.*)\)$/, '$1')
    const name = unique(/^[A-Za-z_]\w*$/.test(text) ? text : isClass ? `Class_${n}` : identifier(text, `obj_${n}`))
    if (isClass) out.classes[n] = name
    else out.objects[n] = name
    gameDecl(isClass ? 'class' : 'object', name, n, n)
  }

  // Embedded routines: a routine a game object's property holds that has no other name. A class's
  // first (its prototype's, `Room::before`), then each object's own (`lamp.before`).
  const individualNames = (o: (typeof objects)[number]) => individualProperties(story, o)
  const embed = (o: (typeof objects)[number], props: { number: number; data: number[] }[], sep: string) => {
    const owner = out.objects[o.number] ?? out.classes[o.number]
    if (!owner) return
    for (const p of props) {
      for (let k = 0; k + 1 < p.data.length; k += 2) {
        const r = storyRoutineByPacked.get((p.data[k]! << 8) | p.data[k + 1]!)
        if (!r || out.routines[r.address]) continue
        out.routines[r.address] = { name: `${owner}${sep}${out.properties[p.number] ?? `prop_${p.number}`}`, artificial: true, address: r.address, locals: [] }
      }
    }
  }
  for (const o of objects) if (out.classes[o.number] && o.number > 4) embed(o, classPrototype(story, o).properties, '::')
  for (const o of objects) embed(o, [...o.properties.filter(p => p.number !== 2 && p.number !== 3), ...individualNames(o)], '.')

  // Actions: the library's by their routines; the game's named from the first verb that uses them.
  const refActionOfRoutine = new Map<number, number>()
  ;(ref.story.grammar?.actions ?? []).forEach((a, n) => refActionOfRoutine.set(a, n))
  const actionNames = new Set<string>()
  for (const [n, a] of (story.grammar?.actions ?? []).entries()) {
    const libRoutine = routineOf.get(a)
    const refN = libRoutine !== undefined ? refActionOfRoutine.get(libRoutine) : undefined
    if (refN !== undefined && rs.actions[refN]) {
      out.actions[n] = rs.actions[refN]!
      actionNames.add(rs.actions[refN]!)
      continue
    }
    const verb = story.grammar?.verbs.find(vb => vb.lines.some(l => l.action === n))?.words[0]
    let name = verb ? identifier(verb, `Action${n}`).replace(/^_/, 'A').replace(/^./, c => c.toUpperCase()) : `Action${n}`
    for (let k = 2; actionNames.has(name) || taken.has(`${name}Sub`.toLowerCase()); k++) name = `${name.replace(/\d+$/, '')}${k}`
    actionNames.add(name)
    out.actions[n] = name
    if (!out.routines[a]) {
      const r = S.find(x => x.address === a)
      if (r) out.routines[a] = { name: `${name}Sub`, artificial: false, address: a, locals: [] }
    }
  }
  for (const [k, name] of Object.entries(rs.actions)) if (Number(k) >= 4096 && !Object.values(out.actions).includes(name)) out.actions[Number(k)] = name

  // The rest of the game's routines: named for their address, in code order.
  for (const r of S) {
    const s = out.routines[r.address]
    if (s && (s.location || s.artificial || !s.name.endsWith('Sub'))) {
      if (!s.location && !s.artificial && (named.has(s.name) || s.name.endsWith('Sub')) && !rs.routines[routineOf.get(r.address) ?? -1]?.location) {
        // a veneer routine, or the compiler's: no declaration
      }
      continue
    }
    const name = s?.name ?? `r_${r.address.toString(16)}`
    out.routines[r.address] = { name, artificial: false, address: r.address, locals: [] }
    gameDecl('routine', name, r.address, r.address)
  }
  // The game's routines and objects in the order the compiler met them. It lays out strings and code
  // in that order, so an item goes after any other whose first string, or first code, is earlier.
  const stringsInRoutine = (r: Routine) => {
    let first = Infinity
    for (const i of r.instructions) for (const o of i.operands) if (o.kind === 'large' && storyStrings.has(o.value)) first = Math.min(first, o.value)
    return first
  }
  const firstOf = (d: SymbolDeclaration): { string: number; code: number } => {
    if (d.kind === 'routine') {
      const r = S.find(x => x.address === d.value)!
      return { string: stringsInRoutine(r), code: r.address }
    }
    const o = objects[d.value - 1]!
    let string = Infinity
    let code = Infinity
    const own = [...o.properties.filter(p => p.number !== 2 && p.number !== 3), ...individualNames(o), ...(out.classes[o.number] ? classPrototype(story, o).properties : [])]
    // An instance's copies of what its classes give it were compiled with the class, not with it.
    const inherited = new Set<number>()
    const classList = o.properties.find(p => p.number === 2)?.data ?? []
    for (let k = 0; k + 1 < classList.length; k += 2) {
      const c = objects[((classList[k]! << 8) | classList[k + 1]!) - 1]
      if (!c) continue
      for (const p of [...classPrototype(story, c).properties, ...individualNames(c)]) for (let q = 0; q + 1 < p.data.length; q += 2) inherited.add((p.data[q]! << 8) | p.data[q + 1]!)
    }
    for (const p of own) {
      for (let k = 0; k + 1 < p.data.length; k += 2) {
        const w = (p.data[k]! << 8) | p.data[k + 1]!
        if (inherited.has(w) && !out.classes[o.number]) continue
        if (storyStrings.has(w)) string = Math.min(string, w)
        const r = storyRoutineByPacked.get(w)
        const owner = out.objects[o.number] ?? out.classes[o.number]
        const rn = r && out.routines[r.address]
        if (r && rn && rn.artificial && (rn.name.startsWith(`${owner}.`) || rn.name.startsWith(`${owner}::`))) {
          code = Math.min(code, r.address)
          string = Math.min(string, stringsInRoutine(r))
        }
      }
    }
    return { string, code }
  }
  const placed = out.declarations.filter(d => d.location.file === 0 && (d.kind === 'routine' || d.kind === 'object' || d.kind === 'class'))
  const keys = placed.map(firstOf)
  const before = (q: number, p: number) =>
    (keys[q]!.string < Infinity && keys[p]!.string < Infinity && keys[q]!.string < keys[p]!.string) ||
    (keys[q]!.code < Infinity && keys[p]!.code < Infinity && keys[q]!.code < keys[p]!.code)
  // Objects keep their numbered order, which is their declared order.
  const objectBefore = (q: number, p: number) => placed[q]!.kind !== 'routine' && placed[p]!.kind !== 'routine' && placed[q]!.value < placed[p]!.value
  const left = placed.map((_, i) => i)
  for (let rank = 0; left.length; rank++) {
    const waiting = (p: number) => left.filter(q => q !== p && (before(q, p) || objectBefore(q, p))).length
    let k = left.findIndex(p => waiting(p) === 0)
    // A cycle (the evidence disagrees): the one with least waiting on it goes next.
    if (k < 0) k = left.reduce((b, p, i) => (waiting(p) < waiting(left[b]!) ? i : b), 0)
    const [i] = left.splice(k, 1)
    placed[i!]!.location.position = rank
  }

  // Constants the library reads that the game gave: Story and Headline, from the strings the
  // reference's library prints for them.
  for (const c of ['Story', 'Headline']) {
    const refValue = rs.constants[c]
    if (refValue === undefined) continue
    for (const [s, r] of stringOf) if (r === refValue) {
      out.constants[c] = s
      gameDecl('constant', c, s, -3000 + (c === 'Story' ? 0 : 1))
    }
  }
  // The library's settings the game made, as findReference found them.
  for (const c of ref.constants ?? []) {
    out.constants[c.name] = c.value ?? 0
    gameDecl('constant', c.name, c.value ?? 0, -2950)
  }
  // Others are a library global's starting value (PunyInform's INITIAL_LOCATION_VALUE is location's).
  const skeletonConstants = rs.declarations.filter(d => d.kind === 'constant' && d.location.file === 0 && !['Story', 'Headline'].includes(d.name))
  for (const c of skeletonConstants) {
    for (const [s, r] of globalOf) {
      if (ref.story.globals[r]?.value !== c.value) continue
      out.constants[c.name] = story.globals[s]!.value
      gameDecl('constant', c.name, story.globals[s]!.value, -2900)
      break
    }
  }
  return out
}
