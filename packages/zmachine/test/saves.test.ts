/**
 * Saving and restoring (docs/12 §2): Quetzal files that round-trip here, and restore across
 * frotzplay and ZVM in both directions.
 */
import { runReplay } from '@frotzinc/zmachine-oracle'
import { describe, expect, it } from 'vitest'
import { Machine, play, readQuetzal } from '../src/index.js'
import { readSample } from './samples.js'

/** Each story, and commands that change something before the save. */
const STORIES: Record<string, string[]> = {
  'puny-dark-cellar.z3': ['take lantern', 'down'],
  'puny-dark-cellar.z4': ['take lantern', 'down'],
  'dark-cellar.z5': ['take lantern', 'down'],
  'puny-dark-cellar.z5': ['take lantern', 'down'],
  'mingus-1.z8': ['look', 'take ticket', 'inventory'],
}
const zvmHeader = { profile: 'zvm' as const, standard: [1, 2] as [number, number] }
const staticBase = (s: Uint8Array) => (s[14]! << 8) | s[15]!

describe('save and restore', () => {
  it('round trip: what happens after a save is undone by restoring it', () => {
    for (const [file, setup] of Object.entries(STORIES)) {
      const r = play(readSample(file), [...setup, 'inventory', 'save', 'drop all', 'inventory', 'restore', 'inventory'], { seed: 1 })
      const t = r.turns.map(x => x.output)
      const n = setup.length + 1
      expect(t[n + 1], file).toBe('Ok.')
      expect(t[n + 3], `${file}: the drop changed something`).not.toBe(t[n])
      expect(t[n + 5], `${file}: restored to the inventory at the save`).toBe(t[n])
    }
  })

  for (const [file, setup] of Object.entries(STORIES)) {
    const before = [...setup, 'save']
    const after = ['restore', 'inventory', 'look']
    it(`${file}: saved here or in ZVM, restored here or in ZVM, the game goes on the same`, async () => {
      const story = readSample(file)
      const oursFiles = new Map<string, Uint8Array>()
      const zvmFiles = new Map<string, Uint8Array>()
      play(story, before, { seed: 1, header: zvmHeader, files: oursFiles })
      await runReplay(story.slice(), 'zmachine', before, undefined, { seed: 1, files: zvmFiles })
      const ours = oursFiles.get('save')!
      const zvm = zvmFiles.get('save')!
      // With the same Standard revision claimed, the two files are the same bytes.
      expect(Array.from(ours)).toEqual(Array.from(zvm))
      const orig = story.subarray(0, staticBase(story))
      expect(readQuetzal(ours, orig).frames).toEqual(readQuetzal(zvm, orig).frames)

      const transcripts: string[] = []
      for (const saved of [ours, zvm]) {
        transcripts.push(JSON.stringify(play(story, after, { seed: 5, header: zvmHeader, files: new Map([['save', saved]]) }).turns.slice(1).map(t => t.output)))
        transcripts.push(JSON.stringify((await runReplay(story.slice(), 'zmachine', after, undefined, { seed: 5, files: new Map([['save', saved.slice()]]) })).turns.slice(1).map(t => t.output)))
      }
      expect(new Set(transcripts).size).toBe(1)
      expect(JSON.parse(transcripts[0]!)[0]).toBe('Ok.')
    })
  }

  it('a restore with no file, a damaged file, or another story’s fails, and says why; the game goes on', () => {
    const story = readSample('dark-cellar.z5')
    expect(play(story, ['restore', 'look'], { seed: 1 }).turns[1]!.output).toMatch(/fail/i)

    const other = new Map<string, Uint8Array>()
    play(readSample('hermit.z5'), ['save'], { seed: 1, files: other })
    for (const [what, bytes] of [
      ['another story', other.get('save')!],
      ['damaged', Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)],
      ['cut short', other.get('save')!.slice(0, 40)],
    ] as const) {
      const m = Machine.create(story, { seed: 1 }) as Machine
      m.run(1e7)
      m.resume({ line: 'restore' })
      expect(m.run(1e7).kind, what).toBe('restore')
      const notice = m.resume({ restore: bytes })
      expect(notice, what).toMatchObject({ code: 'bad-save' })
      expect(notice!.message, what).toMatch(/save file/)
      expect(m.run(1e7).kind, what).toBe('input-line')
      expect(m.flushText(), what).toMatch(/fail/i)
    }
  })

  it('a save the host couldn’t keep fails as the story sees it', () => {
    const m = Machine.create(readSample('dark-cellar.z5'), { seed: 1 }) as Machine
    m.run(1e7)
    m.resume({ line: 'save' })
    const stop = m.run(1e7)
    expect(stop.kind).toBe('save')
    m.resume({ saved: false })
    m.run(1e7)
    expect(m.flushText()).toMatch(/fail/i)
  })
})

describe('snapshots (docs/12 §3)', () => {
  it('a snapshot mid-game, restored into a fresh machine, plays on identically', () => {
    for (const file of ['puny-locked-chest.z3', 'locked-chest.z5', 'mingus-1.z8']) {
      const story = readSample(file)
      const commands = ['look', 'inventory', 'take all', 'north', 'south', 'east', 'west', 'examine me', 'score']
      const m = Machine.create(story, { seed: 9 }) as Machine
      m.run(1e7)
      m.flushText()
      for (const c of commands.slice(0, 4)) {
        m.resume({ line: c })
        m.run(1e7)
      }
      m.flushText()
      const snap = JSON.parse(JSON.stringify(m.snapshot(), (_k, v) => (v instanceof Uint8Array ? { u8: Array.from(v) } : v)), (_k, v) => (v && v.u8 ? Uint8Array.from(v.u8) : v))
      const copy = Machine.fromSnapshot(story, snap, { seed: 9 }) as Machine
      expect(copy instanceof Machine, file).toBe(true)
      const rest = (x: Machine) =>
        commands.slice(4).map(c => {
          x.resume({ line: c })
          x.run(1e7)
          return x.flushText()
        })
      expect(rest(copy), file).toEqual(rest(m))
    }
  })

  it('a snapshot from another story is refused', () => {
    const snap = (Machine.create(readSample('hermit.z5'), { seed: 1 }) as Machine).snapshot()
    const r = Machine.fromSnapshot(readSample('dark-cellar.z5'), snap, { seed: 1 })
    expect(r).toMatchObject({ fault: { code: 'bad-save' } })
  })
})
