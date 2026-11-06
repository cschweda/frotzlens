import { describe, expect, it } from 'vitest'
import { Bytes } from '../src/bytes.js'
import { decodeInstruction } from '../src/decode.js'
import { parseRoutine, tryRoutine } from '../src/routines.js'
import { defaultExtra, type TextContext } from '../src/text.js'
import { parseStory } from '../src/index.js'
import { readStory } from './fixtures.js'

const ctx = (data: Uint8Array): TextContext => ({ bytes: new Bytes(data), version: 5, abbreviations: [], alphabets: null, extra: defaultExtra() })
const decode = (bytes: number[], version = 5 as const) => {
  const data = new Uint8Array([...bytes, 0, 0, 0, 0])
  return decodeInstruction(new Bytes(data), 0, version, ctx(data))
}

describe('instruction forms (§4.3)', () => {
  it('long form: 2OP with small-constant / variable operands from bits 6 and 5', () => {
    // 0x54 = 0b0101_0100: long form, first a variable (bit 6), second a small constant; opcode 0x14 add.
    const ins = decode([0x54, 0x01, 0x05, 0x02])
    expect(ins.name).toBe('ADD')
    expect(ins.form).toBe('long')
    expect(ins.operands).toEqual([{ kind: 'variable', value: 1 }, { kind: 'small', value: 5 }])
    expect(ins.store).toBe(2)
    expect(ins.length).toBe(4)
  })

  it('short form: 1OP with a large constant, and 0OP', () => {
    const jump = decode([0x8c, 0x00, 0x10]) // 1OP jump, large constant offset 0x10
    expect(jump.name).toBe('JUMP')
    expect(jump.jumpTarget).toBe(3 + 0x10 - 2) // §15: relative to the next instruction, minus 2
    expect(decode([0xb0]).name).toBe('RTRUE')
    expect(decode([0xb0]).count).toBe('0OP')
  })

  it('variable form: VAR with a types byte; double types for call_vs2 (§4.4.3.1)', () => {
    // call_vs2 (VAR 0x0c): two type bytes for up to 8 operands.
    // Types: 0x15 = large, small, small, small; 0x55 = four more smalls. Then the operands, then the store.
    const ins = decode([0xec, 0x15, 0x55, 0x10, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x00])
    expect(ins.name).toBe('CALL_VS2')
    expect(ins.operands).toHaveLength(8)
    expect(ins.operands[0]).toEqual({ kind: 'large', value: 0x1000 })
  })

  it('extended form (v5+): 0xbe, the opcode, a types byte', () => {
    const ins = decode([0xbe, 0x09, 0xff, 0x03]) // save_undo -> L02
    expect(ins.name).toBe('SAVE_UNDO')
    expect(ins.form).toBe('extended')
    expect(ins.operands).toEqual([])
    expect(ins.store).toBe(3)
  })

  it('an opcode that does not exist in the version is malformed', () => {
    expect(() => decode([0xbe, 0x09, 0xff, 0x03], 3 as never)).toThrow()
  })
})

describe('branches (§4.7)', () => {
  it('one byte: bit 6 set, a 6-bit offset; bit 7 is the condition', () => {
    // jz L00 [TRUE] +0x10: 0xa0 (1OP jz, variable), 0x01, 0xc0|0x10
    const ins = decode([0xa0, 0x01, 0xd0])
    expect(ins.branch).toEqual({ onTrue: true, target: 3 + 0x10 - 2 })
  })

  it('two bytes: a 14-bit signed offset, so it can go backwards', () => {
    // jz L00 [FALSE] -10: 14-bit -10 = 0x3ff6 → bytes 0x3f, 0xf6
    const ins = decode([0xa0, 0x01, 0x3f, 0xf6])
    expect(ins.branch).toEqual({ onTrue: false, target: 4 - 10 - 2 })
  })

  it('offsets 0 and 1 return false and true', () => {
    expect(decode([0xa0, 0x01, 0xc0]).branch).toEqual({ onTrue: true, returns: false })
    expect(decode([0xa0, 0x01, 0x41]).branch).toEqual({ onTrue: false, returns: true })
  })
})

describe('routines (§5)', () => {
  it('v5: a locals count, then instructions to the terminator past every forward branch', () => {
    // 2 locals; jz L00 [TRUE] to the rtrue at 5 (offset 5 − 4 + 2 = 3); rfalse; rtrue
    const data = new Uint8Array([0x02, 0xa0, 0x01, 0xc3, 0xb1, 0xb0])
    const r = parseRoutine(new Bytes(data), 5, 0, ctx(data))
    expect(r.locals).toBe(2)
    expect(r.instructions.map(i => i.name)).toEqual(['JZ', 'RFALSE', 'RTRUE'])
    expect(r.end).toBe(6)
  })

  it('a local beyond the declared ones, or more than 15 locals, is not a routine', () => {
    const tooMany = new Uint8Array([0x10, 0xb0])
    expect(tryRoutine(new Bytes(tooMany), 5, 0, ctx(tooMany))).toBeNull()
    const badLocal = new Uint8Array([0x01, 0xa0, 0x03, 0xc0, 0xb0]) // jz L02 in a 1-local routine
    expect(tryRoutine(new Bytes(badLocal), 5, 0, ctx(badLocal))).toBeNull()
  })

  it('v3: each local has an initial value (§5.2.1)', () => {
    const s = parseStory(readStory('puny-dark-cellar-v3.z3'))
    const r = s.code.routines.find(x => x.locals > 0)!
    expect(r.initialValues).toHaveLength(r.locals)
  })
})

