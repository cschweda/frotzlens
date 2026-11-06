/**
 * guarded() rethrows anything that isn't a bad-file error, so a bug can't pass
 * for one; parseStory still never throws, and reports the bug as `internal`.
 */
import { describe, expect, it, vi } from 'vitest'
import { readStory } from './fixtures.js'

vi.mock('../src/objects.js', () => ({
  parseObjects: () => {
    throw new TypeError('a bug, not a bad file')
  },
}))

const { parseStory } = await import('../src/index.js')

describe('a bug inside the parser', () => {
  it('comes back as an internal error, not a throw and not a bad-object error', () => {
    const s = parseStory(readStory('dark-cellar.z5'))
    expect(s.errors).toEqual([expect.objectContaining({ code: 'internal', severity: 'error', message: expect.stringContaining('a bug, not a bad file') })])
    expect(s.header.version).toBe(5)
  })
})
