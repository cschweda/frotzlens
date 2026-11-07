/**
 * The decompiler's check, in the product as in the tests (docs/09-decompiler.md §4): compile the
 * source again, and compare each routine with the original's, instruction by instruction, addresses
 * by what they point to. decompileChecked uses it to write as statements only the routines whose
 * statements compile back to the same instructions, and the rest as assembly.
 */
import type { Symbols } from '../debug.js'
import type { Routine } from '../routines.js'
import type { StoryFile } from '../types.js'
import { decompileInform, type Decompiled } from './decompile.js'

/** A routine's instructions, every address as what's there: a routine by its place, a string by its text, … */
function shapeOf(story: StoryFile, r: Routine, index: Map<number, number>): string {
  const v = story.header.version
  const scale = v <= 3 ? 2 : v <= 5 ? 4 : 8
  const strings = new Map(story.strings.map(s => [s.address / scale, s.text]))
  const dict = new Map(story.dictionary.entries.map(e => [e.address, e.word]))
  const arraysAt = story.header.globals + 480
  const value = (w: number) => {
    const out: string[] = []
    if (w >= 256) {
      const ri = index.get(w * scale)
      if (ri !== undefined) out.push(`R${ri}`)
      const s = strings.get(w)
      if (s !== undefined) out.push(`S${s}`)
      const d = dict.get(w)
      if (d !== undefined) out.push(`D${d}`)
      if (w >= arraysAt && w < (story.grammar?.address ?? story.header.staticMemory)) out.push(`A${w - arraysAt}`)
    }
    return out.length ? out.join('|') : String(w)
  }
  const at = new Map(r.instructions.map((i, k) => [i.address, k]))
  return `${r.locals}:${r.initialValues.join(',')}:` + r.instructions.map(i => {
    const ops = i.operands.map(o => (o.kind === 'variable' ? `v${o.value}` : o.kind === 'large' ? `L${value(o.value)}` : `s${o.value}`)).join(',')
    const b = i.branch ? (i.branch.returns !== undefined ? `?${i.branch.onTrue}${i.branch.returns}` : `?${i.branch.onTrue}@${at.get(i.branch.target!)}`) : ''
    const j = i.jumpTarget !== undefined ? `@${at.get(i.jumpTarget)}` : ''
    return `${i.name} ${ops}${j}${i.store !== undefined ? `>${i.store}` : ''}${b}${i.text ? `"${i.text.text}"` : ''}`
  }).join(';')
}

/** Readings match when they share one (a number can be a routine's address and a word's). */
function same(a: string, b: string): boolean {
  if (a === b) return true
  const x = a.split(';')
  const y = b.split(';')
  if (x.length !== y.length) return false
  return x.every((p, k) => {
    const q = y[k]!
    if (p === q) return true
    const tp = p.split(/(?<=[ ,])|(?=[,>?@"])/)
    const tq = q.split(/(?<=[ ,])|(?=[,>?@"])/)
    if (tp.length !== tq.length) return false
    return tp.every((t, n) => t === tq[n] || (t.startsWith('L') && tq[n]!.startsWith('L') && t.slice(1).split('|').some(r => tq[n]!.slice(1).split('|').includes(r))))
  })
}

/** The original's routines (by their place in the code) that the recompiled story has otherwise. */
export function differingRoutines(original: StoryFile, recompiled: StoryFile): number[] {
  const a = original.code.routines
  const b = recompiled.code.routines
  const ia = new Map(a.map((r, k) => [r.address, k]))
  const ib = new Map(b.map((r, k) => [r.address, k]))
  const out: number[] = []
  for (let k = 0; k < a.length; k++) if (!b[k] || !same(shapeOf(original, a[k]!, ia), shapeOf(recompiled, b[k]!, ib))) out.push(a[k]!.address)
  return out
}

/**
 * decompileInform with statements (6b), checked: the source is compiled again (`compile`, e.g.
 * @frotzinc/inform6-wasm's), and any routine that doesn't come back the same, or doesn't compile (by
 * the error's line), is written as assembly, until they all do or `rounds` run out. `statements` says
 * which routines (by address) are statements; `differing` lists those that still differed in the
 * last compile (empty when the check came out clean).
 */
export async function decompileChecked(
  story: StoryFile,
  symbols: Symbols,
  compile: (source: string) => Promise<{ story?: StoryFile; errorLines?: number[] }>,
  rounds = 6,
): Promise<Decompiled & { statements: number[]; differing: number[]; compiled: boolean }> {
  const asm = new Set<number>()
  let last: Decompiled = decompileInform(story, { symbols })
  let differing: number[] = []
  let compiled = false
  for (let round = 0; round < rounds; round++) {
    const d = decompileInform(story, { symbols, statements: a => !asm.has(a) })
    const out = await compile(d.source)
    if (!out.story) {
      // A statement that doesn't compile: its routine goes back to assembly (by the error's line).
      const bad = (out.errorLines ?? []).map(l => d.lineRoutines[l - 1]).filter((a): a is number => a !== undefined && !asm.has(a))
      if (!bad.length) break
      for (const a of bad) asm.add(a)
      continue
    }
    compiled = true
    differing = differingRoutines(story, out.story)
    last = d
    // Only a routine written as statements can be put right; another differs because they moved it.
    const written = new Set(d.statementRoutines)
    const fresh = differing.filter(a => !asm.has(a) && written.has(a))
    if (!fresh.length) break
    for (const a of fresh) asm.add(a)
  }
  // The source as it finally stands (the last round may have put more routines back to assembly).
  last = compiled ? decompileInform(story, { symbols, statements: a => !asm.has(a) }) : decompileInform(story, { symbols })
  const statements = last.statementRoutines.filter(a => !asm.has(a))
  return { ...last, statements, differing, compiled }
}
