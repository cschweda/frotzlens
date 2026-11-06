import { Bytes, hex } from './bytes.js'
import { decodeZchars, readZchars, zsciiToText, type TextContext } from './text.js'
import type { DictEntry, Dictionary, Version } from './types.js'

/**
 * The dictionary (§13): a count byte of word-separator ZSCII codes and the
 * codes; the entry length; a signed word count (negative: unsorted, §13.2 —
 * the entries are the same either way); then the entries. Each starts with
 * the encoded word, 4 bytes (6 Z-chars) in v1–3 or 6 bytes (9 Z-chars) in v4+
 * (§13.3, §13.4), followed by data bytes of the compiler's own.
 */
export function parseDictionary(bytes: Bytes, version: Version, address: number, text: TextContext, inform: boolean): Dictionary {
  const nSeparators = bytes.byte(address)
  const separators: string[] = []
  for (let i = 1; i <= nSeparators; i++) separators.push(zsciiToText(bytes.byte(address + i), text))
  const entryLength = bytes.byte(address + 1 + nSeparators)
  const raw = bytes.word(address + 2 + nSeparators)
  const count = Math.abs(raw >= 0x8000 ? raw - 0x10000 : raw)
  const textBytes = version <= 3 ? 4 : 6
  if (entryLength < textBytes) throw new RangeError(`entry length ${entryLength} is shorter than an encoded word (${textBytes})`)

  const first = address + 4 + nSeparators
  const entries: DictEntry[] = []
  for (let i = 0; i < count; i++) {
    const at = first + i * entryLength
    const { zchars } = readZchars(bytes, at, textBytes / 2)
    const data = [...bytes.slice(at + textBytes, entryLength - textBytes)]
    const entry: DictEntry = { id: `dict:${hex(at)}`, index: i + 1, address: at, word: decodeZchars(text, zchars), data }
    if (inform && data.length) {
      // Inform's #dict_par1 (Inform Designer's Manual §29; Technical Manual §9.2).
      const f = data[0]!
      entry.inform = { verb: !!(f & 1), meta: !!(f & 2), plural: !!(f & 4), preposition: !!(f & 8), noun: !!(f & 128) }
    }
    entries.push(entry)
  }
  return { address, separators, entryLength, entries }
}