describe('the code and strings of a story', () => {
  const s = parseStory(readStory('dark-cellar.z5'))

  it('finds every routine and string, in address order, with stable ids', () => {
    expect(s.code.routines).toHaveLength(405)
    expect(s.strings).toHaveLength(831)
    expect(s.code.main).toBe(s.header.initialPc - 1)
    expect(s.code.routines[0]!.id).toBe(`routine:${s.code.routines[0]!.address.toString(16)}`)
    const starts = s.code.routines.map(r => r.address)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('a v8 story unpacks routine addresses × 8', () => {
    const v8 = parseStory(readStory('dark-cellar-v8.z8'))
    const call = v8.code.routines.flatMap(r => r.instructions).find(i => i.info.call && i.operands[0]?.kind === 'large')!
    expect(v8.code.routines.some(r => r.address === call.operands[0]!.value * 8)).toBe(true)
  })
})

describe('grammar', () => {
  it('GV2 (Standard Library): verbs, synonyms, lines, actions', () => {
    const g = parseStory(readStory('dark-cellar.z5')).grammar!
    expect(g.version).toBe(2)
    expect(g.verbs).toHaveLength(96)
    expect(g.actions).toHaveLength(110)
    const die = g.verbs.find(v => v.words[0] === 'die')!
    expect(die.words).toEqual(['die', 'q', 'quit'])
  })

  it('GV1 (library-free fixture): 8-byte lines, prepositions and a parsing routine', () => {
    const g = parseStory(readStory('gv1.z5')).grammar!
    expect(g.version).toBe(1)
    expect(g.prepositions.map(p => [p.number, p.word])).toEqual([[252, 'at'], [253, 'on'], [254, 'in'], [255, 'off']])
    expect(g.parsingRoutines).toHaveLength(1)
    const get = g.verbs.find(v => v.words.includes('get'))!
    expect(get.lines[1]!.tokens.map(t => t.kind)).toEqual(['preposition', 'elementary']) // get off NOUN
  })

  it('GV3 (PunyInform): compact lines, prepositions by index — which Ztools reads as GV1', () => {
    const g = parseStory(readStory('puny-dark-cellar.z5')).grammar!
    expect(g.version).toBe(3)
    expect(g.prepositions[0]!.word).toBe('to')
    const line = g.verbs[0]!.lines[0]!
    expect(line.bytes.length).toBe(2 + 2 * line.tokens.length)
  })

  it('a story with no grammar has none', () => {
    expect(parseStory(readStory('minimal.z5')).grammar).toBeUndefined()
  })
})

describe('cross-references', () => {
  const s = parseStory(readStory('dark-cellar.z5'))

  it('calls, both ways', () => {
    const main = s.code.routines[0]!
    const callee = s.xrefs[main.id]!.to.find(id => id.startsWith('routine:'))!
    expect(s.xrefs[callee]!.from).toContainEqual({ id: main.id, address: main.instructions[0]!.address })
  })

  it('strings printed by print_paddr, and objects that hold a string in a property', () => {
    const paddr = s.code.routines.flatMap(r => r.instructions.map(i => ({ r, i }))).find(x => x.i.name === 'PRINT_PADDR' && x.i.operands[0]!.kind === 'large')!
    const id = `string:${(paddr.i.operands[0]!.value * 4).toString(16).padStart(4, '0')}`
    expect(s.xrefs[id]!.from).toContainEqual({ id: paddr.r.id, address: paddr.i.address })
    expect(Object.values(s.xrefs).some(e => e.from.some(f => f.id.startsWith('object:')))).toBe(true)
  })

  it('globals and dictionary words', () => {
    expect(s.xrefs['global:239']!.from.length).toBeGreaterThan(0)
    expect(Object.keys(s.xrefs).some(k => k.startsWith('dict:'))).toBe(true)
  })

  it('every reference points at something that exists', () => {
    const ids = new Set<string>([
      ...s.code.routines.map(r => r.id),
      ...s.strings.map(x => x.id),
      ...s.objects.objects.map(o => o.id),
      ...s.dictionary.entries.map(e => e.id),
      ...s.globals.map(g => g.id),
    ])
    for (const [id, e] of Object.entries(s.xrefs)) {
      expect(ids.has(id), id).toBe(true)
      for (const t of e.to) expect(ids.has(t), t).toBe(true)
    }
  })
})
