import type { Version } from './types.js'

/**
 * Packed addresses (§1.2.3): a routine or string address stored in a word,
 * scaled by 2 (v1–3), 4 (v4–5) or 8 (v8). v6–7 add an offset from the header
 * (routines/strings offset × 8); this package parses v3–5 and v8 only.
 */
export function packedScale(version: Version): number {
  if (version <= 3) return 2
  if (version <= 5) return 4
  return 8
}

/** The header's file-length word is scaled the same way, but v6–7 use × 8 too (§11.1.6). */
export function fileLengthScale(version: Version): number {
  if (version <= 3) return 2
  if (version <= 5) return 4
  return 8
}

export function unpack(packed: number, version: Version): number {
  return packed * packedScale(version)
}
