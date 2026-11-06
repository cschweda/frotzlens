/**
 * The string area: Inform (like the 1980s compilers) puts every packed
 * string after the last routine, each at an address a packed address can
 * name. Read in order from the end of the code to the end of the file.
 */
import { packedScale } from './address.js'
import { Bytes, OutOfBounds } from './bytes.js'
import { alignUp } from './routines.js'
import { decodeZchars, readZchars, type TextContext } from './text.js'
import type { Version, ZString } from './types.js'

export function sweepStrings(bytes: Bytes, version: Version, start: number, end: number, text: TextContext): ZString[] {
  const scale = packedScale(version)
  const out: ZString[] = []
  for (let a = alignUp(start, scale); a < end; ) {
    try {
      // Find where the string ends before decoding it: one that runs past the header's file length
      // isn't the story's (padding, or data appended), and mustn't spend the text budget.
      const { zchars, length } = readZchars(bytes, a)
      if (a + length > end) break
      out.push({ id: `string:${a.toString(16).padStart(4, '0')}`, address: a, length, text: decodeZchars(text, zchars) })
      a = alignUp(a + length, scale)
    } catch (e) {
      if (!(e instanceof OutOfBounds)) throw e
      break
    }
  }
  return out
}
