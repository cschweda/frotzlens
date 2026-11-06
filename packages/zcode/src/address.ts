import type { Version } from './types.js'

/**
 * Packed addresses (§1.2.3): a routine or string address stored in a word,
 * scaled by 2 (v1–3), 4 (v4–7) or 8 (v8); v6–7 also add 8 × an offset from the
 * header. This package parses v3–5 and v8.
 */
export function packedScale(version: Version): number {
  if (version <= 3) return 2
  if (version <= 7) return 4 // v6–7: × 4, plus an offset (see unpack)
  return 8
}

/** The header's file-length word is scaled the same way, but v6–7 use × 8 too (§11.1.6). */
export function fileLengthScale(version: Version): number {
  if (version <= 3) return 2
  if (version <= 5) return 4
  return 8
}

/**
 * A packed address as a byte address. v6–7 add 8 × the header's routines or
 * strings offset (§1.2.3), so pass the offset for those versions; it is an
 * error to leave it out there.
 */
export function unpack(packed: number, version: Version, offset?: number): number {
  if (version === 6 || version === 7) {
    if (offset === undefined) throw new RangeError('v6–7 packed addresses need the routines or strings offset')
    return packed * 4 + offset * 8
  }
  return packed * packedScale(version)
}
