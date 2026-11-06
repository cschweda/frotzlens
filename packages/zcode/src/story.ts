import { Bytes, guarded, hex } from './bytes.js'
import { parseDictionary } from './dictionary.js'
import { parseGlobals } from './globals.js'
import { HEADER_SIZE, parseHeader } from './header.js'
import { buildMemoryMap } from './memory.js'
import { parseObjects, type ObjectsResult } from './objects.js'
import { parseGrammar } from './grammar.js'
import { MAX_SWEEP_WORK, sweepRoutines } from './routines.js'
import { sweepStrings } from './strings.js'
import { buildXrefs } from './xrefs.js'
import { MAX_TEXT, MAX_TOTAL_TEXT, defaultExtra, readAlphabetTable, readString, readUnicodeTable, type TextContext } from './text.js'
import type { Code, Dictionary, Header, ParseError, ParseOptions, StoryFile, Version, ZString } from './types.js'

/** Versions this package parses beyond the header. */
const SUPPORTED: readonly Version[] = [3, 4, 5, 8]

/** A Blorb file is an IFF FORM of type IFRS (Blorb spec §2). */
export function isBlorb(data: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...data.subarray(o, o + 4))
  return data.length >= 12 && tag(0) === 'FORM' && tag(8) === 'IFRS'
}

const emptyDictionary = (address = 0): Dictionary => ({ address, separators: [], entryLength: 0, entries: [] })
const emptyCode = (): Code => ({ analysisStart: 0, routines: [], end: 0 })

/**
 * Parse a story file. Never throws: a truncated or corrupt file yields a model
 * with `errors` populated and whatever could be recovered. A table that can't
 * be read comes back empty with an error; the others still come back.
 */
export function parseStory(data: Uint8Array, opts: ParseOptions = {}): StoryFile {
  try {
    return parse(data, opts)
  } catch (e) {
    // guarded() lets bugs through rather than dress them up as bad-file errors; here, at the
    // boundary, one still never escapes: it comes back as an `internal` error.
    return {
      bytes: data,
      container: isBlorb(data) ? 'blorb' : 'bare',
      header: blankHeader(isBlorb(data) ? 0 : (data[0] ?? 0)),
      memory: { size: data.length, regions: [], segments: [] },
      abbreviations: [],
      dictionary: emptyDictionary(),
      objects: { address: 0, propertyDefaults: [], objects: [] },
      globals: [],
      code: emptyCode(),
      strings: [],
      xrefs: {},
      errors: [{ code: 'internal', severity: 'error', message: `Internal error in @frotzinc/zcode (please report it): ${String(e)}` }],
    }
  }
}

function blankHeader(version: number): Header {
  return {
    version,
    flags1: 0, release: 0, highMemory: 0, initialPc: 0, dictionary: 0, objects: 0, globals: 0,
    staticMemory: 0, flags2: 0, serial: '', abbreviations: 0, fileLength: 0, checksum: 0, checksumOk: false,
  }
}

