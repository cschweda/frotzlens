import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runReplay } from '../src/index'

const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../../../samples/${name}`, import.meta.url)))

describe('the ZVM oracle', () => {
  it('plays a sample and reads back the header ZVM wrote', async () => {
    const r = await runReplay(sample('dark-cellar.z5'), 'zmachine', ['look', 'inventory'], undefined, { seed: 1 })
    expect(r.turns).toHaveLength(3)
    expect(r.turns[0]!.output).toMatch(/Dark Cellar/i)
    expect(r.header![0]).toBe(5)
    // ZVM's screen size: 80 × 25 (headless GlkOte), Standard 1.2 claimed at 0x32.
    expect(r.header![0x21]).toBe(80)
  })

  it('is reproducible with a seed', async () => {
    const story = sample('magic-8-ball.z5')
    const cmds = ['ask ball', 'ask ball', 'ask ball', 'ask ball', 'ask ball']
    const a = await runReplay(story, 'zmachine', cmds, undefined, { seed: 42 })
    const b = await runReplay(story, 'zmachine', cmds, undefined, { seed: 42 })
    expect(a.turns.map(t => t.output)).toEqual(b.turns.map(t => t.output))
  })
})
