/**
 * Phase 6a: an Inform-compiled story back to Inform 6 source (docs/09-decompiler.md). The library is
 * left out as `Include`s; the game's own constants, globals, arrays, attributes, properties, classes
 * and objects are declared as Inform declares them; and its routines are Inform assembly, which
 * compiles to the same instructions. Later steps turn the assembly into statements (6b, 6c) and
 * the veneer's calls back into the syntax that made them (6d).
 *
 * It works from the story's debug file (gameinfo.dbg), which says which source file each routine,
 * object and variable came from, and so where the library's Includes went; or, without one, from
 * the same worked out by inferSymbols (infer.ts).
 */
import { packedScale } from '../address.js'
import type { Symbols, SymbolDeclaration } from '../debug.js'
import type { DictEntry, Property, StoryFile, Version, ZObject } from '../types.js'
import type { Routine } from '../routines.js'
import { routineBody, type AsmNames } from './asm.js'
import { routineStatements } from './statements.js'
import { informLine, type GrammarNames } from './grammar.js'
import { LIBRARIES, type LibraryVerb } from './library.generated.js'
import { classPrototype as prototypeOf, individualProperties } from './objects.js'
import { informString, informWord } from './text.js'

export interface DecompileOptions {
  /** The story's gameinfo.dbg, read with readSymbols; or, without one, inferSymbols's. */
  symbols: Symbols
  /**
   * Phase 6b: write the game's routines as statements where they can be, not as assembly: for all
   * (true), or those this says yes to (by the routine's address). decompileChecked turns it off for
   * any routine whose statements don't compile back to the same instructions.
   */
  statements?: boolean | ((address: number) => boolean)
}

export interface Decompiled {
  /** One .inf. */
  source: string
  /** For each line of the source (0-based), the address of the routine it's part of, if it is. */
  lineRoutines: (number | undefined)[]
  /** The routines written as statements (6b), by address. */
  statementRoutines: number[]
  /** What couldn't be written as it was, or had to be guessed. */
  problems: string[]
}

/** The library files each library includes from inside itself: they go in with their parent. */
const NESTED: Record<string, string> = {
  version: 'parser', infglk: 'parser', linklpa: 'parser', english: 'parser', infix: 'grammar',
  'messages.h': 'puny.h', 'grammar.h': 'puny.h', 'scope.h': 'puny.h', 'parser.h': 'puny.h',
}
/** The files of each library (and the extensions inform6-wasm has), as Include names them: only these become Includes. */
const LIBRARY_FILES = {
  std: new Set(['parser', 'verblib', 'grammar', 'version', 'infglk', 'linklpa', 'english', 'infix', 'exits']),
  puny: new Set(['globals.h', 'puny.h', 'messages.h', 'grammar.h', 'scope.h', 'parser.h', 'ext_cheap_scenery.h', 'ext_flags.h', 'ext_menu.h', 'ext_quote_box.h', 'ext_talk_menu.h', 'ext_waittime.h']),
}
/** Routines the compiler always writes itself. */
const COMPILER_ROUTINES = new Set(['Main__', 'Symb__Tab'])
/** The library's globals that hold an action: what an object's before routine switches on, and the action. */
const ACTION_VARIABLES = new Set(['action', 'sw__var'])
/** Inform's own objects: the metaclasses. */
const METACLASSES = 4

type Kind = SymbolDeclaration['kind']
/** What the order of each kind of declaration is kept by: its address or number. */
const ORDERED: Partial<Record<Kind, string>> = { routine: 'routine', object: 'object', class: 'object', global: 'global', array: 'array', property: 'property', attribute: 'attribute' }

interface Item { decl: SymbolDeclaration; text: string[] }

