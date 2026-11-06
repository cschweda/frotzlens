import { Bytes, hex } from './bytes.js'
import { decodeZchars, readZchars, type TextContext } from './text.js'
import type { ObjectTable, ParseError, Property, Version, ZObject } from './types.js'

/** Property defaults (§12.2): 31 words in v1–3, 63 in v4+. */
const defaultsCount = (v: Version) => (v <= 3 ? 31 : 63)
/** Object entry size (§12.3.1, §12.3.2): 9 bytes in v1–3, 14 in v4+. */
const entrySize = (v: Version) => (v <= 3 ? 9 : 14)
/** Attribute bytes: 32 flags (4 bytes) in v1–3, 48 (6 bytes) in v4+. */
const attributeBytes = (v: Version) => (v <= 3 ? 4 : 6)

export interface ObjectsResult {
  table: ObjectTable
  /** End of the last object entry (start of the property tables, in practice). */
  entriesEnd: number
  /** [start, end) of the property tables, or null when there are no objects. */
  propertiesRange: [number, number] | null
}

/**
 * The object table (§12). The Standard gives no object count; as every
 * disassembler does, the entries are taken to end where the lowest property
 * table begins (Inform and ZILF both put the property tables right after the
 * entries).
 */
export function parseObjects(bytes: Bytes, version: Version, address: number, text: TextContext, errors: ParseError[]): ObjectsResult {
  const propertyDefaults: number[] = []
  for (let i = 0; i < defaultsCount(version); i++) propertyDefaults.push(bytes.word(address + 2 * i))

  const first = address + 2 * defaultsCount(version)
  const size = entrySize(version)
  const attrs = attributeBytes(version)
  const maxObjects = version <= 3 ? 255 : 65535
  const objects: ZObject[] = []
  let lowestProperties = Infinity
  let propertiesEnd = 0

  for (let n = 1; n <= maxObjects; n++) {
    const entry = first + (n - 1) * size
    if (entry >= lowestProperties) break
    if (!bytes.has(entry, size)) {
      if (n === 1) throw new RangeError('the first object entry is outside the file')
      errors.push({ code: 'bad-object', severity: 'error', address: entry, message: `Object ${n}'s entry runs off the end of the file.` })
      break
    }

    const attributes: number[] = []
    for (let b = 0; b < attrs; b++) {
      const byte = bytes.byte(entry + b)
      // Attribute 0 is the top bit of the first byte (§12.3.1).
      for (let bit = 0; bit < 8; bit++) if (byte & (0x80 >> bit)) attributes.push(b * 8 + bit)
    }
    const rel =
      version <= 3
        ? [bytes.byte(entry + 4), bytes.byte(entry + 5), bytes.byte(entry + 6)]
        : [bytes.word(entry + 6), bytes.word(entry + 8), bytes.word(entry + 10)]
    const propertyTable = bytes.word(entry + attrs + (version <= 3 ? 3 : 6))
    lowestProperties = Math.min(lowestProperties, propertyTable)

    const props = parsePropertyTable(bytes, version, propertyTable, text, n, errors)
    propertiesEnd = Math.max(propertiesEnd, props.end)
    objects.push({
      id: `object:${n}`,
      number: n,
      attributes,
      parent: rel[0]!,
      sibling: rel[1]!,
      child: rel[2]!,
      propertyTable,
      shortName: props.shortName,
      properties: props.properties,
    })
  }

  const entriesEnd = first + objects.length * size
  return {
    table: { address, propertyDefaults, objects },
    entriesEnd,
    propertiesRange: objects.length ? [lowestProperties, propertiesEnd] : null,
  }
}

/**
 * One property table (§12.4): a text-length byte (in words), the short name,
 * then properties in descending number order, ended by a size byte of 0.
 *
 * Size bytes (§12.4.1, §12.4.2):
 *   v1–3: one byte; number = low 5 bits, size = top 3 bits + 1.
 *   v4+:  bit 7 set → two bytes: number = low 6 bits of the first; size = low
 *         6 bits of the second, where 0 means 64 (§12.4.2.1.1).
 *         bit 7 clear → one byte: number = low 6 bits, size = bit 6 ? 2 : 1.
 */
function parsePropertyTable(bytes: Bytes, version: Version, address: number, text: TextContext, object: number, errors: ParseError[]) {
  const nameWords = bytes.byte(address)
  const shortName = {
    id: `string:${hex(address + 1)}` as const,
    address: address + 1,
    length: nameWords * 2,
    text: nameWords ? decodeZchars(text, readZchars(bytes, address + 1, nameWords).zchars) : '',
  }
  const properties: Property[] = []
  let a = address + 1 + nameWords * 2
  for (;;) {
    const first = bytes.byte(a)
    if (first === 0) break
    let number: number
    let size: number
    let header: number
    if (version <= 3) {
      number = first & 31
      size = (first >> 5) + 1
      header = 1
    } else if (first & 0x80) {
      number = first & 63
      size = bytes.byte(a + 1) & 63 || 64
      header = 2
    } else {
      number = first & 63
      size = first & 0x40 ? 2 : 1
      header = 1
    }
    if (properties.length && number >= properties.at(-1)!.number) {
      errors.push({
        code: 'bad-property',
        severity: 'warning',
        address: a,
        message: `Object ${object}'s properties are out of order (${number} after ${properties.at(-1)!.number}).`,
      })
    }
    properties.push({ number, address: a, dataAddress: a + header, size, data: bytes.slice(a + header, size) })
    a += header + size
    if (properties.length > 64) throw new RangeError(`object ${object}'s property table has no end`)
  }
  return { shortName, properties, end: a + 1 }
}
