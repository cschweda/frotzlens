import { describe, expect, it } from 'vitest'
import { parseStory, type StoryFile } from '../src/index.js'
import { readStory, storyFiles } from './fixtures.js'

describe('the model, on dark-cellar.z5', () => {
  const s = parseStory(readStory('dark-cellar.z5'))

  it('reads the header (§11), with the serial fixed by the fixture builder', () => {
    expect(s.header.version).toBe(5)
    expect(s.header.serial).toBe('000000')
    expect(s.header.checksumOk).toBe(true)
    expect(s.header.inform).toEqual({ compilerVersion: '6.44' })
    expect(s.header.headerExtension?.words).toHaveLength(3)
  })

  it('gives everything addressable a stable id', () => {
    expect(s.objects.objects[0]!.id).toBe('object:1')
    expect(s.globals[0]!.id).toBe('global:0')
    expect(s.abbreviations[95]!.id).toBe('abbrev:95')
    const e = s.dictionary.entries[0]!
    expect(e.id).toBe(`dict:${e.address.toString(16).padStart(4, '0')}`)
  })

  it('finds the lantern by name, inside the room it starts in', () => {
    const lantern = s.objects.objects.find(o => o.shortName.text === 'brass lantern')!
    expect(lantern.number).toBe(27)
    expect(s.objects.objects[lantern.parent - 1]!.shortName.text).toBe('Hall')
  })

  it('decodes Inform dictionary flags', () => {
    const take = s.dictionary.entries.find(e => e.word === 'take')!
    expect(take.inform?.verb).toBe(true)
    const north = s.dictionary.entries.find(e => e.word === 'north')!
    expect(north.inform?.noun).toBe(true)
  })

  it('has 240 globals and 96 abbreviations', () => {
    expect(s.globals).toHaveLength(240)
    expect(s.abbreviations).toHaveLength(96)
  })

  it('maps memory: three regions, and the tables inside the file in address order', () => {
    expect(s.memory.regions.map(r => r.kind)).toEqual(['dynamic', 'static', 'high'])
    const kinds = s.memory.segments.map(g => g.kind)
    expect(kinds).toEqual(expect.arrayContaining(['header', 'abbreviations', 'objects', 'properties', 'globals', 'dictionary']))
    for (const g of s.memory.segments) {
      expect(g.start).toBeLessThan(g.end)
      expect(g.end).toBeLessThanOrEqual(s.memory.size)
    }
    const starts = s.memory.segments.map(g => g.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('survives structured clone (the worker boundary) unchanged', () => {
    expect(structuredClone(s)).toStrictEqual(s)
  })

  it('is plain JSON apart from the story bytes', () => {
    const { bytes: _bytes, ...rest } = s
    expect(JSON.parse(JSON.stringify(rest))).toStrictEqual(rest)
  })
})

describe('packed-address scaling across versions (§1.2.3) shows in the file length', () => {
  it.each([
    ['puny-dark-cellar-v3.z3', 2],
    ['puny-dark-cellar-v4.z4', 4],
    ['dark-cellar.z5', 4],
    ['dark-cellar-v8.z8', 8],
  ])('%s: stored length × %i', (file, scale) => {
    const b = readStory(file)
    const s = parseStory(b)
    expect(s.header.fileLength).toBe(((b[0x1a]! << 8) | b[0x1b]!) * scale)
    expect(s.header.fileLength).toBeLessThanOrEqual(b.length)
  })
})

describe('bad input never throws (error policy)', () => {
  const base = readStory('dark-cellar.z5')
  const codes = (s: StoryFile) => s.errors.map(e => e.code)

  it('an empty file', () => {
    const s = parseStory(new Uint8Array(0))
    expect(codes(s)).toEqual(['truncated'])
  })

  it('shorter than a header', () => {
    expect(codes(parseStory(base.slice(0, 40)))).toEqual(['truncated'])
  })

  it('a bad version byte', () => {
    const b = base.slice()
    b[0] = 0
    expect(codes(parseStory(b))).toContain('bad-header')
    b[0] = 9
    expect(codes(parseStory(b))).toContain('bad-header')
  })

  it.each([1, 2, 6, 7])('version %i: the header is read, the rest isn\'t', (v) => {
    const b = base.slice()
    b[0] = v
    const s = parseStory(b)
    expect(codes(s)).toContain('unsupported-version')
    expect(s.header.version).toBe(v)
    expect(s.objects.objects).toEqual([])
  })

  it('a Blorb file is recognised and reported', () => {
    const blorb = new Uint8Array(64)
    blorb.set([...'FORM'].map(c => c.charCodeAt(0)), 0)
    blorb.set([...'IFRS'].map(c => c.charCodeAt(0)), 8)
    const s = parseStory(blorb)
    expect(s.container).toBe('blorb')
    // Its FORM length is 0: too short even for its type, and no story in it.
    expect(codes(s)).toEqual(['bad-blorb', 'blorb-unsupported'])
  })

  it('a truncated file (corrupt-truncated): an error, and every table that fits', () => {
    const s = parseStory(base.slice(0, 0x2000))
    expect(codes(s)).toContain('truncated')
    expect(s.header.version).toBe(5)
    expect(s.objects.objects.length).toBe(29)
  })

  it('a bad header (corrupt-badheader): pointers outside the file', () => {
    // dark-cellar.z5 is 87 KB, so every 16-bit address is inside it: keep the first 12 KB (all of
    // its tables but routines and strings) and point two tables past that.
    const b = base.slice(0, 0x3000)
    b[0x0a] = 0xff // object table → 0xff0a
    b[0x0b] = 0x0a
    b[0x08] = 0xff // dictionary → 0xff97
    const s = parseStory(b)
    expect(codes(s)).toEqual(expect.arrayContaining(['truncated', 'bad-object', 'bad-dictionary']))
    expect(s.objects.objects).toEqual([])
    expect(s.dictionary.entries).toEqual([])
    expect(s.abbreviations).toHaveLength(96)
    expect(s.globals).toHaveLength(240)
  })

  it('garbage tables inside the file: warnings and errors, never a throw', () => {
    const b = base.slice()
    b[0x0a] = 0xff // object table → 0xff0a, in high memory
    const s = parseStory(b)
    expect(s.errors.length).toBeGreaterThan(0)
    expect(s.dictionary.entries.length).toBe(322)
  })

  it('a flipped checksum is a warning, not an error', () => {
    const b = base.slice()
    b[0x1c] = b[0x1c]! ^ 0xff
    const s = parseStory(b)
    expect(s.errors).toEqual([expect.objectContaining({ code: 'checksum', severity: 'warning' })])
  })

  it('fuzz: 400 random truncations and byte flips of every fixture never throw', () => {
    let seed = 12345
    // A 32-bit LCG, exact with Math.imul (a plain multiply loses the low bits past 2^53).
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff)
    for (const file of storyFiles()) {
      const story = readStory(file)
      for (let i = 0; i < 400 / storyFiles().length; i++) {
        const b = story.slice(0, Math.floor(rand() * story.length))
        for (let k = 0; k < 8; k++) if (b.length) b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256)
        expect(() => parseStory(b)).not.toThrow()
      }
    }
  })
})
