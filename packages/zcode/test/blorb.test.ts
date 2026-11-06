/**
 * Blorb unwrap (Blorb spec 2.0): a story wrapped in a Blorb parses exactly as
 * the bare story does, and the Blorb's chunks, index, cover and metadata come
 * back alongside. The Blorbs are built here, around a fixture.
 */
import { describe, expect, it } from 'vitest'
import { formatTxd } from '../src/format/index.js'
import { blorbStory, parseStory, readBlorb } from '../src/index.js'
import { readStory } from './fixtures.js'

const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const chunk = (type: string, data: ArrayLike<number>) => {
  const out = [...ascii(type), ...be32(data.length), ...Array.from(data)]
  if (data.length & 1) out.push(0)
  return out
}

/**
 * A Blorb of `parts` (type, data), with an RIdx first naming `index` entries (usage, number, the
 * part's position in `parts`). The FORM length is computed unless `formLength` is given.
 */
function blorb(parts: [string, ArrayLike<number>][], index: [string, number, number][] = [], formLength?: number): Uint8Array {
  const ridx = index.length ? 12 + index.length * 12 : 0 // its own chunk, header included
  const offsets: number[] = []
  let at = 12 + ridx
  for (const [, d] of parts) {
    offsets.push(at)
    at += 8 + d.length + (d.length & 1)
  }
  const body: number[] = []
  if (index.length) {
    body.push(...chunk('RIdx', [...be32(index.length), ...index.flatMap(([u, n, p]) => [...ascii(u), ...be32(n), ...be32(offsets[p] ?? 0xffff)])]))
  }
  for (const [t, d] of parts) body.push(...chunk(t, d))
  return new Uint8Array([...ascii('FORM'), ...be32(formLength ?? 4 + body.length), ...ascii('IFRS'), ...body])
}

const story = readStory('dark-cellar.z5')
const META = `<?xml version="1.0" encoding="UTF-8"?>
<ifindex version="1.0" xmlns="http://babel.ifarchive.org/protocol/iFiction/"><story><bibliographic>
<title>The Dark &amp; the Cellar</title><author>A. N. Author</author></bibliographic></story></ifindex>`
const PICT = [0x89, ...ascii('PNG'), 1, 2, 3] // 7 bytes: an odd length, so a pad byte follows

describe('Blorb', () => {
  it('unwraps the story: the same model and the same disassembly as the bare file', () => {
    const file = blorb(
      [['ZCOD', story], ['PNG ', PICT], ['Fspc', be32(1)], ['IFmd', new TextEncoder().encode(META)]],
      [['Exec', 0, 0], ['Pict', 1, 1]],
    )
    const bare = parseStory(story)
    const s = parseStory(file)
    expect(s.container).toBe('blorb')
    expect(s.errors).toEqual(bare.errors)
    expect(s.bytes).toEqual(story)
    expect(s.header).toEqual(bare.header)
    expect(formatTxd(s)).toBe(formatTxd(bare))
    expect(s.blorb!.chunks.map(c => c.type)).toEqual(['RIdx', 'ZCOD', 'PNG ', 'Fspc', 'IFmd'])
    expect(s.blorb!.resources).toEqual([
      { usage: 'Exec', number: 0, offset: s.blorb!.chunks[1]!.offset, type: 'ZCOD' },
      { usage: 'Pict', number: 1, offset: s.blorb!.chunks[2]!.offset, type: 'PNG ' },
    ])
    expect(s.blorb!.frontispiece).toBe(1)
    expect(s.blorb!.title).toBe('The Dark & the Cellar')
    expect(s.blorb!.author).toBe('A. N. Author')
  })

  it('steps over the pad byte after an odd-length chunk', () => {
    const s = parseStory(blorb([['PNG ', PICT], ['ZCOD', story]]))
    expect(s.blorb!.chunks.map(c => [c.type, c.length])).toEqual([['PNG ', 7], ['ZCOD', story.length]])
    expect(s.errors).toEqual([])
  })

  it('finds the story without an index, and when the index points nowhere', () => {
    expect(parseStory(blorb([['ZCOD', story]])).header.version).toBe(5)
    const s = parseStory(blorb([['ZCOD', story]], [['Exec', 0, 9]]))
    expect(s.header.version).toBe(5)
    expect(s.errors.map(e => e.code)).toEqual(['bad-blorb'])
    expect(s.errors[0]!.message).toMatch(/isn't a chunk/)
  })

  it('reads what it can of a Blorb cut short, and says so', () => {
    const whole = blorb([['ZCOD', story], ['PNG ', PICT]])
    const s = parseStory(whole.subarray(0, whole.length - 4))
    expect(s.header.version).toBe(5)
    expect(s.errors.map(e => e.code)).toEqual(['bad-blorb', 'bad-blorb'])
  })

  it('says a Glulx Blorb is not a Z-machine story', () => {
    const s = parseStory(blorb([['GLUL', [1, 2, 3, 4]]], [['Exec', 0, 0]]))
    expect(s.container).toBe('blorb')
    expect(s.errors.map(e => e.code)).toEqual(['blorb-unsupported'])
    expect(s.errors[0]!.message).toMatch(/Glulx/)
    expect(s.blorb!.chunks.map(c => c.type)).toEqual(['RIdx', 'GLUL'])
  })

  it('a chunk length past the end of the file ends the walk, not the parse', () => {
    const file = blorb([['ZCOD', story]])
    file.set(be32(0x7fffffff), 16) // the ZCOD chunk's length
    const problems: string[] = []
    const b = readBlorb(file, problems)
    expect(b.chunks).toEqual([])
    expect(blorbStory(file, b)).toBeUndefined()
    expect(problems.join(' ')).toMatch(/runs past the end/)
    expect(parseStory(file).errors.map(e => e.code)).toEqual(['bad-blorb', 'blorb-unsupported'])
  })

  it('a Blorb inside a Blorb is unwrapped too', () => {
    const s = parseStory(blorb([['ZCOD', blorb([['ZCOD', story]])]]))
    expect(s.header.version).toBe(5)
    expect(s.bytes).toEqual(story)
  })
})
