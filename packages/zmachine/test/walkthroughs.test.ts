/**
 * The phase's deliverable (docs/11): every sample, played through with its walkthrough, gives the
 * same normalized transcript in frotzplay's interpreter as in ZVM, turn by turn, with the same seed.
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compare, firstDifference } from './diff.js'
import { readSample, readScript, sampleFiles } from './samples.js'

const walkthrough = (file: string) => new URL(`../../../samples/walkthroughs/${file.replace(/\.z\d$/, '')}.txt`, import.meta.url)

describe('every sample, played through, is the same as in ZVM', () => {
  for (const file of sampleFiles().filter(f => existsSync(walkthrough(f)))) {
    for (const seed of [1, 2]) {
      it(`${file} (seed ${seed})`, async () => {
        const commands = readScript(walkthrough(file))
        const { differences, ours, zvm } = await compare(readSample(file), commands, seed)
        const d = differences[0]
        expect(d ? `turn ${d.turn} (${d.command || 'banner'}): ${firstDifference(d.ours, d.zvm)}` : 'same').toBe('same')
        // Both played the whole walkthrough (or both stopped at the same turn).
        expect(ours.turns.length).toBe(zvm.turns.length)
      })
    }
  }
})