function parse(data: Uint8Array, opts: ParseOptions): StoryFile {
  const progress = opts.onProgress ?? (() => {})
  const errors: ParseError[] = []
  const bytes = new Bytes(data)

  const empty = (container: StoryFile['container'], header: Header): StoryFile => ({
    bytes: data,
    container,
    header,
    memory: { size: data.length, regions: [], segments: [] },
    abbreviations: [],
    dictionary: emptyDictionary(),
    objects: { address: 0, propertyDefaults: [], objects: [] },
    globals: [],
    code: emptyCode(),
    strings: [],
    xrefs: {},
    errors,
  })
  if (isBlorb(data)) {
    errors.push({ code: 'blorb-unsupported', severity: 'error', message: 'This is a Blorb file; unwrapping it is not supported yet.' })
    return empty('blorb', blankHeader(0)) // a Blorb's first byte is 'F', not a version
  }
  if (data.length < HEADER_SIZE) {
    errors.push({ code: 'truncated', severity: 'error', message: `The file is ${data.length} bytes, shorter than a 64-byte header.` })
    return empty('bare', blankHeader(data[0] ?? 0))
  }

  const header = parseHeader(bytes, errors)
  progress('header', 1)
  if (!(header.version >= 1 && header.version <= 8)) {
    errors.push({ code: 'bad-header', severity: 'error', message: `Byte 0 is ${header.version}: not a Z-machine version (1–8).` })
    return empty('bare', header)
  }
  const version = header.version as Version
  if (!SUPPORTED.includes(version)) {
    errors.push({
      code: 'unsupported-version',
      severity: 'error',
      message: `Version ${version} files are not supported (only 3, 4, 5 and 8); only the header was read.`,
    })
    return empty('bare', header)
  }

  // ── Text: alphabets, Unicode table, abbreviations ──
  const text: TextContext = { bytes, version, abbreviations: [], alphabets: null, extra: defaultExtra(), budget: MAX_TOTAL_TEXT }
  if (header.alphabetTable) {
    text.alphabets = guarded(errors, 'bad-text', 'The alphabet table', null, () => readAlphabetTable(bytes, header.alphabetTable!))
  }
  let unicodeTableLength: number | null = null
  if (header.headerExtension?.unicodeTable) {
    const table = guarded(errors, 'bad-text', 'The Unicode translation table', null, () =>
      readUnicodeTable(bytes, header.headerExtension!.unicodeTable!),
    )
    if (table) {
      text.extra = table
      unicodeTableLength = table.length
    }
  }
  let abbreviations: ZString[] = []
  if (header.abbreviations) {
    // 96 entries, each a WORD address: the byte address is twice it (§3.3, §1.2.2).
    const addresses = guarded(errors, 'bad-text', 'The abbreviation table', [] as number[], () =>
      Array.from({ length: 96 }, (_, i) => bytes.word(header.abbreviations + 2 * i) * 2),
    )
    // Each on its own: an unreadable one is an error and an empty string, and the rest stay.
    abbreviations = addresses.map((a, i) =>
      guarded(errors, 'bad-text', `Abbreviation ${i} (at ${hex(a)})`, { id: `abbrev:${i}` as const, address: a, length: 0, text: '' }, () =>
        readString(text, a, `abbrev:${i}`),
      ),
    )
    // Strings use abbreviations from here on; each is decoded once, above.
    if (abbreviations.length === 96) {
      text.abbreviations = addresses
      text.abbreviationTexts = abbreviations.map(a => a.text)
    }
  }
  progress('text', 1)

  // ── Tables ──
  const objects = guarded<ObjectsResult>(
    errors,
    'bad-object',
    'The object table',
    { table: { address: header.objects, propertyDefaults: [], objects: [] }, entriesEnd: header.objects, propertiesRange: null },
    () => parseObjects(bytes, version, header.objects, text, errors),
  )
  progress('objects', 1)
  const dictionary = guarded(errors, 'bad-dictionary', 'The dictionary', emptyDictionary(header.dictionary), () =>
    parseDictionary(bytes, version, header.dictionary, text, !!header.inform, errors),
  )
  progress('dictionary', 1)
  const globals = guarded(errors, 'bad-address', `The global variables (at ${hex(header.globals)})`, [], () =>
    parseGlobals(bytes, header.globals, header.staticMemory, errors),
  )
  progress('globals', 1)

  // ── Code and strings: sweep from the end of the dictionary, where code can first start ──
  const d = dictionary
  const analysisStart = d.entries.length
    ? d.entries.at(-1)!.address + d.entryLength
    : d.address + 4 + d.separators.length
  const routines = guarded(errors, 'bad-address', 'The code', [] as Code['routines'], () => {
    const swept = sweepRoutines(bytes, version, analysisStart, text)
    if (swept.exhausted) {
      errors.push({
        code: 'bad-address',
        severity: 'warning',
        message: `Disassembly stopped after ${MAX_SWEEP_WORK.toLocaleString('en')} units of work (instructions, and inline text); the routines after that point are missing.`,
      })
    }
    return swept.routines
  })
  const code: Code = { analysisStart, routines, end: routines.at(-1)?.end ?? 0 }
  // v6–7 start at a packed routine; elsewhere the initial PC is the first instruction of the
  // main routine.
  // v1–4 headers carry initial values, so the routine starts more than a byte before it.
  const main = version !== 6 && version !== 7 ? routines.find(r => r.instructions[0]?.address === header.initialPc) : undefined
  if (main) code.main = main.address
  progress('code', 1)
  const strings = routines.length
    ? guarded(errors, 'bad-text', 'The strings', [] as ZString[], () =>
        sweepStrings(bytes, version, code.end, header.fileLength || data.length, text),
      )
    : []
  progress('strings', 1)
  const grammar = header.inform
    ? guarded(errors, 'bad-address', 'The grammar table', undefined, () =>
        parseGrammar(bytes, version, header.staticMemory, header.globals + 480, dictionary),
      )
    : undefined
  progress('grammar', 1)
  const xrefs = buildXrefs(version, routines, strings, objects.table, dictionary, grammar)
  progress('xrefs', 1)

  if (text.truncated) {
    errors.push({
      code: 'bad-text',
      severity: 'warning',
      message: `The story's text is cut short: a string decodes to more than ${MAX_TEXT} characters, or all of it to more than ${MAX_TOTAL_TEXT}.`,
    })
  }

  const memory = buildMemoryMap(
    data.length,
    header,
    objects.table,
    dictionary,
    objects.entriesEnd,
    objects.propertiesRange,
    unicodeTableLength,
  )
  progress('memory', 1)

  return { bytes: data, container: 'bare', header, memory, abbreviations, dictionary, objects: objects.table, globals, code, strings, ...(grammar ? { grammar } : {}), xrefs, errors }
}
