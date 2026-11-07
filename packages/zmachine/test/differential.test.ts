/**
 * frotzplay against ZVM (docs/11 §9): the same story, commands and seed must give the same
 * normalized transcript, turn by turn.
 */
import { describe, expect, it } from 'vitest'
import { compare, firstDifference } from './diff.js'
import { readSample, readScript, sampleFiles } from './samples.js'

const generic = readScript(new URL('./scripts/generic.txt', import.meta.url))

describe('every sample plays as it does in ZVM', () => {
  for (const file of sampleFiles()) {
    it(file, async () => {
      const { differences, ours } = await compare(readSample(file), generic, 1)
      const d = differences[0]
      expect(d ? `turn ${d.turn} (${d.command || 'banner'}): ${firstDifference(d.ours, d.zvm)}` : 'same').toBe('same')
      // The comparison is of real text, not two empty transcripts (minimal.z5 is an empty Main: it prints nothing and quits).
      if (file !== 'minimal.z5') expect(ours.turns[0]!.output.length).toBeGreaterThan(0)
    })
  }
})
