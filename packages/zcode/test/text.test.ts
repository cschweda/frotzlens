import { describe, expect, it } from 'vitest'
import { Bytes } from '../src/bytes.js'
import { decodeZchars, defaultExtra, readZchars, zsciiToText, type TextContext } from '../src/text.js'

const ctx = (over: Partial<TextContext> = {}): TextContext => ({
  bytes: new Bytes(new Uint8Array(0)),
  version: 5,
  abbreviations: [],
  alphabets: null,
  extra: defaultExtra(),
  ...over,
})

/** Z-characters for lowercase text and spaces in A0 (a = 6 … z = 31, space = 0). */
const zc = (s: string) => [...s].map(c => (c === ' ' ? 0 : c.charCodeAt(0) - 97 + 6))

/** Pack Z-characters into words, the last word with the end bit (§3.2). */
function pack(zchars: number[]): Uint8Array {
  const z = [...zchars]
  while (z.length % 3) z.push(5) // §3.7: pad with 5s
  const out = new Uint8Array((z.length / 3) * 2)
  for (let i = 0; i < z.length; i += 3) {
    let w = (z[i]! << 10) | (z[i + 1]! << 5) | z[i + 2]!
    if (i + 3 >= z.length) w |= 0x8000
    out[(i / 3) * 2] = w >> 8
    out[(i / 3) * 2 + 1] = w & 0xff
  }
  return out
}

describe('Z-character decoding (§3)', () => {
  it('A0 letters and spaces', () => {
    expect(decodeZchars(ctx(), zc('hello world'))).toBe('hello world')
  })

  it('4 shifts the next character to A1, 5 to A2; shifts are single in v3+ (§3.2.3)', () => {
    expect(decodeZchars(ctx(), [4, ...zc('h'), ...zc('i')])).toBe('Hi')
    // A2: Z-char 8 is '0', 9 is '1' (§3.5.3).
    expect(decodeZchars(ctx(), [5, 8, 5, 9, ...zc('x')])).toBe('01x')
  })

  it.each([
    ['4 0 17', [4, 0, 17], ' L'],
    ['5 0 17', [5, 0, 17], ' 9'],
    ['4 0 0 17', [4, 0, 0, 17], '  L'],
    ['4 4 17', [4, 4, 17], 'L'],
    ['4 5 17', [4, 5, 17], '9'],
    ['5 4 17', [5, 4, 17], 'L'],
  ])('shifts as infodump reads them: %s → %j', (_name, zchars, text) => {
    expect(decodeZchars(ctx(), zchars)).toBe(text)
  })

  it('A2 7 is a newline, and A2 6 begins a 10-bit ZSCII code (§3.4)', () => {
    expect(decodeZchars(ctx(), [5, 7])).toBe('\n')
    // ZSCII 64 '@' = 0b00010_00000 → Z-chars 2, 0.
    expect(decodeZchars(ctx(), [5, 6, 2, 0])).toBe('@')
    // ZSCII 155 is 'ä' by default (§3.8.5.3): 155 = 0b00100_11011 → 4, 27.
    expect(decodeZchars(ctx(), [5, 6, 4, 27])).toBe('ä')
  })

  it('an incomplete construct at the end is dropped (§3.6.1)', () => {
    expect(decodeZchars(ctx(), [...zc('ab'), 5, 6, 2])).toBe('ab')
    expect(decodeZchars(ctx(), [...zc('ab'), 1])).toBe('ab')
  })

  it('padding 5s at the end print nothing (§3.7)', () => {
    expect(decodeZchars(ctx(), [...zc('ab'), 5, 5, 5, 5])).toBe('ab')
  })

  it('abbreviations expand once, and not inside another abbreviation (§3.3, §3.3.1)', () => {
    // An abbreviation string "the " at byte 0, then one that tries to nest abbreviation 0.
    const the = pack([...zc('the'), 0])
    const nested = pack([1, 0, ...zc('x')])
    const data = new Uint8Array(the.length + nested.length)
    data.set(the)
    data.set(nested, the.length)
    const abbreviations = [0, the.length]
    const c = ctx({ bytes: new Bytes(data), abbreviations })
    // Abbreviation 32×(1−1)+0 = 0, then "cat".
    expect(decodeZchars(c, [1, 0, ...zc('cat')])).toBe('the cat')
    // Abbreviation 1 refers to abbreviation 0 inside itself: not expanded.
    expect(decodeZchars(c, [1, 1])).toBe('x')
  })

  it('a custom alphabet table replaces the defaults, except A2 6 and 7 (§3.5.5)', () => {
    const custom = [
      Array.from({ length: 26 }, (_, i) => 'zyxwvutsrqponmlkjihgfedcba'.charCodeAt(i)),
      Array.from({ length: 26 }, (_, i) => 'ZYXWVUTSRQPONMLKJIHGFEDCBA'.charCodeAt(i)),
      Array.from({ length: 26 }, () => '*'.charCodeAt(0)),
    ]
    const c = ctx({ alphabets: custom })
    expect(decodeZchars(c, [6, 7, 4, 6])).toBe('zyZ')
    expect(decodeZchars(c, [5, 7, 5, 9])).toBe('\n*')
  })

  it('reads Z-characters through the word with the end bit (§3.2)', () => {
    const data = pack(zc('lantern'))
    const { zchars, length } = readZchars(new Bytes(data), 0)
    expect(length).toBe(data.length)
    expect(decodeZchars(ctx(), zchars)).toBe('lantern')
  })
})

describe('ZSCII output (§3.8)', () => {
  const c = { extra: defaultExtra() }
  it('ASCII, newline, and nothing for 0', () => {
    expect(zsciiToText(65, c)).toBe('A')
    expect(zsciiToText(13, c)).toBe('\n')
    expect(zsciiToText(0, c)).toBe('')
  })
  it('the default extra characters 155–223', () => {
    expect(zsciiToText(155, c)).toBe('ä')
    expect(zsciiToText(161, c)).toBe('ß')
    expect(zsciiToText(223, c)).toBe('¿')
    expect(defaultExtra()).toHaveLength(69)
  })
  it('a Unicode translation table overrides them (§3.8.5.2)', () => {
    expect(zsciiToText(155, { extra: [0x263a] })).toBe('☺')
    expect(zsciiToText(156, { extra: [0x263a] })).toBe('?')
  })
  it('codes with no output meaning become "?"', () => {
    expect(zsciiToText(7, c)).toBe('?')
    expect(zsciiToText(252, c)).toBe('?')
  })
})
