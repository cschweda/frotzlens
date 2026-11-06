/**
 * The story files in the repository's samples/ folder (built by
 * scripts/build-samples.mjs): each parses cleanly. With INFODUMP set, each
 * section of each one is also compared with the real infodump — more stories
 * than the fixtures cover (e.g. Mingus II, the v8 builds).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatAbbreviations, formatDictionary, formatHeader, formatObjects, formatTree } from '../src/format/index.js'
import { parseStory } from '../src/index.js'

const SAMPLES = fileURLToPath(new URL('../../../samples/', import.meta.url))
const files = readdirSync(SAMPLES).filter(f => /\.z\d$/.test(f)).sort()

describe('samples/', () => {
  it('has the samples, tiny to large', () => {
    expect(files.length).toBeGreaterThanOrEqual(30)
  })

  it.each(files)('%s parses without errors', (f) => {
    const s = parseStory(new Uint8Array(readFileSync(SAMPLES + f)))
    expect(s.errors).toEqual([])
    expect(s.objects.objects.length).toBeGreaterThan(0)
  })
})

describe.runIf(process.env.INFODUMP)('samples/ against the real infodump (INFODUMP is set)', () => {
  const formats = { i: formatHeader, a: formatAbbreviations, o: formatObjects, t: formatTree, d: formatDictionary }
  it.each(files)('%s: -i -a -o -t -d', (f) => {
    const story = parseStory(new Uint8Array(readFileSync(SAMPLES + f)))
    for (const [opt, format] of Object.entries(formats)) {
      // Resolved first: it runs from samples/, so a relative INFODUMP would otherwise not be found.
      const r = spawnSync(resolve(process.env.INFODUMP!), [`-${opt}`, f], { cwd: SAMPLES, encoding: 'latin1' })
      expect(r.status).toBe(0)
      expect(format(story, { fileName: f }), `-${opt}`).toBe(r.stdout)
    }
  })
})
