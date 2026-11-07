/**
 * Text for the interpreter (§3): ZSCII in and out, and encoding words for the dictionary (§3.7,
 * §13). Decoding Z-characters is zcode's (`decodeZscii`); this file turns ZSCII into what the
 * screen shows, and typed text back into ZSCII and Z-characters.
 */
import { decodeZscii, readZchars, zsciiToText, type TextContext } from '@frotzinc/zcode'

/** The default alphabets as ZSCII (§3.5.3); A2's first two are the escape and newline. */
const DEFAULT_A = [
  [...'abcdefghijklmnopqrstuvwxyz'].map(c => c.charCodeAt(0)),
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => c.charCodeAt(0)),
  [0, 13, ...[...'0123456789.,!?_#\'"/\\-:()'].map(c => c.charCodeAt(0))],
]

/** The ZSCII codes of the string at `address` (byte address). */
export function zsciiAt(ctx: TextContext, address: number): number[] {
  return decodeZscii(ctx, readZchars(ctx.bytes, address).zchars)
}

/** One ZSCII output code as screen text (§3.8); codes with no glyph show as '?'. */
export const zsciiText = (code: number, ctx: TextContext) => zsciiToText(code, ctx)

/**
 * A Unicode character typed or printed, as ZSCII (§3.8): ASCII as itself, the extra characters
 * through the Unicode table, anything else '?' (63).
 */
export function unicodeToZscii(ch: string, ctx: TextContext): number {
  const cp = ch.codePointAt(0)!
  if (cp === 10 || cp === 13) return 13
  if (cp >= 32 && cp <= 126) return cp
  const i = ctx.extra.indexOf(cp)
  return i >= 0 && i <= 96 ? 155 + i : 63
}

/**
 * Typed text as ZSCII for a text buffer: lowercased first (§15 read: the interpreter converts
 * input to lower case), then mapped.
 */
export function inputToZscii(text: string, ctx: TextContext): number[] {
  return [...text.toLowerCase()].map(ch => unicodeToZscii(ch, ctx))
}

/**
 * ZSCII codes encoded as a dictionary word (§3.7): v3 6 Z-characters in 2 words, v4+ 9 in 3,
 * truncated or padded with 5s, the end bit on the last word. Returns the bytes.
 */
export function encodeWord(codes: number[], ctx: TextContext): Uint8Array {
  const n = ctx.version <= 3 ? 6 : 9
  const alphabets = ctx.alphabets ?? DEFAULT_A
  const z: number[] = []
  for (const c of codes) {
    if (z.length >= n) break
    const a0 = alphabets[0]!.indexOf(c)
    if (a0 >= 0) {
      z.push(a0 + 6)
      continue
    }
    const a1 = alphabets[1]!.indexOf(c)
    if (a1 >= 0) {
      z.push(4, a1 + 6)
      continue
    }
    // A2 positions 0 and 1 are the escape and newline, never characters (§3.5.3).
    const a2 = alphabets[2]!.indexOf(c, 2)
    if (a2 >= 2) {
      z.push(5, a2 + 6)
      continue
    }
    z.push(5, 6, (c >> 5) & 31, c & 31)
  }
  z.length = Math.min(z.length, n)
  while (z.length < n) z.push(5)
  const out = new Uint8Array((n / 3) * 2)
  for (let i = 0; i < n; i += 3) {
    let w = (z[i]! << 10) | (z[i + 1]! << 5) | z[i + 2]!
    if (i + 3 >= n) w |= 0x8000
    out[(i / 3) * 2] = w >> 8
    out[(i / 3) * 2 + 1] = w & 0xff
  }
  return out
}
