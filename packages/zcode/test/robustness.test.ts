/**
 * A damaged table keeps what it can: one bad entry ends that table there (or
 * is skipped), the rest of the model still comes back, and nothing points past
 * the end of the file. Plus the header checks that guard the rest.
 */
import { describe, expect, it } from 'vitest'
import { unpack } from '../src/address.js'
import { formatHeader, formatTree } from '../src/format/index.js'
import { MAX_TREE_TEXT } from '../src/format/tree.js'
import { isUnsafeCodePoint, zsciiToText } from '../src/text.js'
import { parseStory } from '../src/index.js'
import { readStory } from './fixtures.js'

const word = (b: Uint8Array, a: number) => (b[a]! << 8) | b[a + 1]!
const setWord = (b: Uint8Array, a: number, v: number) => {
  b[a] = v >> 8
  b[a + 1] = v & 0xff
}
const codes = (s: ReturnType<typeof parseStory>) => s.errors.map(e => e.code)

describe('one bad entry, not the whole table', () => {
  it('a property table outside the file stops the object table there and keeps the objects before it', () => {
    const b = readStory('minimal.z5').slice()
    // minimal.z5 has 4 objects; point object 3's property table past the end (v5 entries: 14 bytes).
    const first = word(b, 0x0a) + 63 * 2
    setWord(b, first + 2 * 14 + 12, 0xfff0)
    const s = parseStory(b)
    expect(s.objects.objects.map(o => o.shortName.text)).toEqual(['Class', 'Object'])
    expect(codes(s)).toContain('bad-object')
  })

  it('a dictionary that claims more words than the file holds keeps the words that are there', () => {
    const b = readStory('dark-cellar.z5')
    const d = word(b, 0x08)
    const n = b[d]!
    const entryLength = b[d + 1 + n]!
    // Cut the file in the middle of the dictionary: 100 whole entries remain.
    const cut = b.slice(0, d + 4 + n + 100 * entryLength + 3)
    const s = parseStory(cut)
    expect(s.dictionary.entries).toHaveLength(100)
    expect(s.dictionary.entries[0]!.word).toBe('.')
    expect(codes(s)).toContain('bad-dictionary')
  })

  it('one unreadable abbreviation is an error; the other 95 stay', () => {
    const b = readStory('abbrev.z5').slice()
    const table = word(b, 0x18)
    setWord(b, table + 2 * 40, 0x7ff8) // abbreviation 40 → byte 0xfff0, past the end of this 2 KB file
    const s = parseStory(b)
    expect(s.abbreviations).toHaveLength(96)
    expect(s.abbreviations[32]!.text).toBe('the ')
    expect(s.abbreviations[40]!.text).toBe('')
    expect(s.errors).toContainEqual(expect.objectContaining({ code: 'bad-text', message: expect.stringContaining('Abbreviation 40') }))
  })
})

describe('header checks', () => {
  it('a declared file length shorter than the header is a bad header (and no checksum claim)', () => {
    const b = readStory('minimal.z5').slice()
    setWord(b, 0x1a, 8) // 8 × 4 = 32 bytes
    const s = parseStory(b)
    expect(codes(s)).toContain('bad-header')
    expect(s.header.checksumOk).toBe(false)
  })

  it('a truncated file gets the truncation error, not a checksum warning on top', () => {
    const s = parseStory(readStory('dark-cellar.z5').slice(0, 0x3000))
    expect(codes(s)).toContain('truncated')
    expect(codes(s)).not.toContain('checksum')
  })

  it('a header extension longer than the file: the declared length is kept, and reported', () => {
    const b = readStory('minimal.z5').slice()
    const ext = word(b, 0x36)
    setWord(b, ext, 0x4000)
    const s = parseStory(b)
    expect(s.header.headerExtension?.declaredLength).toBe(0x4000)
    expect(s.header.headerExtension!.words.length).toBeLessThan(0x4000)
    expect(codes(s)).toContain('bad-address')
    expect(formatHeader(s, { fileName: 'x' })).toContain('Header extension length:  4000\n')
  })

  it('a terminating-characters table with no 0 before the end of the file is reported', () => {
    const b = readStory('minimal.z5').slice()
    setWord(b, 0x2e, b.length - 2)
    b[b.length - 2] = 129
    b[b.length - 1] = 130
    const s = parseStory(b)
    expect(s.header.terminatingKeys).toEqual([129, 130])
    expect(s.errors).toContainEqual(expect.objectContaining({ code: 'bad-address', message: expect.stringContaining('no 0') }))
  })

  it('globals that run past dynamic memory get a warning', () => {
    const b = readStory('dark-cellar.z5').slice() // big enough that the moved table is still in the file
    setWord(b, 0x0c, word(b, 0x0e) - 10)
    const s = parseStory(b)
    expect(s.globals).toHaveLength(240)
    expect(s.errors).toContainEqual(expect.objectContaining({ code: 'bad-address', severity: 'warning' }))
  })

  it('a Blorb file reports version 0, not its first byte', () => {
    const blorb = new Uint8Array(64)
    blorb.set([...'FORMxxxxIFRS'].map(c => c.charCodeAt(0)))
    expect(parseStory(blorb).header.version).toBe(0)
  })
})

