import { Bytes, guarded, hex } from './bytes.js'
import { parseDictionary } from './dictionary.js'
import { parseGlobals } from './globals.js'
import { HEADER_SIZE, parseHeader } from './header.js'
import { buildMemoryMap } from './memory.js'
import { parseObjects, type ObjectsResult } from './objects.js'
import { MAX_TEXT, defaultExtra, readAlphabetTable, readString, readUnicodeTable, type TextContext } from './text.js'
import type { Dictionary, Header, ParseError, ParseOptions, StoryFile, Version, ZString } from './types.js'

/** Versions this package parses beyond the header. */
const SUPPORTED: readonly Version[] = [3, 4, 5, 8]

/** A Blorb file is an IFF FORM of type IFRS (Blorb spec §2). */
export function isBlorb(data: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...data.subarray(o, o + 4))
  return data.length >= 12 && tag(0) === 'FORM' && tag(8) === 'IFRS'
}

const emptyDictionary = (address = 0): Dictionary => ({ address, separators: [], entryLength: 0, entries: [] })

/**
 * Parse a story file. Never throws: a truncated or corrupt file yields a model
 * with `errors` populated and whatever could be recovered. A table that can't
 * be read comes back empty with an error; the others still come back.
 */
export function parseStory(data: Uint8Array, opts: ParseOptions = {}): StoryFile {
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
    errors,
  })
  const blankHeader = (): Header => ({
    version: (data[0] ?? 0) as Version,
    flags1: 0, release: 0, highMemory: 0, initialPc: 0, dictionary: 0, objects: 0, globals: 0,
    staticMemory: 0, flags2: 0, serial: '', abbreviations: 0, fileLength: 0, checksum: 0, checksumOk: false,
  })

  if (isBlorb(data)) {
    errors.push({ code: 'blorb-unsupported', severity: 'error', message: 'This is a Blorb file; unwrapping it is not supported yet.' })
    return empty('blorb', blankHeader())
  }
  if (data.length < HEADER_SIZE) {
    errors.push({ code: 'truncated', severity: 'error', message: `The file is ${data.length} bytes, shorter than a 64-byte header.` })
    return empty('bare', blankHeader())
  }

  const header = parseHeader(bytes, errors)
  progress('header', 1)
  const version = header.version
  if (!(version >= 1 && version <= 8)) {
    errors.push({ code: 'bad-header', severity: 'error', message: `Byte 0 is ${version}: not a Z-machine version (1–8).` })
    return empty('bare', header)
  }
  if (!SUPPORTED.includes(version)) {
    errors.push({
      code: 'unsupported-version',
      severity: 'error',
      message: `Version ${version} files are not supported (only 3, 4, 5 and 8); only the header was read.`,
    })
    return empty('bare', header)
  }

  // ── Text: alphabets, Unicode table, abbreviations ──
  const text: TextContext = { bytes, version, abbreviations: [], alphabets: null, extra: defaultExtra() }
  if (header.alphabetTable) {
    text.alphabets = guarded(errors, 'bad-text', 'The alphabet table', null, () => readAlphabetTable(bytes, header.alphabetTable!))
  }
  if (header.headerExtension?.unicodeTable) {
    text.extra = guarded(errors, 'bad-text', 'The Unicode translation table', text.extra, () =>
      readUnicodeTable(bytes, header.headerExtension!.unicodeTable!),
    )
  }
  let abbreviations: ZString[] = []
  if (header.abbreviations) {
    // 96 entries, each a WORD address: the byte address is twice it (§3.3, §1.2.2).
    const addresses = guarded(errors, 'bad-text', 'The abbreviation table', [] as number[], () =>
      Array.from({ length: 96 }, (_, i) => bytes.word(header.abbreviations + 2 * i) * 2),
    )
    abbreviations = guarded(errors, 'bad-text', 'An abbreviation', [] as ZString[], () =>
      addresses.map((a, i) => readString(text, a, `abbrev:${i}`)),
    )
    // Strings may use abbreviations only once they are all readable; each is decoded once, here.
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
    parseDictionary(bytes, version, header.dictionary, text, !!header.inform),
  )
  progress('dictionary', 1)
  const globals = guarded(errors, 'bad-address', `The global variables (at ${hex(header.globals)})`, [], () =>
    parseGlobals(bytes, header.globals),
  )
  progress('globals', 1)

  if (text.truncated) {
    errors.push({
      code: 'bad-text',
      severity: 'warning',
      message: `At least one string decodes to more than ${MAX_TEXT} characters; it was cut there.`,
    })
  }

  const memory = buildMemoryMap(data.length, header, objects.table, dictionary, objects.entriesEnd, objects.propertiesRange)
  progress('memory', 1)

  return { bytes: data, container: 'bare', header, memory, abbreviations, dictionary, objects: objects.table, globals, errors }
}
