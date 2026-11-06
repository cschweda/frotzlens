import { Bytes, hex } from './bytes.js'
import type { Global, ParseError } from './types.js'

/**
 * The 240 global variables (§6.2): words at the header's global table; global
 * n is variable 16 + n. Globals are writable, so the table belongs in dynamic
 * memory (§1.1.1); one that isn't gets a warning, and is read anyway.
 */
export function parseGlobals(bytes: Bytes, address: number, staticMemory: number, errors: ParseError[]): Global[] {
  if (address + 480 > staticMemory) {
    errors.push({
      code: 'bad-address',
      severity: 'warning',
      address,
      message: `The global variables (${hex(address)}–${hex(address + 479)}) run past dynamic memory (which ends at ${hex(staticMemory)}).`,
    })
  }
  const out: Global[] = []
  for (let n = 0; n < 240; n++) {
    const at = address + 2 * n
    out.push({ id: `global:${n}`, number: n, address: at, value: bytes.word(at) })
  }
  return out
}
