/**
 * Differential tests against Ztools' infodump: for every fixture and each of
 * -i -a -o -t -d, our formatter's text must equal infodump's, byte for byte.
 * The golden files come from scripts/golden.sh (see test/golden/PROVENANCE.md).
 *
 * Deliberate differences (none of them occur in these fixtures; each is
 * pinned by its own test in format.test.ts):
 *   - v3 flags2 bits 5–8: infodump prints the next-lower bit's mask in its
 *     "Unknown (0x…)"; we print the bit's own.
 *   - Raw header bytes (the alphabet rows, the Inform version, the serial):
 *     infodump prints them as they are; outside printable ASCII we print '?',
 *     and Unicode-table mappings to control or bidi characters become '?', so
 *     a story can't put a terminal escape in our output (security.test.ts).
 *   - A dictionary word whose last word lacks the end bit: infodump reads on
 *     past the entry until it finds one; we read the entry's 4 or 6 bytes (§13.3).
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatAbbreviations, formatDictionary, formatHeader, formatObjects, formatTree } from '../src/format/index.js'
import { parseStory } from '../src/index.js'
import { GOLDEN_DIR, readStory, storyFiles } from './fixtures.js'

const FORMATS = {
  i: formatHeader,
  a: formatAbbreviations,
  o: formatObjects,
  t: formatTree,
  d: formatDictionary,
} as const

describe.each(storyFiles())('%s matches infodump', (file) => {
  const story = parseStory(readStory(file))
  const name = file.replace(/\.z\d$/, '')

  it('parses without errors', () => {
    expect(story.errors).toEqual([])
  })

  it.each(Object.keys(FORMATS) as (keyof typeof FORMATS)[])('-%s', (opt) => {
    const golden = `${GOLDEN_DIR}${name}.${opt}.txt`
    expect(existsSync(golden), `missing ${golden} — run scripts/golden.sh`).toBe(true)
    expect(FORMATS[opt](story, { fileName: file })).toBe(readFileSync(golden, 'latin1'))
  })
})
