/** What the interpreter writes into the header (§11): under the 'zvm' profile, exactly what ZVM writes (docs/11 §5). */
import { runReplay } from '@frotzinc/zmachine-oracle'
import { describe, expect, it } from 'vitest'
import { Machine } from '../src/index.js'
import { readSample, sampleFiles } from './samples.js'

/** The bytes an interpreter sets: Flags 1, Flags 2's low byte, interpreter number and version, screen and font sizes, the Standard revision. */
const SET_BY_INTERPRETER = [0x01, 0x11, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x32, 0x33]

describe("the header, as ZVM writes it", () => {
  for (const file of sampleFiles()) {
    it(file, async () => {
      const story = readSample(file)
      const zvm = (await runReplay(story.slice(), 'zmachine', [], undefined, { seed: 1 })).header!
      const m = Machine.create(story, { seed: 1, header: { profile: 'zvm' } }) as Machine
      m.run(10_000_000)
      const ours = m.state.memory
      const show = (h: ArrayLike<number>) => SET_BY_INTERPRETER.map(a => `${a.toString(16)}:${h[a]}`).join(' ')
      expect(show(ours)).toBe(show(zvm))
    })
  }
})

describe("the header, as frotzplay writes it for players ('standard')", () => {
  it('claims Standard 1.1, timed input, and its own interpreter number', () => {
    const m = Machine.create(readSample('dark-cellar.z5'), { seed: 1, header: { screen: { width: 72, height: 30 } } }) as Machine
    const h = m.state.memory
    expect([h[0x32], h[0x33]]).toEqual([1, 1])
    expect(h[0x01]! & 0x80).toBe(0x80)
    expect(h[0x1e]).toBe(6)
    expect([h[0x20], h[0x21]]).toEqual([30, 72])
  })
})
