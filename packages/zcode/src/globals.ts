import { Bytes } from './bytes.js'
import type { Global } from './types.js'

/** The 240 global variables (§6.2): words at the header's global table; global n is variable 16 + n. */
export function parseGlobals(bytes: Bytes, address: number): Global[] {
  const out: Global[] = []
  for (let n = 0; n < 240; n++) {
    const at = address + 2 * n
    out.push({ id: `global:${n}`, number: n, address: at, value: bytes.word(at) })
  }
  return out
}