describe('the memory map never points past the file', () => {
  it.each([
    ['globals', 0x0c],
    ['dictionary', 0x08],
    ['abbreviations', 0x18],
  ])('a %s pointer past the end: no segment for it', (kind, at) => {
    const b = readStory('minimal.z5').slice()
    setWord(b, at, 0xff00)
    const s = parseStory(b)
    for (const g of [...s.memory.segments, ...s.memory.regions]) {
      expect(g.end, g.kind).toBeLessThanOrEqual(b.length)
      expect(g.start, g.kind).toBeLessThan(g.end)
    }
    expect(s.memory.segments.map(g => g.kind)).not.toContain(kind)
  })

  it('maps the header extension and terminating-characters tables too', () => {
    const kinds = parseStory(readStory('minimal.z5')).memory.segments.map(g => g.kind)
    expect(kinds).toEqual(expect.arrayContaining(['header-extension', 'terminating-chars']))
  })
})

describe('the object tree', () => {
  /** A v5 story whose object table is one long parent → child chain of n objects. */
  function chain(N: number): Uint8Array {
    const base = readStory('minimal.z5')
    const objects = 0x40
    const first = objects + 63 * 2
    const props = first + N * 14
    const b = new Uint8Array(props + 2 + 64)
    b.set(base.subarray(0, 0x40))
    setWord(b, 0x0a, objects)
    setWord(b, 0x08, 0)
    setWord(b, 0x18, 0)
    setWord(b, 0x36, 0)
    setWord(b, 0x2e, 0)
    setWord(b, 0x0e, b.length)
    setWord(b, 0x0c, props + 2)
    setWord(b, 0x1a, b.length / 4)
    for (let n = 1; n <= N; n++) {
      const e = first + (n - 1) * 14
      setWord(b, e + 6, n - 1) // parent
      setWord(b, e + 10, n < N ? n + 1 : 0) // child
      setWord(b, e + 12, props) // every object shares one empty property table
    }
    return b
  }

  it('a 1,500-deep chain prints in full, without overflowing the stack', () => {
    const s = parseStory(chain(1500))
    expect(s.objects.objects).toHaveLength(1500)
    const tree = formatTree(s, { fileName: 'x', width: 0 }).trimEnd().split('\n')
    expect(tree.at(-1)).toBe(`${' . '.repeat(1499)}[1500] ""`)
  })

  it(`a 4,000-deep chain (~24 MB of indentation) stops at ${MAX_TREE_TEXT.toLocaleString('en')} characters and says so`, () => {
    // 4,000 objects keep the shared property table below 0xFFFF (it's a 16-bit pointer).
    const s = parseStory(chain(4000))
    expect(s.objects.objects).toHaveLength(4000)
    const text = formatTree(s, { fileName: 'x', width: 0 })
    expect(text.length).toBeLessThan(MAX_TREE_TEXT + 1000)
    expect(text.trimEnd().split('\n').at(-1)).toMatch(/^\*\*\* The tree is cut short here/)
  })
})

describe('more characters that never come out of a Unicode table', () => {
  it.each([
    ['U+00AD SOFT HYPHEN', 0x00ad],
    ['U+2028 LINE SEPARATOR', 0x2028],
    ['U+2029 PARAGRAPH SEPARATOR', 0x2029],
    ['U+E0041 TAG LATIN CAPITAL LETTER A', 0xe0041],
    ['U+110000, past Unicode', 0x110000],
  ])('%s', (_name, cp) => {
    expect(isUnsafeCodePoint(cp)).toBe(true)
    expect(zsciiToText(155, { extra: [cp] })).toBe('?')
  })
})

describe('unpack (§1.2.3)', () => {
  it('scales by version, and v6–7 need their offset', () => {
    expect(unpack(0x100, 3)).toBe(0x200)
    expect(unpack(0x100, 5)).toBe(0x400)
    expect(unpack(0x100, 8)).toBe(0x800)
    expect(unpack(0x100, 6, 0x10)).toBe(0x400 + 0x80)
    expect(() => unpack(0x100, 7)).toThrow(RangeError)
  })
})
