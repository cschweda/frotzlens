/**
 * What made a story file, without debug information: the compiler (Inform 6
 * or ZILF, from what each writes into the header), the library (the Inform
 * Standard Library or PunyInform, from the text each prints in its banner),
 * and which routines are Inform's veneer — the routines the compiler adds
 * itself (`Main__`, `RT__Err`, `CA__Pr`, …), recognised by their code.
 */
import { packedScale } from './address.js'
import type { Routine } from './routines.js'
import type { StoryFile, Version, ZString } from './types.js'
import { VENEER } from './veneer-signatures.generated.js'

export interface Fingerprint {
  compiler: 'inform6' | 'zilf' | 'unknown'
  /** As the compiler wrote it: Inform's "6.44", ZILF's "1.9.0". */
  compilerVersion?: string
  library?: { name: 'Standard Library' | 'PunyInform'; version?: string }
  /** Recognised veneer routines: name, by the routine's address. */
  veneer: Record<number, string>
}

/** The bytes at `at`, as ASCII, when every one is printable. */
function ascii(bytes: Uint8Array, at: number, n: number): string | undefined {
  if (bytes.length < at + n) return undefined
  const s = String.fromCharCode(...bytes.subarray(at, at + n))
  return /^[\x20-\x7e]+$/.test(s) ? s : undefined
}

/** ZILF writes "ZILF" at 0x38 and its version's digits after it (`ZILF190~` is ZILF 1.9.0). */
function zilf(bytes: Uint8Array): string | undefined {
  if (ascii(bytes, 0x38, 4) !== 'ZILF') return undefined
  const digits = /^\d+/.exec(ascii(bytes, 0x3c, 4) ?? '')?.[0]
  return digits ? digits.split('').join('.') : ''
}

/**
 * A routine's shape: its locals count and its opcodes, in order, operands left out. Inform writes
 * each veneer routine the same way in every story it compiles with the same options, whatever the
 * game, so the shape names it.
 */
export function routineShape(r: Routine): string {
  return `${r.locals}:${r.instructions.map(i => i.name).join(',')}`
}

/** FNV-1a, 32 bits, as 8 hex digits: a routine shape's key in the signature table. */
export function shapeHash(shape: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < shape.length; i++) {
    h ^= shape.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The library, from its banner: the Standard Library prints " Library v" and its LibRelease string
 * next ("6.12.8"); PunyInform prints " PunyInform v", then the major number, '.', the minor.
 */
function library(story: StoryFile, byPacked: Map<number, ZString>): Fingerprint['library'] {
  for (const r of story.code.routines) {
    const ins = r.instructions
    for (let i = 0; i < ins.length; i++) {
      const x = ins[i]!
      if (x.text?.text.endsWith('PunyInform v')) {
        const [a, dot, b] = [ins[i + 1], ins[i + 2], ins[i + 3]]
        const major = a?.name === 'PRINT_NUM' && a.operands[0]?.kind !== 'variable' ? a.operands[0]?.value : undefined
        const minor = b?.name === 'PRINT_NUM' && b.operands[0]?.kind !== 'variable' ? b.operands[0]?.value : undefined
        const isDot = dot?.name === 'PRINT_CHAR' && dot.operands[0]?.value === 0x2e
        return { name: 'PunyInform', ...(major !== undefined && minor !== undefined && isDot ? { version: `${major}.${minor}` } : {}) }
      }
      const named = x.operands.some(o => o.kind !== 'variable' && byPacked.get(o.value)?.text === ' Library v')
      if (named) {
        const next = ins[i + 1]
        const v = next?.operands.map(o => (o.kind !== 'variable' ? byPacked.get(o.value)?.text : undefined)).find(t => t && /^\d+(\.\d+)+$/.test(t))
        return { name: 'Standard Library', ...(v ? { version: v } : {}) }
      }
    }
  }
  return undefined
}

/** Shorter shapes than this could be anybody's routine, so they never name a veneer one. */
const MIN_INSTRUCTIONS = 4

export function fingerprint(story: StoryFile): Fingerprint {
  const { bytes, header } = story
  const z = zilf(bytes)
  const fp: Fingerprint = {
    compiler: z !== undefined ? 'zilf' : header.inform ? 'inform6' : 'unknown',
    veneer: {},
  }
  if (z) fp.compilerVersion = z
  else if (header.inform) fp.compilerVersion = header.inform.compilerVersion
  if (fp.compiler === 'zilf') return fp

  // The strings after the code, by packed address (what an operand naming one holds).
  const scale = packedScale(header.version as Version)
  const byPacked = new Map(story.strings.map(s => [s.address / scale, s]))
  const lib = library(story, byPacked)
  if (lib) fp.library = lib

  // Veneer routines: a name only when exactly one routine has its shape.
  const seen = new Map<string, number[]>()
  for (const r of story.code.routines) {
    if (r.instructions.length < MIN_INSTRUCTIONS) continue
    const name = VENEER[shapeHash(routineShape(r))]
    if (name) seen.set(name, [...(seen.get(name) ?? []), r.address])
  }
  for (const [name, at] of seen) if (at.length === 1) fp.veneer[at[0]!] = name
  // Main__ is where the story starts (v1–5, v8: the initial PC is just past its header), if it's Inform's.
  if (fp.compiler === 'inform6') {
    const main = story.code.routines.find(r => r.address === header.initialPc - 1)
    if (main && main.locals === 0 && !fp.veneer[main.address]) fp.veneer[main.address] = 'Main__'
  }
  return fp
}
