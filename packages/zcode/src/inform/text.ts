/**
 * Writing text and dictionary words as Inform 6 source spells them (DM4 §1.11, §2.5): the inverse
 * of what the compiler does to a string.
 */

/** A string literal's contents: `^` for a new line, `~` for a double quote, `@@n` for the rest. */
export function informString(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (ch === '\n') out += '^'
    else if (ch === '"') out += '~'
    else if (ch === '~' || ch === '^' || ch === '@' || ch === '\\') out += `@@${cp}`
    else if (cp < 0x20 || cp === 0x7f) out += `@@${cp}`
    else if (cp > 0x7e) out += `@{${cp.toString(16)}}`
    else out += ch
  }
  return `"${out}"`
}

/**
 * A dictionary word: `'lamp'`, `'a//'` for one letter (a lone `'a'` is a character), `^` for an
 * apostrophe, and `//p` when the word is a plural.
 */
export function informWord(word: string, plural = false): string {
  let out = ''
  for (const ch of word) {
    const cp = ch.codePointAt(0)!
    if (ch === "'") out += '^'
    else if (ch === '^' || ch === '@' || ch === '\\' || ch === '"' || ch === '~') out += `@@${cp}`
    else if (cp < 0x20 || cp > 0x7e) out += cp > 0x7e ? `@{${cp.toString(16)}}` : `@@${cp}`
    else out += ch
  }
  const flags = plural ? '//p' : Array.from(word).length === 1 ? '//' : ''
  return `'${out}${flags}'`
}
