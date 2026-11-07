/**
 * Symbols from gameinfo.dbg, and fingerprinting without them. The debug
 * fixtures are the ground truth: their .dbg names every routine, so the sweep
 * must find exactly those routines, and every veneer routine fingerprinting
 * names must be the one the .dbg names at that address.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fingerprint, parseStory, readSymbols, routineShape, shapeHash, symbolsMatch } from '../src/index.js'
import { VENEER } from '../src/veneer-signatures.generated.js'
import { formatTxd, routineView } from '../src/format/index.js'
import { parseXml } from '../src/xml.js'
import { FIXTURES_DIR, readStory, storyFiles } from './fixtures.js'

const debugFixtures = storyFiles().filter(f => readdirSync(FIXTURES_DIR).includes(f.replace(/\.z\d$/, '.dbg')))
const dbg = (story: string) => readFileSync(FIXTURES_DIR + story.replace(/\.z\d$/, '.dbg'), 'utf8')

describe('readSymbols', () => {
  it('has debug fixtures to check', () => expect(debugFixtures.length).toBeGreaterThanOrEqual(10))

  it.each(debugFixtures)('%s: reads cleanly, matches its story, and names exactly the routines the sweep finds', (f) => {
    const story = parseStory(readStory(f))
    const s = readSymbols(dbg(f))
    expect(s.problems).toEqual([])
    expect(s.creator).toBe('Inform')
    expect(s.creatorVersion).toBe(story.header.inform?.compilerVersion)
    expect(symbolsMatch(story.bytes, s)).toBe(true)
    expect(Object.keys(s.routines).map(Number).sort((a, b) => a - b)).toEqual(story.code.routines.map(r => r.address))
    for (const r of story.code.routines) expect(s.routines[r.address]!.locals.length).toBeLessThanOrEqual(r.locals)
    for (const n of Object.keys(s.objects).map(Number)) expect(n).toBeLessThanOrEqual(story.objects.objects.length)
    for (const n of Object.keys(s.globals).map(Number)) expect(n).toBeLessThan(240)
  })

  it('names what the source names: dark-cellar.z5', () => {
    const s = readSymbols(dbg('dark-cellar.z5'))
    const story = parseStory(readStory('dark-cellar.z5'))
    // The game's own routine is in the story's source; Main, in Standard Library 6.12, is the parser's.
    const init = Object.values(s.routines).find(r => r.name === 'Initialise')!
    expect(s.sources[init.location!.file]).toBe('story.inf')
    expect(s.sources[Object.values(s.routines).find(r => r.name === 'Main')!.location!.file]).toBe('Parser')
    expect(Object.values(s.routines).find(r => r.name === 'Main__')?.location).toBeUndefined()
    expect(s.classes[1]).toBe('Class')
    expect(s.attributes[Object.keys(s.attributes).map(Number).find(n => s.attributes[n] === 'light')!]).toBe('light')
    expect(Object.values(s.actions)).toContain('Take')
    expect(Object.values(s.properties)).toContain('n_to')
    expect(Object.values(s.globals)).toContain('location')
    expect(s.arrays.find(a => a.name === 'inputobjs')).toMatchObject({ byteCount: 32, bytesPerElement: 2, lengthFirst: false })
    // An unused routine the compiler left out (address 0) isn't a routine of the story.
    expect(s.routines[0]).toBeUndefined()
    expect(story.code.routines.length).toBe(Object.keys(s.routines).length)
  })

  it("says when a debug file belongs to another story", () => {
    expect(symbolsMatch(readStory('dark-cellar.z5'), readSymbols(dbg('demo.z5')))).toBe(false)
    expect(symbolsMatch(readStory('dark-cellar.z5'), readSymbols('<inform-story-file></inform-story-file>'))).toBeUndefined()
  })

  it('ignores the header bytes an interpreter changes', () => {
    const story = readStory('dark-cellar.z5').slice()
    story[1]! ^= 0xff // Flags 1
    story[0x10]! ^= 0xff // Flags 2
    story[0x1e] = 6 // interpreter number
    expect(symbolsMatch(story, readSymbols(dbg('dark-cellar.z5')))).toBe(true)
  })

  it('never throws on a bad debug file', () => {
    for (const bad of ['', 'not xml', '<a><b></a>', '<inform-story-file><routine><identifier>x', '<html></html>', '<'.repeat(10_000), '<a>'.repeat(1000)]) {
      const s = readSymbols(bad)
      expect(s.problems.length, bad.slice(0, 20)).toBeGreaterThan(0)
    }
    const s = readSymbols('<inform-story-file><routine><identifier>R</identifier></routine><story-file-prefix>!!</story-file-prefix></inform-story-file>')
    expect(s.problems.join(' ')).toMatch(/prefix/)
    expect(s.problems.join(' ')).toMatch(/1 entry/)
    // A prefix that isn't exactly 64 bytes of canonical base64 isn't one.
    const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n)))
    for (const bad of [b64(63), b64(65), `${b64(64)}A`, b64(64).replace(/==$/, '')]) {
      const r = readSymbols(`<inform-story-file><story-file-prefix>${bad}</story-file-prefix></inform-story-file>`)
      expect(r.prefix, bad).toBeUndefined()
      expect(r.problems.join(' ')).toMatch(/prefix/)
    }
    expect(readSymbols(`<inform-story-file><story-file-prefix>${b64(64)}</story-file-prefix></inform-story-file>`).prefix?.length).toBe(64)
  })
})

describe('parseXml', () => {
  it('one root, nothing but space outside it, and no characters XML forbids', () => {
    expect(parseXml('<a/><b/>').error).toMatch(/More than one root/)
    expect(parseXml('<a/>junk').error).toMatch(/Text outside/)
    expect(parseXml('  <a/>\n').error).toBeUndefined()
    expect(parseXml('<a>&#0;&#xD800;&#x110000;&#xFFFE;&#9;</a>').root!.text).toBe('\ufffd\ufffd\ufffd\ufffd\t')
  })

  it('reads elements, attributes, text, entities, comments and CDATA', () => {
    const { root, error } = parseXml(`<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y='q'>t&lt;&#65;&#x42;<b/><![CDATA[<raw>]]></a>`)
    expect(error).toBeUndefined()
    expect(root).toEqual({ name: 'a', attrs: { x: '1 & 2', y: 'q' }, text: 't<AB<raw>', children: [{ name: 'b', attrs: {}, children: [], text: '' }] })
  })
})

const SAMPLES = fileURLToPath(new URL('../../../samples/', import.meta.url))
const samples = readdirSync(SAMPLES).filter(f => /\.z\d$/.test(f)).sort()

describe('fingerprint', () => {
  it.each(debugFixtures)('%s: every veneer routine it names is the one the .dbg names there', (f) => {
    const story = parseStory(readStory(f))
    const s = readSymbols(dbg(f))
    const fp = story.fingerprint!
    expect(fp.compiler).toBe('inform6')
    expect(fp.compilerVersion).toBe('6.44')
    for (const [at, name] of Object.entries(fp.veneer)) expect(s.routines[Number(at)]?.name, `at ${Number(at).toString(16)}`).toBe(name)
    // …and it finds nearly all of them: every one the .dbg has, but the two whose shape game code shares.
    const veneer = Object.values(s.routines).filter(r => !r.location).map(r => r.name)
    const missed = veneer.filter(n => !Object.values(fp.veneer).includes(n))
    expect(missed.filter(n => n !== 'Unsigned__Compare' && n !== 'Symb__Tab')).toEqual([])
  })

  it.each(samples)('samples/%s: the compiler and library', (f) => {
    const fp = parseStory(new Uint8Array(readFileSync(SAMPLES + f))).fingerprint!
    expect(fp.compiler).toBe('inform6')
    if (f === 'minimal.z5') expect(fp.library).toBeUndefined()
    else if (f.startsWith('puny-')) expect(fp.library).toEqual({ name: 'PunyInform', version: expect.stringMatching(/^\d+\.\d+$/) })
    else expect(fp.library).toEqual({ name: 'Standard Library', version: '6.12.8' })
    expect(Object.values(fp.veneer)).toContain('Main__')
  })

  it('the signature table is up to date with the fixtures (else: pnpm build && node scripts/build-signatures.mjs)', () => {
    // The same derivation as the script: veneer shapes only one veneer name has, and no other routine.
    const veneer = new Map<string, Set<string>>()
    const other = new Set<string>()
    for (const f of debugFixtures) {
      const story = parseStory(readStory(f))
      const s = readSymbols(dbg(f))
      for (const r of story.code.routines) {
        const sym = s.routines[r.address]
        const h = shapeHash(routineShape(r))
        if (sym && !sym.location && sym.name !== 'Main__') veneer.set(h, (veneer.get(h) ?? new Set()).add(sym.name))
        else other.add(h)
      }
    }
    const want = Object.fromEntries([...veneer].filter(([h, n]) => n.size === 1 && !other.has(h)).map(([h, n]) => [h, [...n][0]]))
    expect(VENEER).toEqual(want)
  })

  it('knows ZILF by its header, and an unknown compiler as unknown', () => {
    const story = readStory('dark-cellar.z5').slice()
    story.set([...'ZILF190~'].map(c => c.charCodeAt(0)), 0x38)
    const fp = fingerprint(parseStory(story))
    expect(fp).toEqual({ compiler: 'zilf', compilerVersion: '1.9.0', veneer: {} })
    story.set(new Uint8Array(8), 0x38)
    expect(parseStory(story).fingerprint).toMatchObject({ compiler: 'unknown' })
  })
})

describe('the disassembly with symbols', () => {
  const story = parseStory(readStory('dark-cellar.z5'))
  const symbols = readSymbols(dbg('dark-cellar.z5'))
  const text = formatTxd(story, { symbols })

  it('names routines, globals, locals, attributes and properties', () => {
    expect(text).toContain('Routine Initialise, 0 locals\n\n       STORE           location,#001a\n')
    expect(text).toContain('Routine LookRoutine, 2 locals')
    expect(text).toMatch(/PULL +i\n/)
    expect(text).toMatch(/TEST_ATTR +obj,pluralname /)
    expect(text).toMatch(/CALL_VS +RT__ChPR \(i,#15\) -> temp_global\n/)
    expect(text).toMatch(/GET_PROP +obj,identifier -> /)
    expect(text).toMatch(/GET_PROP +cla,#03 -> i/) // Inform's artificial property 3 has no source name
  })

  it("without them, is txd's text: nothing named", () => {
    const plain = formatTxd(story)
    expect(plain).not.toContain('Initialise')
    expect(plain).toContain('Main routine R0001, 0 locals')
  })

  it('routineView names the same way, and its pieces still join to the text', () => {
    const init = Object.values(symbols.routines).find(r => r.name === 'Initialise')!
    const v = routineView(story, init.address, { symbols })!
    expect(v.name).toBe('Initialise')
    expect(v.header).toBe('Routine Initialise, 0 locals')
    expect(v.lines[0]!.pieces.map(p => p.text).join('')).toBe('STORE           location,#001a')
  })
})