export function decompileInform(story: StoryFile, opts: DecompileOptions): Decompiled {
  const sym = opts.symbols
  const v = story.header.version as Version
  const bytes = story.bytes
  const problems: string[] = []
  const statementRoutines: number[] = []
  const word = (a: number) => ((bytes[a]! << 8) | bytes[a + 1]!)
  const scale = packedScale(v)
  const routineOffset = story.header.routinesOffset ?? 0
  const stringOffset = story.header.stringsOffset ?? 0
  const MAIN_FILE = 0

  // ── What each address and number is ─────────────────────────────
  const routinesByPacked = new Map<number, Routine>()
  for (const r of story.code.routines) routinesByPacked.set((r.address - routineOffset * 8) / scale, r)
  const stringsByPacked = new Map<number, string>()
  for (const s of story.strings) stringsByPacked.set((s.address - stringOffset * 8) / scale, s.text)
  const stringsStart = story.strings[0] ? (story.strings[0].address - stringOffset * 8) / scale : -1
  const dict = new Map<number, DictEntry>(story.dictionary.entries.map(e => [e.address, e]))
  const arrays = new Map(sym.arrays.map(a => [a.address, a]))
  const objectCount = story.objects.objects.length
  /** The game's objects, and those written out so far. */
  let gameObjects = new Set<number>() // filled once it's known which files are the library's
  const declaredObjects = new Set<number>()

  const routineName = (address: number): string | undefined => {
    const s = sym.routines[address]
    // The compiler's own (Main__, Symb__Tab) can't be named in source: Main__ there is 0.
    if (!s || s.artificial || COMPILER_ROUTINES.has(s.name)) return undefined
    return s.name
  }
  const objectName = (n: number): string => sym.objects[n] ?? sym.classes[n] ?? `obj_${n}`
  const globalName = (n: number): string => sym.globals[n] ?? `g${n}`
  const propertyName = (n: number): string => sym.properties[n] ?? `prop_${n}`
  const attributeName = (n: number): string => sym.attributes[n] ?? `attr_${n}`

  /** Two-byte constants under 256: Inform writes those in two bytes only for a value it learns later. */
  const forcedLarge = new Set<number>()
  const number = (n: number, large: boolean): string => {
    if (large && n < 256) {
      forcedLarge.add(n)
      return `LARGE_${n}`
    }
    return n >= 0x8000 ? '$' + n.toString(16).toUpperCase() : String(n)
  }
  /**
   * A word whose meaning isn't known from where it is: a routine, string, dictionary word or array
   * when it's the address of one. A number can be more than one of those (a word's address can be a
   * routine's packed address too), so where it is decides which comes first:
   *   code: a dictionary word (compared with, passed), then a string, a routine;
   *   a property: a routine (embedded or named), a string, a word;
   *   an array or a global: a string, a routine, a word;
   *   the veneer: only the strings it passes to RT__Err (its messages); its other numbers are masks
   *   and table addresses.
   */
  type Where = 'code' | 'property' | 'data' | 'veneer' | 'veneer-number'
  const ORDER: Record<Where, ('routine' | 'string' | 'word' | 'array')[]> = {
    code: ['word', 'string', 'routine', 'array'],
    property: ['routine', 'string', 'word', 'array'],
    data: ['string', 'routine', 'word', 'array'],
    veneer: ['string'],
    'veneer-number': [],
  }
  const value = (n: number, large = true, where: Where = 'data'): string => {
    if (large && n >= 256) {
      for (const kind of ORDER[where]) {
        if (kind === 'routine') {
          const r = routinesByPacked.get(n)
          const name = r && routineName(r.address)
          if (name) return name
        } else if (kind === 'string') {
          const s = stringsByPacked.get(n)
          if (s !== undefined && !(where === 'veneer' && n === stringsStart)) return informString(s)
        } else if (kind === 'word') {
          const d = dict.get(n)
          if (d) return informWord(d.word)
        } else {
          const a = arrays.get(n)
          if (a) return a.name
        }
      }
    }
    // A small number in two bytes is often one of the game's objects named before it's declared,
    // which is why the compiler didn't know it yet: written as that name, it compiles the same.
    if (large && where === 'code' && n > METACLASSES && n <= objectCount && gameObjects.has(n) && !declaredObjects.has(n)) return objectName(n)
    // Data is always words; only an instruction's operand has a short form to avoid.
    return number(n, large && where !== 'property' && where !== 'data')
  }

  const libraryId = story.fingerprint?.library?.name === 'PunyInform' ? 'puny' : story.fingerprint?.library ? 'std' : undefined
  const lib = libraryId ? LIBRARIES[libraryId] : undefined

  // The game's individual properties (v4+), declared in number order before the first object that
  // has one: the compiler numbers them as it meets them, and the output doesn't meet them in the
  // original's order (it writes each object's properties in its own order, and its code's uses of
  // them as numbers).
  // The compiler's own (create, copy, …) are there before any source is read.
  const libraryIndividuals = new Set([...(lib?.individuals ?? []), 'create', 'recreate', 'destroy', 'remaining', 'copy', 'call', 'print', 'print_to_array'])
  const gameIndividuals = Object.entries(sym.properties)
    .map(([k, name]) => [Number(k), name] as const)
    .filter(([k, name]) => k >= 64 && v >= 4 && !libraryIndividuals.has(name))
    .sort((a, b) => a[0] - b[0])
  let individualsDeclared = 0
  const declareIndividualsUpTo = (n: number): string[] => {
    const out: string[] = []
    while (individualsDeclared < gameIndividuals.length && gameIndividuals[individualsDeclared]![0] <= n) out.push(`Property individual ${gameIndividuals[individualsDeclared++]![1]};`)
    return out
  }

  // ── Routines ────────────────────────────────────────────────────
  /**
   * `veneer`: the strings area's start stays a number there (Z__Region compares addresses with it,
   * and it is also the first string's address).
   */
  const routineText = (r: Routine, header: string, close: string, veneer = false): string[] => {
    const s = sym.routines[r.address]
    const locals = Array.from({ length: r.locals }, (_, k) => s?.locals[k] || `local${k + 1}`)
    if (r.initialValues.some(x => x)) problems.push(`${header.trim()} gives its locals starting values, which Inform can't write; they start at 0.`)
    const names: AsmNames = {
      version: v,
      variable: n => (n === 0 ? 'sp' : n < 16 ? locals[n - 1] ?? `local${n}` : globalName(n - 16)),
      routine: p => {
        const t = routinesByPacked.get(p)
        return t ? routineName(t.address) : undefined
      },
      string: p => {
        const t = stringsByPacked.get(p)
        return t === undefined ? undefined : informString(t)
      },
      // In the veneer, only its messages (passed to RT__Err) are strings; its other numbers are masks
      // and table addresses, which can be a string's address too.
      value: (n, large, callee) => {
        const toErr = callee !== undefined && sym.routines[routinesByPacked.get(callee)?.address ?? -1]?.name === 'RT__Err'
        return value(n, large, veneer ? (toErr ? 'veneer' : 'veneer-number') : 'code')
      },
      stringLiteral: informString,
      action: (variable, n) => {
        if (variable < 16 || !ACTION_VARIABLES.has(globalName(variable - 16))) return undefined
        const name = sym.actions[n]
        return name && n < 4096 ? `##${name}` : undefined
      },
      actionArgument: (packed, n) => {
        const t = routinesByPacked.get(packed)
        if (!t || sym.routines[t.address]?.name !== 'R_Process') return undefined
        const name = sym.actions[n]
        return name ? `##${name}` : undefined
      },
    }
    const head = `[${header ? ` ${header}` : ''}${locals.length ? ` ${locals.join(' ')}` : ''};`
    const asStatements = !veneer && (opts.statements === true || (typeof opts.statements === 'function' && opts.statements(r.address)))
    if (asStatements) statementRoutines.push(r.address)
    const body = asStatements
      ? routineStatements(r, {
          ...names,
          property: p => sym.properties[p],
          attribute: a => sym.attributes[a],
          object: o => sym.objects[o],
        })
      : routineBody(r, names)
    // Each line marked with its routine, for lineRoutines (taken out before the source is returned).
    const mark = `\u0001${r.address}\u0001`
    return [head, ...body, close].map(l => mark + l)
  }
  const routineAt = new Map(story.code.routines.map(r => [r.address, r]))

  // ── Objects ─────────────────────────────────────────────────────
  const objects = story.objects.objects
  const object = (n: number): ZObject | undefined => objects[n - 1]
  const classesOf = (o: ZObject): number[] => {
    const p = o.properties.find(p => p.number === 2)
    if (!p) return []
    const out: number[] = []
    for (let k = 0; k + 1 < p.data.length; k += 2) out.push((p.data[k]! << 8) | p.data[k + 1]!)
    return out
  }
  const individuals = (o: ZObject): Property[] => individualProperties(story, o)
  const OBJECT_VALUED = new Set(['n_to', 's_to', 'e_to', 'w_to', 'ne_to', 'nw_to', 'se_to', 'sw_to', 'u_to', 'd_to', 'in_to', 'out_to', 'door_to', 'with_key', 'found_in', 'add_to_scope', 'door_dir'])

  /** A property's values, as the source would give them. */
  const propertyValues = (owner: string, p: Property): string => {
    const name = propertyName(p.number)
    if (p.data.length % 2) {
      problems.push(`${owner}.${name} has an odd number of bytes (${p.data.length}); written as bytes.`)
      return p.data.map(String).join(' ')
    }
    const words: number[] = []
    for (let k = 0; k < p.data.length; k += 2) words.push((p.data[k]! << 8) | p.data[k + 1]!)
    if (p.number === 1) {
      return words.map(w => {
        const d = dict.get(w)
        return d ? informWord(d.word, d.inform?.plural) : number(w, false)
      }).join(' ')
    }
    return words.map(w => {
      const r = routinesByPacked.get(w)
      if (r && sym.routines[r.address]?.artificial) {
        const body = routineText(r, '', ']')
        return [body[0], ...body.slice(1, -1).map(l => `    ${l}`), `       ${body.at(-1)}`].join('\n')
      }
      if (OBJECT_VALUED.has(name) && w > METACLASSES && w <= objectCount && !routinesByPacked.has(w) && !stringsByPacked.has(w)) return objectName(w)
      return value(w, true, 'property')
    }).join(' ')
  }

  // What each class gives its instances. Inform copies a class's attributes and common properties
  // into every instance, and keeps them as a prototype right after the class object's own property
  // table: its attribute bytes, then a property list. Its individual properties are the class
  // object's own (property 3).
  const ADDITIVE = new Set(['name', 'before', 'after', 'life', 'orders', 'describe', 'time_out', 'each_turn'])
  const wordsOf = (data: number[]) => Array.from({ length: data.length >> 1 }, (_, k) => (data[2 * k]! << 8) | data[2 * k + 1]!)
  const classPrototype = new Map<number, { attributes: number[]; properties: Property[] }>()
  for (const c of Object.keys(sym.classes).map(Number)) {
    const o = object(c)
    if (o && c > METACLASSES) classPrototype.set(c, prototypeOf(story, o))
  }
  const classProvides = new Map<number, Map<number, number[]>>()
  for (const [c, proto] of classPrototype) classProvides.set(c, new Map(proto.properties.filter(p => p.size % 2 === 0).map(p => [p.number, wordsOf(p.data)])))

  /** The most recent object at each depth of `->`, for the arrows. */
  let recent: number[] = []
  const objectText = (n: number, isClass: boolean): string[] => {
    const o = object(n)!
    const name = objectName(n)
    const classes = classesOf(o)
    declaredObjects.add(n)
    // Each property with the first string it holds (its own, or one its embedded routine prints), so
    // they can be written in the order the compiler met them: strings are laid out in that order.
    const props: [string, string][] = []
    const firstString: (number | undefined)[] = []
    const firstRoutine: (number | undefined)[] = []
    const routineIn = (data: number[]): number | undefined => {
      const rs = wordsOf(data).filter(w => routinesByPacked.has(w) && sym.routines[routinesByPacked.get(w)!.address]?.artificial)
      return rs.length ? Math.min(...rs) : undefined
    }
    const stringIn = (data: number[]): number | undefined => {
      let first: number | undefined
      for (const w of wordsOf(data)) {
        let k: number | undefined
        if (stringsByPacked.has(w)) k = w
        const r = routinesByPacked.get(w)
        if (r && sym.routines[r.address]?.artificial) {
          for (const i of r.instructions) for (const op of i.operands) if (op.kind === 'large' && stringsByPacked.has(op.value) && (k === undefined || op.value < k)) k = op.value
        }
        if (k !== undefined && (first === undefined || k < first)) first = k
      }
      return first
    }
    const common = (isClass ? classPrototype.get(n)?.properties ?? [] : o.properties.filter(p => p.number !== 2 && p.number !== 3)).slice().reverse()
    for (const p of common) {
      let data = p.data
      if (!isClass && data.length % 2 === 0) {
        // Leave out what the classes give: an additive property's instance values come first.
        let ws = wordsOf(data)
        for (const c of [...classes].reverse()) {
          const given = classProvides.get(c)?.get(p.number)
          if (!given) continue
          if (ADDITIVE.has(propertyName(p.number)) ? ws.slice(ws.length - given.length).join() === given.join() : ws.join() === given.join()) ws = ws.slice(0, ws.length - given.length)
        }
        if (!ws.length) continue
        data = ws.flatMap(w => [w >> 8, w & 255])
      }
      props.push([propertyName(p.number), propertyValues(name, { ...p, data })])
      firstString.push(stringIn(data))
      firstRoutine.push(routineIn(data))
    }
    const classIndividuals = new Map(classes.flatMap(c => (object(c) ? individuals(object(c)!) : []).map(p => [p.number, p.data.join()] as const)))
    // Inherited individual properties are added after the instance's own, so one equal to the class's
    // is left out only when everything after it is too (written, it would keep its place).
    const ownIndividuals = individuals(o)
    const inheritedFrom = ownIndividuals.findIndex((_, k) => ownIndividuals.slice(k).every(p => classIndividuals.get(p.number) === p.data.join()))
    for (const [k, p] of ownIndividuals.entries()) {
      if (!isClass && inheritedFrom >= 0 && k >= inheritedFrom) continue
      props.push([propertyName(p.number), propertyValues(name, p)])
      firstString.push(stringIn(p.data))
      firstRoutine.push(routineIn(p.data))
    }
    // Written in the order the compiler met them: its strings and its embedded routines are laid out
    // in that order, so a property comes after any whose string or routine is earlier than its own.
    {
      const left = props.map((_, i) => i)
      const order: number[] = []
      const before = (q: number, p: number) =>
        (firstString[q] !== undefined && firstString[p] !== undefined && firstString[q]! < firstString[p]!) ||
        (firstRoutine[q] !== undefined && firstRoutine[p] !== undefined && firstRoutine[q]! < firstRoutine[p]!)
      while (left.length) {
        const k = left.findIndex(p => !left.some(q => q !== p && before(q, p)))
        order.push(...left.splice(k < 0 ? 0 : k, 1))
      }
      const sorted = order.map(i => props[i]!)
      props.splice(0, props.length, ...sorted)
    }

    let head: string
    if (isClass) {
      head = `Class ${name}`
      recent = []
    } else {
      const parent = o.parent
      let arrows = ''
      let parentName = ''
      const depth = parent ? recent.indexOf(parent) : -1
      if (parent && depth >= 0) {
        arrows = ' ' + '->'.repeat(depth + 1).replace(/(->)(?=->)/g, '$1 ')
        recent = [...recent.slice(0, depth + 1), n]
      } else {
        if (parent) parentName = ` ${objectName(parent)}`
        recent = [n]
      }
      const single = classes.length === 1 ? objectName(classes[0]!) : 'Object'
      head = `${single}${arrows} ${name} ${informString(o.shortName.text)}${parentName}`
      if (classes.length > 1) head += `\n  class ${classes.map(objectName).join(' ')}`
    }
    const usesIndividual = Math.max(-1, ...individuals(o).map(p => p.number))
    const declared = declareIndividualsUpTo(usesIndividual)
    const lines = [...declared, ...(declared.length ? [''] : []), head]
    const withs = props.filter(([k]) => k)
    withs.forEach(([k, val], i) => lines.push(`${i ? '       ' : '  with '}${k} ${val}${i < withs.length - 1 ? ',' : ''}`))
    // Attributes: a class's are its prototype's; an instance's, those its classes don't give it, and
    // `~` for any they give that it hasn't.
    const given = new Set(classes.flatMap(c => classPrototype.get(c)?.attributes ?? []))
    const attrs = isClass
      ? (classPrototype.get(n)?.attributes ?? []).map(attributeName)
      : [...o.attributes.filter(a => !given.has(a)).map(attributeName), ...[...given].filter(a => !o.attributes.includes(a)).map(a => `~${attributeName(a)}`)]
    if (attrs.length) lines.push(`  has  ${attrs.join(' ')}`)
    lines[lines.length - 1] += ';'
    return lines
  }

  // ── Which file each declaration came from, and where the Includes go ──
  const sources = sym.sources
  const top = (file: number): string => {
    const name = (sources[file] ?? '').toLowerCase()
    const parent = NESTED[name.replace(/^.*[\\/]/, '')]
    if (!parent) return sources[file] ?? `file ${file}`
    const p = sources.findIndex(s => s.toLowerCase() === parent)
    return p >= 0 ? (sources[p] ?? parent) : parent
  }
  // Only a library's own files become Includes; anything else the story included (the game's own
  // files, an extension this compiler doesn't have) is written out here, as the game's.
  const known = libraryId ? LIBRARY_FILES[libraryId] : new Set<string>()
  const isLibraryFile = (file: number) => file !== MAIN_FILE && known.has((sources[file] ?? '').toLowerCase().replace(/^.*[\\/]/, '').replace(/\.(h|inf)$/, libraryId === 'puny' ? '.h' : ''))
  for (const f of new Set(sym.declarations.map(d => d.location.file))) {
    if (f !== MAIN_FILE && !isLibraryFile(f)) problems.push(`"${sources[f] ?? `file ${f}`}" isn't a file of the library this compiler has, so what it declared is written out as the game's.`)
  }
  const decls = sym.declarations
  const game = decls.filter(d => !isLibraryFile(d.location.file))
  const library = decls.filter(d => isLibraryFile(d.location.file))
  gameObjects = new Set(game.filter(d => d.kind === 'object').map(d => d.value))
  /** Each top-level include, in the order the compiler read them, with its declarations' keys by kind. */
  const blocks: { name: string; first: number; min: Record<string, number> }[] = []
  for (const d of library) {
    const name = top(d.location.file)
    let b = blocks.find(x => x.name === name)
    if (!b) {
      const file = sources.findIndex(s => s === name)
      b = { name, first: file >= 0 ? file : d.location.file, min: {} }
      blocks.push(b)
    }
    const cat = ORDERED[d.kind]
    if (cat && (b.min[cat] === undefined || d.value < b.min[cat]!)) b.min[cat] = d.value
  }
  blocks.sort((a, b) => a.first - b.first)

  // The game's declarations in source order, each turned into text.
  // The main file's in its order; another of the game's files goes in, in its own order, just before
  // the first of the main file's that the compiler must have read after it (as an Include would).
  const byPosition = (a: SymbolDeclaration, b: SymbolDeclaration) => (a.location.position ?? a.location.line * 1000) - (b.location.position ?? b.location.line * 1000)
  const ordered = game.filter(d => d.location.file === MAIN_FILE).sort(byPosition)
  for (const f of [...new Set(game.map(d => d.location.file))].filter(f => f !== MAIN_FILE).sort((a, b) => a - b)) {
    const theirs = game.filter(d => d.location.file === f).sort(byPosition)
    const min: Record<string, number> = {}
    for (const d of theirs) {
      const cat = ORDERED[d.kind]
      if (cat && (min[cat] === undefined || d.value < min[cat]!)) min[cat] = d.value
    }
    const at = ordered.findIndex(d => d.location.file === MAIN_FILE && ORDERED[d.kind] !== undefined && min[ORDERED[d.kind]!] !== undefined && d.value > min[ORDERED[d.kind]!]!)
    ordered.splice(at < 0 ? ordered.length : at, 0, ...theirs)
  }
  const items: Item[] = []
  const declaredHere = new Set<string>()
  for (const d of ordered) {
    const key = `${d.kind}:${d.value}:${d.name}`
    if (declaredHere.has(key)) continue
    declaredHere.add(key)
    const text = declaration(d)
    if (text) items.push({ decl: d, text })
  }

  function declaration(d: SymbolDeclaration): string[] | undefined {
    switch (d.kind) {
      case 'constant': {
        if (/^(LIBRARY_|Grammar__Version$|STRICT_MODE$)/.test(d.name)) return undefined
        const s = d.value >= 256 ? stringsByPacked.get(d.value) : undefined
        if (s !== undefined) return [`Constant ${d.name} ${informString(s)};`]
        return [`Constant ${d.name} = ${number(d.value, false)};`]
      }
      case 'global': {
        const g = story.globals[d.value]
        return [`Global ${d.name}${g && g.value ? ` = ${value(g.value)}` : ''};`]
      }
      case 'array': {
        const a = arrays.get(d.value)
        if (!a) return undefined
        const data = Array.from(bytes.subarray(a.address, a.address + a.byteCount))
        // One number alone gives an array's size, so a single entry goes in brackets, and all-zero
        // arrays are written as their size.
        const entries = (kind: string, values: string[], zero: boolean) =>
          `Array ${a.name} ${kind} ${zero ? values.length : values.length === 1 ? `[ ${values[0]} ]` : values.join(' ')};`
        if (a.bytesPerElement === 2) {
          const ws = wordsOf(data)
          const items = a.lengthFirst ? ws.slice(1) : ws
          // An array is usually of one kind: when every entry can be a word (or every one a string,
          // or a routine), they all are, even those whose address is something else's too.
          const set = items.filter(w => w)
          const kind = !set.length ? undefined : set.every(w => dict.has(w)) ? 'word' : set.every(w => stringsByPacked.has(w)) ? 'string' : set.every(w => routinesByPacked.has(w) && routineName(routinesByPacked.get(w)!.address)) ? 'routine' : undefined
          const entry = (w: number) =>
            !w || !kind ? value(w) : kind === 'word' ? informWord(dict.get(w)!.word) : kind === 'string' ? informString(stringsByPacked.get(w)!) : routineName(routinesByPacked.get(w)!.address)!
          return [entries(a.lengthFirst ? 'table' : '-->', items.map(entry), items.every(w => w === 0))]
        }
        if (a.lengthFirst && data.length >= 2 && ((data[0]! << 8) | data[1]!) === data.length - 2 && data.slice(2).every(b => b === 0)) return [`Array ${a.name} buffer ${data.length - 2};`]
        const items = a.lengthFirst ? data.slice(1) : data
        return [entries(a.lengthFirst ? 'string' : '->', items.map(String), items.every(b => b === 0))]
      }
      case 'attribute':
        return [`Attribute ${d.name};`]
      case 'property': {
        if (d.value <= 3) return undefined
        if (d.value >= 64) return declareIndividualsUpTo(d.value)
        const def = story.objects.propertyDefaults[d.value - 1] ?? 0
        return [`Property ${d.name}${def ? ` ${value(def)}` : ''};`]
      }
      case 'fake-action':
        return [`Fake_Action ${d.name};`]
      case 'class':
        return objectText(d.value, true)
      case 'object':
        if (sym.classes[d.value] !== undefined) return undefined
        return object(d.value) ? objectText(d.value, false) : undefined
      case 'routine': {
        const r = routineAt.get(d.value)
        const s = sym.routines[d.value]
        if (!r || !s || s.artificial) return undefined
        return routineText(r, s.name, '];')
      }
      default:
        return undefined
    }
  }

  // Each Include goes as late as it can: just before the first of the game's declarations that the
  // compiler must have read after it (one numbered or placed after something the library declares).
  const follows = (it: Item, b: (typeof blocks)[number]): boolean => {
    const cat = ORDERED[it.decl.kind]
    return !!cat && b.min[cat] !== undefined && it.decl.value > b.min[cat]!
  }
  const at = blocks.map(b => {
    const i = items.findIndex(it => follows(it, b))
    return i < 0 ? items.length : i
  })
  for (let k = at.length - 2; k >= 0; k--) at[k] = Math.min(at[k]!, at[k + 1]!)

  // ── Grammar: only what the game added to the library's ───────────
  const grammarNames: GrammarNames = {
    routine: a => routineName(a),
    action: n => sym.actions[n] ?? `Action_${n}`,
    attribute: attributeName,
  }
  const sameWord = (storyWord: string, libWord: string) => storyWord === libWord || (libWord.startsWith(storyWord) && storyWord.length >= 6)
  const beforeGrammar: string[][] = []
  const afterGrammar: string[][] = []
  const libVerbNumbers: number[] = []
  const gameVerbs: { number: number; text: string[] }[] = []
  const linesText = (lines: string[]) => lines.map((l, i) => `    ${l}${i === lines.length - 1 ? ';' : ''}`)
  /** A directive and its lines; with none, the directive ends at once (a verb the game emptied). */
  const directive = (head: string, lines: string[]) => (lines.length ? [head, ...linesText(lines)] : [`${head};`])
  /** Lines that can't be written (a token the grammar reader can't name) are left out, and said. */
  const writable = (verb: string, lines: string[]) => {
    const bad = lines.filter(l => l === '?').length
    if (bad) problems.push(`${bad} grammar line${bad === 1 ? '' : 's'} of '${verb}' ha${bad === 1 ? 's' : 've'} a token that can't be written yet (PunyInform's compact grammar keeps routine tokens in a way not read yet); left out.`)
    return lines.filter(l => l !== '?')
  }
  const words = (ws: string[]) => ws.map(w => informWord(w)).join(' ')
  for (const verb of story.grammar?.verbs ?? []) {
    const lines = verb.lines.map(l => informLine(story, l, grammarNames) ?? '?')
    const match: LibraryVerb | undefined = lib?.verbs.find(lv => verb.words.some(w => lv.words.some(x => sameWord(w, x))))
    if (!match) {
      const meta = verb.words.some(w => story.dictionary.entries.find(e => e.word === w)?.inform?.meta)
      const ok = writable(verb.words[0] ?? '', lines)
      if (!ok.length) continue
      gameVerbs.push({ number: verb.number, text: directive(`Verb ${meta ? 'meta ' : ''}${words(verb.words)}`, ok) })
      continue
    }
    libVerbNumbers.push(verb.number)
    const anchor = verb.words.find(w => match.words.some(x => sameWord(w, x)))!
    const added = verb.words.filter(w => !match.words.some(x => sameWord(w, x)))
    const R = match.lines
    const same = lines.length === R.length && lines.every((l, i) => l === R[i])
    if (!same) {
      const startsWith = R.every((l, i) => lines[i] === l)
      const endsWith = R.every((l, i) => lines[lines.length - R.length + i] === l)
      if (startsWith && lines.length > R.length) afterGrammar.push(directive(`Extend ${informWord(anchor)}`, writable(anchor, lines.slice(R.length))))
      else if (endsWith && lines.length > R.length) afterGrammar.push(directive(`Extend ${informWord(anchor)} first`, writable(anchor, lines.slice(0, lines.length - R.length))))
      else afterGrammar.push(directive(`Extend ${informWord(anchor)} replace`, writable(anchor, lines)))
    }
    for (const w of added) afterGrammar.push([`Verb ${informWord(w)} = ${informWord(anchor)};`])
  }
  // A verb of the game's declared before the library's grammar is numbered before it (255 counts down).
  const firstLibVerb = Math.max(...libVerbNumbers, -1)
  for (const v of gameVerbs) (v.number > firstLibVerb && libVerbNumbers.length ? beforeGrammar : afterGrammar).push(v.text)
  const grammarBlock = blocks.findIndex(b => /^(grammar|puny\.h)$/i.test(b.name) || sources.some((src, f) => /^grammar(\.h)?$/i.test(src) && top(f) === b.name))

  // A library routine the game wrote its own of was Replaced.
  const replaced = lib ? items.filter(it => it.decl.kind === 'routine' && lib.routines.includes(it.decl.name)).map(it => it.decl.name) : []

  // ── Out ──────────────────────────────────────────────────────────
  const out: string[] = []
  const banner = (title: string) => out.push('', '! ' + '-'.repeat(75), `!  ${title}`, '! ' + '-'.repeat(75))
  const h = story.header
  out.push('! ' + '='.repeat(75))
  out.push('!  Decompiled by Frotzlens (Phase 6a). The library is left out as Includes;')
  out.push('!  the game\'s routines are Inform assembly, as the story holds them.')
  if (sym.inferred) {
    out.push('!  The story had no debug file: the library was found by compiling it alone,')
    out.push('!  and the game\'s names are made up from what the story says.')
  }
  out.push('!  A decompiled game is still its author\'s work.')
  out.push('! ' + '='.repeat(75))
  const switches: string[] = []
  // Strict mode (Inform's default) leaves its run-time checks in the story; without them, it was off.
  const strict = Object.values(sym.routines).some(r => r.name.startsWith('RT__Ch'))
  if (!strict) switches.push('!% -~S')
  if (story.fingerprint?.library?.name === 'PunyInform') switches.push('!% $OMIT_UNUSED_ROUTINES=1')
  // Economy mode (-e) fills the abbreviation table; each Abbreviate gives the next entry.
  // Without -e, Inform fills the table with a placeholder, three spaces. The library's own (PunyInform
  // declares some in globals.h) come with its Include; the game's are written here.
  const PLACEHOLDER = '   '
  const libraryAbbreviations = new Set((lib?.abbreviations ?? []).map(a => a.replace(/\^/g, '\n').replace(/~/g, '"')))
  const inTable = story.abbreviations.filter(ab => ab.text.length && ab.text !== PLACEHOLDER)
  // Their text is stored in the order they were declared (the table's own order is Inform's).
  const abbreviations = inTable.filter(ab => !libraryAbbreviations.has(ab.text)).sort((x, y) => x.address - y.address)
  const firstLibrary = Math.min(...inTable.filter(ab => libraryAbbreviations.has(ab.text)).map(ab => ab.address))
  if (abbreviations.some(ab => ab.address > firstLibrary)) problems.push('Some of the game\'s abbreviations were declared after the library\'s; here they come first, so the table is the same but laid out in another order.')
  if (inTable.length) switches.push('!% -e')
  out.unshift(...switches)
  banner('The story file')
  out.push(`Release ${h.release};`)
  if (/^\d{6}$/.test(h.serial)) out.push(`Serial "${h.serial}";`)
  if (abbreviations.length) {
    out.push('')
    for (const ab of abbreviations) out.push(`Abbreviate ${informString(ab.text)};`)
  }
  if (replaced.length) {
    out.push('')
    for (const r of replaced) out.push(`Replace ${r};`)
  }

  let bi = 0
  const emitBlocksUpTo = (i: number) => {
    while (bi < blocks.length && at[bi]! <= i) {
      if (bi === grammarBlock) for (const v of beforeGrammar) out.push('', ...v)
      out.push('', `Include "${blocks[bi]!.name}";`)
      bi++
    }
  }
  items.forEach((it, i) => {
    emitBlocksUpTo(i)
    out.push('', ...it.text)
  })
  emitBlocksUpTo(Infinity)
  const lateIndividuals = declareIndividualsUpTo(Infinity)
  if (lateIndividuals.length) out.push('', ...lateIndividuals)
  if (grammarBlock < 0) for (const v of beforeGrammar) out.push('', ...v)
  if (afterGrammar.length) {
    banner('The game\'s grammar')
    for (const v of afterGrammar) out.push('', ...v)
  }

  // The veneer: Inform's own routines, which it writes for itself; here because the assembly above
  // calls them by name. (6d turns those calls back into the syntax that made them.)
  const gameRoutines = new Set(items.filter(it => it.decl.kind === 'routine').map(it => it.decl.value))
  const veneer = story.code.routines.filter(r => {
    const s = sym.routines[r.address]
    return s && !s.artificial && !s.location && !COMPILER_ROUTINES.has(s.name) && !gameRoutines.has(r.address)
  })
  if (veneer.length) {
    banner('Inform\'s veneer routines')
    for (const r of veneer) out.push('', ...routineText(r, sym.routines[r.address]!.name, '];', true))
  }
  if (forcedLarge.size) {
    banner('Numbers the story holds in two bytes (Inform does that for a value it learns later)')
    for (const n of [...forcedLarge].sort((a, b) => a - b)) out.push(`Constant LARGE_${n} = ${n};`)
  }
  const lineRoutines: (number | undefined)[] = []
  const lines = (out.join('\n') + '\n').split('\n').map(l => {
    const m = /\u0001(\d+)\u0001/.exec(l)
    lineRoutines.push(m ? Number(m[1]) : undefined)
    return l.replace(/\u0001\d+\u0001/g, '')
  })
  return { source: lines.join('\n'), lineRoutines, statementRoutines: [...new Set(statementRoutines)], problems }
}
