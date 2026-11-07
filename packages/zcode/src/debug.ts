/**
 * Symbols from Inform 6's debug file, gameinfo.dbg (the XML format, Inform
 * 6.33+, written with `-k`): the names of routines and their locals, objects,
 * globals, arrays, properties, attributes, actions and classes, and where each
 * routine is in the source. A layer over the model: the story is parsed the
 * same with or without it, so a view can switch between names and numbers.
 */
import { child, childText, parseXml, type XmlElement } from './xml.js'

export interface SourceLocation {
  /** An index into `sources`. */
  file: number
  line: number
  character: number
  /** The character offset in the file, which orders declarations within it. */
  position?: number
  endLine?: number
}

/** One declaration with a place in the source: the decompiler orders its output by these. */
export interface SymbolDeclaration {
  kind: 'routine' | 'object' | 'class' | 'global' | 'array' | 'property' | 'attribute' | 'action' | 'fake-action' | 'constant'
  name: string
  /** The address (routine, array), the number (object, class, global, property, attribute, action) or the value (constant). */
  value: number
  location: SourceLocation
}

export interface SymbolRoutine {
  name: string
  /** Made up by the compiler (e.g. `SelfClass::description`, an embedded routine), not a source name. */
  artificial: boolean
  /** Byte address of the routine's header. */
  address: number
  byteCount?: number
  /** Local variable names, by number less one (L00 is `locals[0]`). */
  locals: string[]
  location?: SourceLocation
}

export interface SymbolArray {
  name: string
  address: number
  byteCount: number
  bytesPerElement: number
  /** A `table` or `string` array: element 0 holds the length. */
  lengthFirst: boolean
}

export interface Symbols {
  /** The compiler, from the root: e.g. "Inform" and "6.44". */
  creator?: string
  creatorVersion?: string
  /** The source files, by index: their paths as given to the compiler. */
  sources: string[]
  /** By byte address. */
  routines: Record<number, SymbolRoutine>
  /** By object number. */
  objects: Record<number, string>
  /** By global number (0 is G00, the Z-machine's variable 16). */
  globals: Record<number, string>
  /** By property number. */
  properties: Record<number, string>
  /** By attribute number. */
  attributes: Record<number, string>
  /** By action number, without the `##`. Fake actions (4096 and up) are here too. */
  actions: Record<number, string>
  /** Class names, by the class's object number. */
  classes: Record<number, string>
  arrays: SymbolArray[]
  constants: Record<string, number>
  /** Everything with a source location, in the file's order. */
  declarations: SymbolDeclaration[]
  /** The first 64 bytes of the story this was written with: its header. */
  prefix?: Uint8Array
  /** Problems reading the file: a malformed document, entries with no usable value. */
  problems: string[]
}

const num = (s: string | undefined) => (s !== undefined && /^\s*-?\d+\s*$/.test(s) ? Number(s) : undefined)

function location(el: XmlElement): SourceLocation | undefined {
  const loc = child(el, 'source-code-location')
  if (!loc) return undefined
  const file = num(childText(loc, 'file-index'))
  const line = num(childText(loc, 'line'))
  if (file === undefined || line === undefined) return undefined
  const end = num(childText(loc, 'end-line'))
  const position = num(childText(loc, 'file-position'))
  return { file, line, character: num(childText(loc, 'character')) ?? 0, ...(position !== undefined ? { position } : {}), ...(end !== undefined ? { endLine: end } : {}) }
}

function base64(s: string): Uint8Array | undefined {
  const clean = s.replace(/\s+/g, '')
  // Canonical: whole groups of four, padding only at the end.
  if (clean.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return undefined
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const out: number[] = []
  let bits = 0
  let acc = 0
  for (const ch of clean.replace(/=+$/, '')) {
    acc = (acc << 6) | A.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 255)
    }
  }
  return new Uint8Array(out)
}

/** Debug files bigger than this aren't read (the largest Inform game's is a few tens of MB). */
export const MAX_DEBUG_FILE = 128 * 1024 * 1024

