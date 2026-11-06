/** Real compiles through inform6.wasm under Node. */
import { describe, expect, it } from 'vitest'
import { compile } from './index.js'

const MINIMAL = '[ Main; print "Hi^"; @quit; ];\n'
const STD = `Constant Story "TEST";
Constant Headline "^A test.^";
Include "Parser";
Include "VerbLib";
Object Hall "Hall" with description "A hall.", has light;
[ Initialise; location = Hall; ];
Include "Grammar";
`
const PUNY = `!% $OMIT_UNUSED_ROUTINES=1
Constant Story "TEST";
Constant Headline "^A test.^";
Include "globals.h";
Include "puny.h";
Object Hall "Hall" with description "A hall.", has light;
[ Initialise; location = Hall; ];
`

describe('compile (real wasm)', () => {
  it('compiles a library-free story to a v5 file', async () => {
    const r = await compile(MINIMAL, { version: 'z5' })
    expect(r.ok, r.rawOutput).toBe(true)
    expect(r.story![0]).toBe(5) // header byte 0: version (Standard §11.1)
    expect(r.dbg).toBeUndefined()
  })

  for (const v of ['z3', 'z4', 'z8'] as const) {
    it(`honours ${v}`, async () => {
      const r = await compile(MINIMAL, { version: v })
      expect(r.ok, r.rawOutput).toBe(true)
      expect(r.story![0]).toBe(Number(v.slice(1)))
    })
  }

  it('compiles against the Standard Library and returns gameinfo.dbg', async () => {
    const r = await compile(STD, { debug: true })
    expect(r.ok, r.rawOutput).toBe(true)
    expect(r.dbg).toMatch(/^<\?xml/)
    expect(r.dbg).toContain('<inform-story-file')
    expect(r.stats.readableMem).toBeGreaterThan(0)
  }, 30_000)

  it('compiles against PunyInform', async () => {
    const r = await compile(PUNY, { library: 'puny' })
    expect(r.ok, r.rawOutput).toBe(true)
  }, 30_000)

  it('reports a syntax error as a diagnostic with a line', async () => {
    const r = await compile('[ Main; print "x" ]\n')
    expect(r.ok).toBe(false)
    expect(r.diagnostics.some(d => d.severity === 'error' && d.line === 1)).toBe(true)
  })
})
