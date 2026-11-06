/**
 * A story file is untrusted input: the CLI prints its text to a terminal and
 * the web app shows it in a page. These pin the defences.
 */
import { describe, expect, it } from 'vitest'
import { Bytes } from '../src/bytes.js'
import { formatHeader } from '../src/format/index.js'
import { parseStory } from '../src/index.js'
import { MAX_TEXT, decodeZchars, defaultExtra, isUnsafeCodePoint, zsciiToText, type TextContext } from '../src/text.js'
import { readStory } from './fixtures.js'

describe('no control or formatting characters out of a Unicode table', () => {
  it.each([
    [0x1b, 'ESC (terminal escape sequences)'],
    [0x07, 'BEL'],
    [0x9b, 'C1 CSI'],
    [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
    [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
    [0x200b, 'ZERO WIDTH SPACE'],
    [0xfeff, 'BOM'],
    [0xd800, 'a lone surrogate'],
  ])('U+%s (%s) becomes "?"', (cp) => {
    expect(isUnsafeCodePoint(cp)).toBe(true)
    expect(zsciiToText(155, { extra: [cp] })).toBe('?')
  })

  it('ordinary characters still come through', () => {
    expect(zsciiToText(155, { extra: [0x263a] })).toBe('☺')
    expect(zsciiToText(155, { extra: [0xe9] })).toBe('é')
  })
})

describe('abbreviation amplification is capped', () => {
  it(`a string of hundreds of huge abbreviations stops at ${MAX_TEXT} characters`, () => {
    const big = 'x'.repeat(60_000)
    const ctx: TextContext = {
      bytes: new Bytes(new Uint8Array(0)),
      version: 5,
      abbreviations: Array.from({ length: 96 }, () => 0),
      abbreviationTexts: Array.from({ length: 96 }, () => big),
      alphabets: null,
      extra: defaultExtra(),
    }
    // 380 abbreviation references: ~22.8 million characters uncapped.
    const zchars = Array.from({ length: 380 }, () => [1, 0]).flat()
    const started = performance.now()
    const out = decodeZchars(ctx, zchars)
    expect(out.length).toBe(MAX_TEXT)
    expect(ctx.truncated).toBe(true)
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('real stories are never cut', () => {
    for (const f of ['mingus-1.z5', 'architect-legacy.z5', 'puny-dark-cellar-v3.z3']) {
      expect(parseStory(readStory(f)).errors).toEqual([])
    }
  })
})

describe('raw header bytes are printed as printable ASCII only', () => {
  it('the serial number', () => {
    const b = readStory('minimal.z5').slice()
    b.set([0x1b, 0x5b, 0x32, 0x4a, 0x07, 0x41], 0x12) // ESC [ 2 J BEL A
    expect(parseStory(b).header.serial).toBe('?[2J?A')
  })

  it('the alphabet rows and the Inform version line', () => {
    const b = readStory('minimal.z5').slice()
    b.set([0x1b, 0x5b, 0x41, 0x9b, 0x00], 0x200) // ESC [ A CSI, then the row's end
    b[0x34] = 0x02
    b[0x35] = 0x00
    b.set([0x36, 0x1b, 0x34, 0x34], 0x3c) // "6" ESC "44"
    const text = formatHeader(parseStory(b), { fileName: 'x' })
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/)
    expect(text).toContain('    "?[A?"\n')
    expect(text).toContain('Inform Version:           6?44\n')
  })
})
