import { HEADER_SIZE } from './header.js'
import type { Dictionary, Header, MemoryMap, ObjectTable, Segment } from './types.js'

/**
 * The memory map (§1.1): dynamic memory is 0 up to the static-memory base;
 * static memory runs from there to the end of the file or 0xFFFF, whichever
 * is lower (§1.1.2); high memory runs from the high-memory base to the end.
 * Static and high memory may overlap. Plus each located table.
 *
 * Every range is clamped to the file, and one wholly outside it is left out:
 * a corrupt pointer must not put a segment past the end of the bytes.
 */
export function buildMemoryMap(
  size: number,
  header: Header,
  objects: ObjectTable,
  dictionary: Dictionary,
  objectsEnd: number,
  propertiesRange: [number, number] | null,
  unicodeTableLength: number | null,
): MemoryMap {
  const clamp = (n: number) => Math.max(0, Math.min(n, size))
  const make = (kind: Segment['kind'], start: number, end: number, label: string): Segment | null =>
    start >= size || end <= start ? null : { id: `segment:${kind}`, kind, start: clamp(start), end: clamp(end), label }

  const regions = [
    make('dynamic', 0, header.staticMemory, 'Dynamic memory'),
    make('static', header.staticMemory, Math.min(size, 0x10000), 'Static memory'),
    make('high', header.highMemory, size, 'High memory'),
  ].filter((s): s is Segment => s !== null)

  const ext = header.headerExtension
  const d = dictionary
  const candidates: (Segment | null)[] = [
    make('header', 0, HEADER_SIZE, 'Header'),
    ext ? make('header-extension', ext.address, ext.address + 2 + 2 * ext.words.length, 'Header extension table') : null,
    // 96 word addresses (§3.3); the strings themselves live elsewhere.
    header.abbreviations ? make('abbreviations', header.abbreviations, header.abbreviations + 96 * 2, 'Abbreviation table') : null,
    header.alphabetTable ? make('alphabet', header.alphabetTable, header.alphabetTable + 78, 'Alphabet table') : null,
    header.terminatingChars
      ? make('terminating-chars', header.terminatingChars, header.terminatingChars + (header.terminatingKeys?.length ?? 0) + 1, 'Terminating characters table')
      : null,
    ext?.unicodeTable && unicodeTableLength !== null
      ? make('unicode', ext.unicodeTable, ext.unicodeTable + 1 + 2 * unicodeTableLength, 'Unicode translation table')
      : null,
    objects.objects.length || objects.propertyDefaults.length
      ? make('objects', objects.address, objectsEnd, `Object table (${objects.objects.length} objects)`)
      : null,
    propertiesRange ? make('properties', propertiesRange[0], propertiesRange[1], 'Property tables') : null,
    make('globals', header.globals, header.globals + 240 * 2, 'Global variables'),
    d.entries.length || d.separators.length
      ? make(
          'dictionary',
          d.address,
          d.entries.length ? d.entries.at(-1)!.address + d.entryLength : d.address + 4 + d.separators.length,
          `Dictionary (${d.entries.length} words)`,
        )
      : null,
  ]
  const segments = candidates.filter((s): s is Segment => s !== null).sort((a, b) => a.start - b.start)
  return { size, regions, segments }
}
