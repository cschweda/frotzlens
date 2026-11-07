/** Differential helpers: frotzplay and ZVM on the same story, commands and seed. */
import { readFileSync } from 'node:fs'
import { runReplay } from '@frotzinc/zmachine-oracle'
import { play } from '../src/index.js'

export const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../../../samples/${name}`, import.meta.url)))

export interface Difference {
  turn: number
  command: string
  ours: string
  zvm: string
}

export async function compare(story: Uint8Array, commands: string[], seed = 1) {
  // ZVM runs in the bytes it's given (its dynamic memory is that buffer), so it gets its own copy.
  const z = await runReplay(story.slice(), 'zmachine', commands, undefined, { seed })
  const o = play(story, commands, { seed, header: { profile: 'zvm' } })
  const differences: Difference[] = []
  const n = Math.max(z.turns.length, o.turns.length)
  for (let i = 0; i < n; i++) {
    const zt = z.turns[i]?.output ?? '(no turn)'
    const ot = o.turns[i]?.output ?? '(no turn)'
    if (zt !== ot) differences.push({ turn: i, command: z.turns[i]?.command ?? o.turns[i]?.command ?? '', ours: ot, zvm: zt })
  }
  return { differences, zvm: z, ours: o }
}

/** The first line where two texts differ, for a readable failure. */
export function firstDifference(a: string, b: string): string {
  const al = a.split('\n')
  const bl = b.split('\n')
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}:\n  ours: ${JSON.stringify(al[i])}\n  zvm:  ${JSON.stringify(bl[i])}`
  }
  return 'identical'
}