/** Read a gameinfo.dbg. Never throws: what couldn't be read is in `problems`. */
export function readSymbols(xml: string): Symbols {
  const s: Symbols = {
    sources: [], routines: {}, objects: {}, globals: {}, properties: {}, attributes: {}, actions: {}, classes: {}, arrays: [], constants: {}, declarations: [], problems: [],
  }
  if (xml.length > MAX_DEBUG_FILE) {
    s.problems.push('The debug file is too large to read.')
    return s
  }
  const { root, error } = parseXml(xml)
  if (error) s.problems.push(`The debug file is malformed: ${error}`)
  if (!root) return s
  if (root.name !== 'inform-story-file') {
    s.problems.push(`This isn't an Inform debug file (its root is <${root.name}>).`)
    return s
  }
  if (root.attrs['content-creator']) s.creator = root.attrs['content-creator']
  if (root.attrs['content-creator-version']) s.creatorVersion = root.attrs['content-creator-version']

  const prefix = childText(root, 'story-file-prefix')
  if (prefix !== undefined) {
    const bytes = base64(prefix)
    if (bytes && bytes.length === 64) s.prefix = bytes
    else s.problems.push('The story-file prefix is not 64 bytes of base64.')
  }
  // Globals are given by byte address; the header in the prefix says where the table starts.
  const globalsBase = s.prefix ? (s.prefix[0x0c]! << 8) | s.prefix[0x0d]! : undefined
  let skipped = 0
  const declare = (kind: SymbolDeclaration['kind'], name: string, value: number, el: XmlElement) => {
    const loc = location(el)
    if (loc) s.declarations.push({ kind, name, value, location: loc })
  }

  for (const el of root.children) {
    const name = childText(el, 'identifier')
    const value = num(childText(el, 'value'))
    switch (el.name) {
      case 'source': {
        const index = num(el.attrs.index)
        const path = childText(el, 'given-path')
        if (index !== undefined && index >= 0 && index < 10_000 && path !== undefined) s.sources[index] = path
        break
      }
      case 'routine': {
        const address = num(childText(el, 'address'))
        if (name === undefined || address === undefined) {
          skipped++
          break
        }
        if (address === 0) break // a routine the compiler left out of the story (unused)
        const locals: string[] = []
        for (const l of el.children) {
          if (l.name !== 'local-variable') continue
          const i = num(childText(l, 'index'))
          const n = childText(l, 'identifier')
          if (i !== undefined && i >= 1 && i <= 15 && n) locals[i - 1] = n
        }
        const byteCount = num(childText(el, 'byte-count'))
        const loc = location(el)
        s.routines[address] = {
          name,
          artificial: child(el, 'identifier')?.attrs.artificial === 'true',
          address,
          ...(byteCount !== undefined ? { byteCount } : {}),
          locals: Array.from(locals, l => l ?? ''),
          ...(loc ? { location: loc } : {}),
        }
        declare('routine', name, address, el)
        break
      }
      case 'global-variable': {
        const address = num(childText(el, 'address'))
        if (name === undefined || address === undefined || globalsBase === undefined) {
          skipped++
          break
        }
        const n = (address - globalsBase) / 2
        if (Number.isInteger(n) && n >= 0 && n < 240) {
          s.globals[n] = name
          declare('global', name, n, el)
        } else skipped++
        break
      }
      case 'array': {
        const byteCount = num(childText(el, 'byte-count'))
        if (name === undefined || value === undefined || byteCount === undefined) {
          skipped++
          break
        }
        s.arrays.push({
          name,
          address: value,
          byteCount,
          bytesPerElement: num(childText(el, 'bytes-per-element')) ?? 1,
          lengthFirst: childText(el, 'zeroth-element-holds-length') === 'true',
        })
        declare('array', name, value, el)
        break
      }
      case 'object':
      case 'property':
      case 'attribute':
      case 'action':
      case 'fake-action':
      case 'constant': {
        if (name === undefined || value === undefined) {
          // A constant redefined without a value (the libraries' LIBRARY_STAGE) is no loss.
          if (el.name !== 'constant') skipped++
          break
        }
        if (el.name === 'object') s.objects[value] = name
        else if (el.name === 'property') {
          if (child(el, 'identifier')?.attrs.artificial !== 'true') s.properties[value] = name
        } else if (el.name === 'attribute') s.attributes[value] = name
        else if (el.name === 'constant') s.constants[name] = value
        else s.actions[value] = name.replace(/^##/, '')
        declare(el.name === 'fake-action' ? 'fake-action' : el.name as SymbolDeclaration['kind'], el.name === 'action' || el.name === 'fake-action' ? name.replace(/^##/, '') : name, value, el)
        break
      }
      case 'class': {
        if (name !== undefined && value !== undefined) {
          s.classes[value] = name
          declare('class', name, value, el)
        }
        break
      }
    }
  }
  if (skipped) s.problems.push(`${skipped} entr${skipped === 1 ? 'y' : 'ies'} had no usable name or value and were left out.`)
  return s
}

/**
 * Whether the debug file was written with this story: its prefix is the story's first 64 bytes.
 * Interpreters change header bytes as they run (flags, the interpreter number and version), so
 * only the bytes the compiler sets and no interpreter writes are compared: the version, release,
 * the table addresses, the serial, the length and the checksum.
 */
export function symbolsMatch(story: Uint8Array, symbols: Symbols): boolean | undefined {
  const p = symbols.prefix
  if (!p) return undefined
  const fixed = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
  return story.length >= 64 && fixed.every(i => story[i] === p[i])
}
