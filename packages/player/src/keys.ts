/**
 * A key press as the ZSCII code @read_char returns (§10.7): printable characters as themselves,
 * Return 13, Backspace and Delete 8, Escape 27, the arrows 129–132, F1–F12 133–144. Null for keys
 * with no meaning (Shift alone, Tab: Tab keeps its job of moving focus, 2.1.2).
 */
export function keyToZscii(e: { key: string }): number | null {
  const named: Record<string, number> = {
    Enter: 13,
    Backspace: 8,
    Delete: 8,
    Escape: 27,
    ArrowUp: 129,
    ArrowDown: 130,
    ArrowLeft: 131,
    ArrowRight: 132,
  }
  if (e.key in named) return named[e.key]!
  const f = /^F([1-9]|1[0-2])$/.exec(e.key)
  if (f) return 132 + Number(f[1])
  if ([...e.key].length === 1) {
    const cp = e.key.codePointAt(0)!
    if (cp >= 32 && cp <= 126) return cp
    // Anything else: '?' (§3.8.5: the interpreter may give an unknown character as '?').
    return 63
  }
  return null
}
