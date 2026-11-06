import { Bytes, OutOfBounds, hex } from './bytes.js'
import type { Version, ZString } from './types.js'

/**
 * The default alphabets (§3.5.3). A2's positions 6 and 7 are not characters:
 * 6 begins a 10-bit ZSCII escape (§3.4) and 7 is a newline (v2+). They are
 * marked with placeholders that `decode` never emits.
 */
const DEFAULT_ALPHABETS = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '\u0000\n0123456789.,!?_#\'"/\\-:()', // Z-char 6 = escape, 7 = newline, 8 = '0', … 31 = ')'
]

/**
 * ZSCII 155–223 by default (§3.8.5.3, Table 1), when the story has no Unicode
 * translation table.
 */
const DEFAULT_EXTRA = 'äöüÄÖÜß»«ëïÿËÏáéíóúýÁÉÍÓÚÝàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛåÅøØãñõÃÑÕæÆçÇþðÞÐ£œŒ¡¿'

/** What decoding needs from the header, gathered once. */
export interface TextContext {
  bytes: Bytes
  version: Version
  /** Byte addresses of the 96 abbreviation strings, or [] for none. */
  abbreviations: number[]
  /** 3 × 26 ZSCII codes (§3.5.5), or null for the defaults. */
  alphabets: number[][] | null
  /** ZSCII 155 + i → this Unicode code point. */
  extra: number[]
}

/** The default ZSCII 155+ mapping, as code points. */
export function defaultExtra(): number[] {
  return [...DEFAULT_EXTRA].map(c => c.codePointAt(0)!)
}

/**
 * A custom alphabet table (v5+, header 0x34): 78 bytes, A0 then A1 then A2,
 * each 26 ZSCII codes (§3.5.5). A2's first two entries are ignored: Z-chars 6
 * and 7 of A2 stay the escape and newline (§3.5.5.1).
 */
export function readAlphabetTable(bytes: Bytes, address: number): number[][] {
  const out: number[][] = []
  for (let a = 0; a < 3; a++) {
    const row: number[] = []
    for (let i = 0; i < 26; i++) row.push(bytes.byte(address + a * 26 + i))
    out.push(row)
  }
  return out
}

/**
 * The Unicode translation table (§3.8.5.2, header extension word 3): a count
 * byte n, then n words — the Unicode code points for ZSCII 155 … 155+n−1.
 */
export function readUnicodeTable(bytes: Bytes, address: number): number[] {
  const n = bytes.byte(address)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(bytes.word(address + 1 + 2 * i))
  return out
}

/** One ZSCII output code as text (§3.8). Codes with no meaning on output become '?'. */
export function zsciiToText(code: number, ctx: Pick<TextContext, 'extra'>): string {
  if (code === 0) return ''
  if (code === 13) return '\n'
  if (code >= 32 && code <= 126) return String.fromCharCode(code)
  if (code >= 155 && code <= 251) {
    const cp = ctx.extra[code - 155]
    return cp !== undefined ? String.fromCodePoint(cp) : '?'
  }
  return '?'
}

/** The Z-characters of the string at `address`: three per word until the end bit (§3.2). */
export function readZchars(bytes: Bytes, address: number, maxWords = Infinity): { zchars: number[]; length: number } {
  const zchars: number[] = []
  let a = address
  for (let words = 0; words < maxWords; words++) {
    const w = bytes.word(a)
    a += 2
    zchars.push((w >> 10) & 31, (w >> 5) & 31, w & 31)
    if (w & 0x8000) break
    if (words > 0x8000) throw new OutOfBounds(address, a - address) // no end bit anywhere sane
  }
  return { zchars, length: a - address }
}

function charFor(ctx: TextContext, alphabet: number, z: number): string {
  // Z-chars 6..31 index the alphabet at 0..25 (§3.5.3).
  if (ctx.alphabets) return zsciiToText(ctx.alphabets[alphabet]![z - 6]!, ctx)
  return DEFAULT_ALPHABETS[alphabet]![z - 6]!
}

/**
 * Decode Z-characters to text (§3.2–§3.5, v3+ rules): 0 is a space; 1–3 begin
 * an abbreviation; 4 and 5 shift the NEXT character into A1 or A2 (§3.2.3, v3+
 * shifts are single, never locks); A2's 6 begins a 10-bit ZSCII escape; A2's 7
 * is a newline. An incomplete construct at the end is dropped (§3.6.1).
 */
export function decodeZchars(ctx: TextContext, zchars: number[], inAbbreviation = false): string {
  let out = ''
  let alphabet = 0
  for (let i = 0; i < zchars.length; i++) {
    const z = zchars[i]!
    if (z === 0) {
      out += ' '
      alphabet = 0
    } else if (z >= 1 && z <= 3) {
      // Abbreviation 32(z−1) + next (§3.3). An abbreviation may not use one itself (§3.3.1).
      const next = zchars[++i]
      if (next === undefined) break
      if (!inAbbreviation) {
        const address = ctx.abbreviations[32 * (z - 1) + next]
        if (address !== undefined) out += decodeZchars(ctx, readZchars(ctx.bytes, address).zchars, true)
      }
      alphabet = 0
    } else if (z === 4 || z === 5) {
      alphabet = z - 3
    } else if (alphabet === 2 && z === 6) {
      // 10-bit ZSCII: the next two Z-characters, top 5 bits then bottom 5 (§3.4).
      const hi = zchars[i + 1]
      const lo = zchars[i + 2]
      i += 2
      if (hi === undefined || lo === undefined) break
      out += zsciiToText((hi << 5) | lo, ctx)
      alphabet = 0
    } else if (alphabet === 2 && z === 7) {
      out += '\n'
      alphabet = 0
    } else {
      out += charFor(ctx, alphabet, z)
      alphabet = 0
    }
  }
  return out
}

/** The string at `address` as a ZString. Throws OutOfBounds if it runs off the file. */
export function readString(ctx: TextContext, address: number, id = `string:${hex(address)}` as ZString['id']): ZString {
  const { zchars, length } = readZchars(ctx.bytes, address)
  return { id, address, length, text: decodeZchars(ctx, zchars) }
}
