/**
 * Inform's object layout beyond the Standard's (Inform Technical Manual §9): individual properties,
 * and the prototype a class keeps of what its instances inherit.
 */
import type { Property, StoryFile, ZObject } from '../types.js'

/** A property list at `at` (the Standard's format, §12.4), up to its terminating 0. */
export function propertyList(story: StoryFile, at: number): Property[] {
  const bytes = story.bytes
  const v = story.header.version
  const out: Property[] = []
  for (let a = at, guard = 0; a < bytes.length && bytes[a] && guard < 64; guard++) {
    const b = bytes[a]!
    let number: number, size: number, data: number
    if (v <= 3) {
      number = b & 31
      size = (b >> 5) + 1
      data = a + 1
    } else if (b & 0x80) {
      number = b & 63
      size = bytes[a + 1]! & 63 || 64
      data = a + 2
    } else {
      number = b & 63
      size = b & 0x40 ? 2 : 1
      data = a + 1
    }
    out.push({ number, address: a, dataAddress: data, size, data: Array.from(bytes.subarray(data, data + size)) })
    a = data + size
  }
  return out
}

/** Inform's individual properties (v4+): property 3 points to a table of (number, length, data), ended by 0. */
export function individualProperties(story: StoryFile, o: ZObject): Property[] {
  const bytes = story.bytes
  const p = o.properties.find(p => p.number === 3)
  if (!p || p.data.length < 2) return []
  const out: Property[] = []
  let a = (p.data[0]! << 8) | p.data[1]!
  const word = (x: number) => (bytes[x]! << 8) | bytes[x + 1]!
  for (let guard = 0; a + 3 <= bytes.length && word(a) && guard < 256; guard++) {
    const len = bytes[a + 2]!
    out.push({ number: word(a) & 0x7fff, address: a, dataAddress: a + 3, size: len, data: Array.from(bytes.subarray(a + 3, a + 3 + len)) })
    a += 3 + len
  }
  return out
}

/**
 * A class's prototype: what Inform copies into each instance, kept right after the class object's
 * own property table: its attribute bytes, then a property list (without 2 and 3, Inform's own).
 */
export function classPrototype(story: StoryFile, o: ZObject): { attributes: number[]; properties: Property[] } {
  const bytes = story.bytes
  const v = story.header.version
  const end = o.properties.length ? Math.max(...o.properties.map(p => p.dataAddress + p.size)) : o.propertyTable + 1 + 2 * bytes[o.propertyTable]!
  let at = end + 1 // past the class object's own list's terminating 0
  const attrBytes = v <= 3 ? 4 : 6
  const attributes: number[] = []
  for (let k = 0; k < attrBytes * 8; k++) if (bytes[at + (k >> 3)]! & (0x80 >> (k & 7))) attributes.push(k)
  at += attrBytes
  return { attributes, properties: propertyList(story, at).filter(p => p.number !== 2 && p.number !== 3) }
}
