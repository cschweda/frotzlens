import { hex } from './bytes.js'
import { HEADER_SIZE } from './header.js'
import type { Dictionary, Header, MemoryMap, ObjectTable, Segment } from './types.js'

function segment(kind: Segment['kind'], start: number, end: number, label: string): Segment {
  return { id: `segment:${kind}`, kind, start, end, label }
}

/**
 * The memory map (§1.1): dynamic memory is 0 up to the static-memory base;
 * static memory runs from there to the end of the file or 0xFFFF, whichever
 * is lower (§1.1.2); high memory runs from the high-memory base to the end.
 * Static and high memory may overlap. Plus each located table.
 */
export function buildMemoryMap(
  size: number,
  header: Header,
  objects: ObjectTable,
  dictionary: Dictionary,
  objectsEnd: number,
  propertiesRange: [number, number] | null,
): MemoryMap {
  const regions: Segment[] = [
    segment('dynamic', 0, Math.min(header.staticMemory, size), 'Dynamic memory'),
    segment('static', Math.min(header.staticMemory, size), Math.min(size, 0x10000), 'Static memory'),
    segment('high', Math.min(header.highMemory, size), size, 'High memory'),
  ]

  const segments: Segment[] = [segment('header', 0, HEADER_SIZE, 'Header')]
  if (header.abbreviations) {
    // 96 word addresses (§3.3); the strings themselves live elsewhere.
    segments.push(segment('abbreviations', header.abbreviations, header.abbreviations + 96 * 2, 'Abbreviation table'))
  }
  if (objects.objects.length || objects.propertyDefaults.length) {
    segments.push(segment('objects', objects.address, objectsEnd, `Object table (${objects.objects.length} objects)`))
  }
  if (propertiesRange) segments.push(segment('properties', propertiesRange[0], propertiesRange[1], 'Property tables'))
  segments.push(segment('globals', header.globals, header.globals + 240 * 2, 'Global variables'))
  if (dictionary.entries.length || dictionary.separators.length) {
    const end = dictionary.entries.length
      ? dictionary.entries.at(-1)!.address + dictionary.entryLength
      : dictionary.address + 1 + dictionary.separators.length + 3
    segments.push(segment('dictionary', dictionary.address, end, `Dictionary (${dictionary.entries.length} words)`))
  }
  segments.sort((a, b) => a.start - b.start)
  return { size, regions, segments }
}

