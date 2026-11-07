/**
 * Stories compiled by ZILF, the ZIL compiler, checked against the real Ztools. Local only: set
 * ZIL_STORIES to a folder of ZILF-compiled story files (.z3, .z4, .z5, .z8), with INFODUMP and TXD:
 *
 *   ZIL_STORIES=… INFODUMP=… TXD=… pnpm --filter @frotzinc/zcode test zil
 *
 * Ztools can't read everything in them: ZIL's syntax tables aren't Inform grammar, and reading them
 * as Inform's sends txd and infodump's -m past the end of the file ("game file read error"). So
 * infodump's -i -a -o -t -d are compared, and txd with grammar notes off (txd -g), both modes.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatAbbreviations, formatDictionary, formatHeader, formatObjects, formatTree, formatTxd } from '../src/format/index.js'
import { parseStory } from '../src/index.js'

const DIR = process.env.ZIL_STORIES ? `${resolve(process.env.ZIL_STORIES)}/` : ''
const files = DIR ? readdirSync(DIR).filter(f => /\.z\d$/.test(f)).sort() : []

describe.runIf(DIR && process.env.INFODUMP && process.env.TXD)('ZILF stories against the real Ztools (ZIL_STORIES is set)', () => {
  it('has stories', () => expect(files.length).toBeGreaterThan(0))

  it.each(files)('%s: parses; infodump -i -a -o -t -d; txd -g and txd -g -n', (f) => {
    const story = parseStory(new Uint8Array(readFileSync(DIR + f)))
    expect(story.errors).toEqual([])
    const formats = { i: formatHeader, a: formatAbbreviations, o: formatObjects, t: formatTree, d: formatDictionary }
    for (const [opt, format] of Object.entries(formats)) {
      const r = spawnSync(resolve(process.env.INFODUMP!), [`-${opt}`, f], { cwd: DIR, encoding: 'latin1' })
      expect(r.status).toBe(0)
      expect(format(story, { fileName: f }), `-${opt}`).toBe(r.stdout)
    }
    for (const addresses of [false, true]) {
      const args = addresses ? ['-g', '-n', f] : ['-g', f]
      const r = spawnSync(resolve(process.env.TXD!), args, { cwd: DIR, encoding: 'latin1', maxBuffer: 1 << 28 })
      expect(r.status).toBe(0)
      expect(formatTxd(story, { addresses, noGrammar: true }) === r.stdout, `txd ${args.slice(0, -1).join(' ')}`).toBe(true)
    }
  })
})
