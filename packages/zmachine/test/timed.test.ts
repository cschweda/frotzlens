/**
 * Timed input (docs/11 §7), which the ZVM oracle can't check: an Inform 6 story compiled here
 * with @frotzinc/inform6-wasm. A `[timeout]` in a command script is the timer firing.
 */
import { readFileSync } from 'node:fs'
import { compile } from '@frotzinc/inform6-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { Machine, play } from '../src/index.js'

let story: Uint8Array

beforeAll(async () => {
  const r = await compile(readFileSync(new URL('./fixtures/timed.inf', import.meta.url), 'utf8'), { version: 'z5' })
  if (!r.ok) throw new Error(r.rawOutput)
  story = r.story!
}, 60_000)

describe('timed input', () => {
  it('the read waits through false interrupts and ends on a true one, with terminator 0', () => {
    const r = play(story, ['[timeout]', '[timeout]', '[timeout]', '[timeout]'], { seed: 1 })
    expect(r.turns.map(t => t.output)).toEqual([
      'Type something.',
      '[tick 1]',
      '[tick 2]',
      '[tick 3]\nThe timer ended the read.\nPress a key.',
      'Key: 0',
    ])
    expect(r.stoppedBy).toBe('quit')
  })

  it('a line typed before the timer fires ends the read as usual', () => {
    const r = play(story, ['[timeout]', 'hello', '[key x]'], { seed: 1 })
    expect(r.turns.map(t => t.output)).toEqual(['Type something.', '[tick 1]', 'You typed 5 letters.\nPress a key.', 'Key: 120'])
  })

  it('the stop carries the interval and the routine, for the host’s timer', () => {
    const m = Machine.create(story, { seed: 1 }) as Machine
    const stop = m.run(1_000_000)
    expect(stop).toMatchObject({ kind: 'input-line', timeout: { tenths: 10 } })
  })

  it('a script with its timer events replays the same, every time (design §6, §7)', () => {
    const script = ['[timeout]', 'hello', '[key]']
    expect(play(story, script, { seed: 3 }).turns).toEqual(play(story, script, { seed: 3 }).turns)
  })
})
