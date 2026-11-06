/**
 * The string area: Inform (like the 1980s compilers) puts every packed
 * string after the last routine, each at an address a packed address can
 * name. Read in order from the end of the code to the end of the file.
 */
import { packedScale } from './address.js'
import { Bytes, OutOfBounds } from './bytes.js'
import { alignUp } from './routines.js'
import { readString, type TextContext } from './text.js'
import type { Version, ZString } from './types.js'

export function sweepStrings(bytes: Bytes, version: Version, start: number, end: number, text: TextContext): ZString[] {
  const scale = packedScale(version)
  const out: ZString[] = []
  for (let a = alignUp(start, scale); a < end; ) {
    try {
      const s = readString(text, a)
      out.push(s)
      a = alignUp(a + s.length, scale)
    } catch (e) {
      if (!(e instanceof OutOfBounds)) throw e
      break
    }
  }
  return out
}
