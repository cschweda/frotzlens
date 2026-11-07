/**
 * Opcode tests (docs/11 §9): small stories built with the test assembler, one behaviour each.
 * Everything the kickoff's rule 6 lists has its own named test, citing the Standard. The last test
 * checks that, between these and the walkthroughs, every opcode of every version has run.
 */
import { op0, op1, op2, opExt, opVar, type Version } from '@frotzinc/zcode'
import { describe, expect, it } from 'vitest'
import { Machine, type StopReason } from '../src/index.js'
import { DATA, L, R, assemble, sp, v, type Asm, type Layout, type Operand, type StoryObject } from './asm.js'
import { readSample, readScript, sampleFiles } from './samples.js'
import { existsSync } from 'node:fs'

/** Every opcode name each version ran, for the coverage test at the end. */
const ran: Record<number, Set<string>> = { 3: new Set(), 4: new Set(), 5: new Set(), 8: new Set() }

function record(m: Machine) {
  for (const ins of (m as unknown as { cache: Map<number, { name: string }> }).cache.values()) ran[m.version]!.add(ins.name)
}

interface Run {
  out: string
  stop: StopReason
  m: Machine
  word: (a: number) => number
  byte: (a: number) => number
}

/** Assemble, run, feed `input` (lines, or one-character strings for read_char, or 'timeout'), and collect the lower window. */
function run(version: Version, body: (a: Asm) => void, layout: Layout = {}, input: string[] = []): Run {
  const m = Machine.create(assemble(version, body, layout), { seed: 1 }) as Machine
  if (!(m instanceof Machine)) throw new Error(JSON.stringify(m))
  let stop = m.run(1_000_000)
  let out = m.flushText()
  for (const x of input) {
    const fault = x === 'timeout' ? m.resume({ timeout: true }) : stop.kind === 'input-char' ? m.resume({ char: x.charCodeAt(0) }) : m.resume({ line: x })
    if (fault) throw new Error(fault.message)
    stop = m.run(1_000_000)
    out += m.flushText()
  }
  record(m)
  const mem = m.state.memory
  return { out, stop, m, word: a => (mem[a]! << 8) | mem[a + 1]!, byte: a => mem[a]! }
}

/** Print a value as a signed number and a space. */
const p = (a: Asm, x: Operand) => a.op('PRINT_NUM', [x]).op('PRINT_CHAR', [32])
const call = (version: Version) => (version <= 3 ? 'CALL' : 'CALL_VS')

describe('arithmetic (§2)', () => {
  it('signed 16-bit add, sub, mul, wrapping', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('ADD', [L(32767), 1], { store: 0 }); p(a, sp)
      a.op('SUB', [0, 1], { store: 0 }); p(a, sp)
      a.op('MUL', [L(-300), 200], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('-32768 -1 5536 ')
  })

  it('division and remainder round toward zero; the remainder takes the dividend’s sign (§2.4.3)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('DIV', [L(-7), 2], { store: 0 }); p(a, sp)
      a.op('MOD', [L(-7), 2], { store: 0 }); p(a, sp)
      a.op('DIV', [7, L(-2)], { store: 0 }); p(a, sp)
      a.op('MOD', [7, L(-2)], { store: 0 }); p(a, sp)
      a.op('DIV', [L(-32768), L(-1)], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('-3 -1 -3 1 -32768 ')
  })

  it('division by zero is a fault, not a crash', () => {
    const r = run(5, a => a.routine('main').op('DIV', [1, 0], { store: 0 }).op('QUIT'))
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'division-by-zero' } })
  })

  it('@art_shift keeps the sign; @log_shift brings in zeros (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('ART_SHIFT', [L(-16), L(-2)], { store: 0 }); p(a, sp)
      a.op('LOG_SHIFT', [L(-16), L(-2)], { store: 0 }); p(a, sp)
      a.op('ART_SHIFT', [3, 2], { store: 0 }); p(a, sp)
      a.op('LOG_SHIFT', [1, 15], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('-4 16380 12 -32768 ')
  })

  it('or, and, not (1OP in v3, VAR in v5)', () => {
    for (const version of [3, 5] as const) {
      const r = run(version, a => {
        a.routine('main')
        a.op('OR', [0x0c, 0x03], { store: 0 }); p(a, sp)
        a.op('AND', [0x0c, 0x06], { store: 0 }); p(a, sp)
        a.op('NOT', [0], { store: 0 }); p(a, sp)
        a.op('QUIT')
      })
      expect(r.out, `v${version}`).toBe('15 4 -1 ')
    }
  })
})

describe('branches (§4.7)', () => {
  const yesNo = (a: Asm, name: string, ops: Operand[], label: string) => {
    a.op(name, ops, { branch: { to: label } })
    a.op('PRINT', [], { text: 'n' })
    a.jump(label + '-end')
    a.label(label)
    a.op('PRINT', [], { text: 'y' })
    a.label(label + '-end')
  }

  it('@je with one operand never branches (§15: "@je a never jumps")', () => {
    const r = run(5, a => {
      a.routine('main')
      yesNo(a, 'JE', [5], 'one')
      yesNo(a, 'JE', [5, 5], 'two')
      yesNo(a, 'JE', [5, 1, 2, 5], 'four')
      yesNo(a, 'JE', [5, 1, 2, 3], 'none')
      a.op('QUIT')
    })
    expect(r.out).toBe('nyyn')
  })

  it('@jl and @jg compare signed', () => {
    const r = run(5, a => {
      a.routine('main')
      yesNo(a, 'JL', [L(-1), 1], 'a')
      yesNo(a, 'JG', [L(-1), 1], 'b')
      yesNo(a, 'JZ', [0], 'c')
      yesNo(a, 'TEST', [0x0f, 0x05], 'd')
      yesNo(a, 'TEST', [0x0a, 0x05], 'e')
      a.op('QUIT')
    })
    expect(r.out).toBe('ynyyn')
  })

  it('@inc_chk and @dec_chk change the variable and compare signed (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('STORE', [16, L(-1)])
      yesNo(a, 'INC_CHK', [16, 0], 'a') // -1 → 0; 0 > 0? no
      yesNo(a, 'DEC_CHK', [16, L(-2)], 'b') // 0 → -1; -1 < -2? no
      yesNo(a, 'DEC_CHK', [16, 0], 'c') // -1 → -2; -2 < 0? yes
      p(a, v(16))
      a.op('QUIT')
    })
    expect(r.out).toBe('nny-2 ')
  })

  it('a branch can return true or false instead of jumping', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('CALL_VS', [R('f')], { store: 0 }); p(a, sp)
      a.op('CALL_VS', [R('g')], { store: 0 }); p(a, sp)
      a.op('QUIT')
      a.routine('f').op('JZ', [0], { branch: { ret: true } }).op('RET', [9])
      a.routine('g').op('JZ', [1], { branch: { ret: true, onFalse: true } }).op('RET', [9])
    })
    expect(r.out).toBe('1 1 ')
  })
})

describe('variables and the stack (§6)', () => {
  it('variable 0 is the top of the stack, read and written in place by @load, @store, @inc, @dec, @pull (§6.3.4)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('PUSH', [5])
      a.op('PUSH', [6])
      a.op('INC', [0]) // top 6 → 7, nothing pushed or popped
      a.op('LOAD', [0], { store: 16 }) // peek: 7
      p(a, v(16))
      a.op('STORE', [0, 9]) // replace the top: [5, 9]
      a.op('DEC', [0]) // [5, 8]
      a.op('PULL', [0]) // pop 8, then write it over the new top: [8]
      p(a, sp) // 8
      a.op('PUSH', [1])
      a.op('INC_CHK', [0, 5], { branch: { ret: false } }) // top 1 → 2 in place; 2 > 5 is false
      p(a, sp) // 2
      a.op('QUIT')
    })
    expect(r.out).toBe('7 8 2 ')
    expect(r.m.state.frames[0]!.evalStack).toEqual([])
  })

  it('locals start with their initial values in v3/v4 and zero in v5 (§5.2)', () => {
    for (const version of [3, 4, 5] as const) {
      const r = run(version, a => {
        a.routine('main')
        a.op(call(version), [R('r'), 1], { store: 0 }); p(a, sp)
        a.op('QUIT')
        a.routine('r', [10, 20])
        a.op('ADD', [v(1), v(2)], { store: 0 })
        a.op('RET_POPPED')
      })
      expect(r.out, `v${version}`).toBe(version <= 4 ? '21 ' : '1 ')
    }
  })

  it('reading an empty stack is a fault', () => {
    const r = run(5, a => a.routine('main').op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'stack-underflow' } })
  })

  it('@pop (v3/4) and @catch (v5)', () => {
    const r3 = run(3, a => a.routine('main').op('PUSH', [1]).op('PUSH', [2]).op('POP').op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r3.out).toBe('1')
    const r5 = run(5, a => a.routine('main').op('CATCH', [], { store: 0 }).op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r5.out).toBe('1')
  })
})

describe('calls (§6.4)', () => {
  it('every call form, and @check_arg_count (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('CALL_1S', [R('n')], { store: 0 }); p(a, sp)
      a.op('CALL_2S', [R('n'), 1], { store: 0 }); p(a, sp)
      a.op('CALL_VS', [R('n'), 1, 2, 3], { store: 0 }); p(a, sp)
      a.op('CALL_VS2', [R('n'), 1, 2, 3, 4, 5, 6, 7], { store: 0 }); p(a, sp)
      a.op('CALL_1N', [R('n')])
      a.op('CALL_2N', [R('n'), 1])
      a.op('CALL_VN', [R('n'), 1, 2])
      a.op('CALL_VN2', [R('n'), 1, 2, 3, 4, 5])
      a.op('QUIT')
      // n: how many arguments it was given, counted with @check_arg_count.
      a.routine('n', 7)
      for (let k = 7; k >= 1; k--) {
        a.op('CHECK_ARG_COUNT', [k], { branch: { to: `has${k}` } })
      }
      a.op('RET', [0])
      for (let k = 7; k >= 1; k--) a.label(`has${k}`).op('RET', [k])
    })
    expect(r.out).toBe('0 1 3 7 ')
  })

  it('calling routine 0 does nothing and returns false (§6.4.3)', () => {
    const r = run(5, a => a.routine('main').op('CALL_VS', [0], { store: 0 }).op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r.out).toBe('0')
  })

  it('return forms: ret, rtrue, rfalse, ret_popped, print_ret', () => {
    const r = run(5, a => {
      a.routine('main')
      for (const f of ['a', 'b', 'c', 'd', 'e']) a.op('CALL_VS', [R(f)], { store: 0 }).op('PRINT_NUM', [sp])
      a.op('QUIT')
      a.routine('a').op('RET', [L(-5)])
      a.routine('b').op('RTRUE')
      a.routine('c').op('RFALSE')
      a.routine('d').op('PUSH', [8]).op('RET_POPPED')
      a.routine('e').op('PRINT_RET', [], { text: ' hi' })
    })
    expect(r.out).toBe('-5108 hi\n1')
  })

  it('@throw unwinds to the frame @catch named and returns from it (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('CALL_VS', [R('outer')], { store: 0 }); p(a, sp)
      a.op('QUIT')
      a.routine('outer', 1)
      a.op('CATCH', [], { store: 1 })
      a.op('CALL_VS', [R('inner'), v(1)], { store: 0 })
      a.op('PRINT', [], { text: 'not here' })
      a.op('RET', [0])
      a.routine('inner', 1)
      a.op('CALL_VS', [R('deeper'), v(1)], { store: 0 })
      a.op('RET', [0])
      a.routine('deeper', 1)
      a.op('THROW', [42, v(1)])
    })
    expect(r.out).toBe('42 ')
    expect(r.m.state.frames).toHaveLength(1)
  })
})

describe('memory and tables', () => {
  it('@loadw/@storew/@loadb/@storeb, with signed indexes', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('STOREW', [L(DATA + 2), L(-1), L(0x1234)])
      a.op('LOADW', [L(DATA), 0], { store: 0 }); p(a, sp)
      a.op('STOREB', [L(DATA), 5, 0x7f])
      a.op('LOADB', [L(DATA + 6), L(-1)], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('4660 127 ')
  })

  it('writing outside dynamic memory is a fault (§1.1.2)', () => {
    const r = run(5, a => a.routine('main').op('STOREB', [L(0x3000), 0, 1]).op('QUIT'))
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'write-to-static' } })
  })

  it('@copy_table: zero fill, overlap-safe copy, and a negative size copies forwards (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      for (let i = 0; i < 6; i++) a.op('STOREB', [L(DATA), i, i + 1])
      a.op('COPY_TABLE', [L(DATA), L(DATA + 1), 4]) // safe: 1 1 2 3 4 6
      a.op('COPY_TABLE', [L(DATA + 100), 0, 3]) // DATA+100.. zeroed
      for (let i = 0; i < 4; i++) a.op('STOREB', [L(DATA + 200), i, i + 1])
      a.op('COPY_TABLE', [L(DATA + 200), L(DATA + 201), L(-3)]) // forwards: 1 1 1 1
      a.op('QUIT')
    })
    expect([0, 1, 2, 3, 4, 5].map(i => r.byte(DATA + i))).toEqual([1, 1, 2, 3, 4, 6])
    expect([0, 1, 2, 3].map(i => r.byte(DATA + 200 + i))).toEqual([1, 1, 1, 1])
  })

  it('@scan_table finds bytes and words, with the form’s field length (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      for (let i = 0; i < 4; i++) a.op('STOREW', [L(DATA), i, L(100 + i)])
      a.op('SCAN_TABLE', [L(102), L(DATA), 4], { store: 0, branch: { to: 'found' } })
      a.op('QUIT')
      a.label('found')
      a.op('SUB', [sp, L(DATA)], { store: 0 }); p(a, sp)
      a.op('SCAN_TABLE', [103, L(DATA + 1), 4, 0x02], { store: 0, branch: { to: 'byte' } })
      a.op('QUIT')
      a.label('byte')
      a.op('SUB', [sp, L(DATA)], { store: 0 }); p(a, sp)
      a.op('SCAN_TABLE', [99, L(DATA), 4], { store: 0, branch: { onFalse: true, to: 'none' } })
      a.op('QUIT')
      a.label('none')
      p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('4 7 0 ')
  })
})

describe('objects (§12)', () => {
  const objects = (v3: boolean): StoryObject[] => [
    { name: 'room', child: 2, attributes: [1], properties: { 10: [0, 42], 5: [7] } },
    { name: 'box', parent: 1, sibling: 3, properties: v3 ? { 4: [1, 2, 3, 4] } : { 4: [1, 2, 3, 4, 5, 6, 7, 8] } },
    { name: 'key', parent: 1, attributes: [v3 ? 31 : 47] },
  ]

  for (const version of [3, 5] as const) {
    it(`the tree, attributes and properties (v${version})`, () => {
      const v3 = version === 3
      const r = run(
        version,
        a => {
          a.routine('main')
          a.op('GET_CHILD', [1], { store: 16, branch: { ret: false, onFalse: true } }); p(a, v(16))
          a.op('GET_SIBLING', [2], { store: 0, branch: { ret: false, onFalse: true } }); p(a, sp)
          a.op('GET_PARENT', [3], { store: 0 }); p(a, sp)
          a.op('INSERT_OBJ', [3, 2]) // key into box
          a.op('GET_CHILD', [2], { store: 0, branch: { ret: false, onFalse: true } }); p(a, sp)
          a.op('JIN', [3, 2], { branch: { ret: false, onFalse: true } })
          a.op('GET_SIBLING', [2], { store: 0, branch: { onFalse: true, to: 'nosib' } })
          a.label('nosib'); p(a, sp)
          a.op('REMOVE_OBJ', [3])
          a.op('GET_PARENT', [3], { store: 0 }); p(a, sp)
          a.op('TEST_ATTR', [3, v3 ? 31 : 47], { branch: { ret: false, onFalse: true } })
          a.op('SET_ATTR', [2, 0])
          a.op('CLEAR_ATTR', [1, 1])
          a.op('TEST_ATTR', [1, 1], { branch: { ret: false } })
          a.op('TEST_ATTR', [2, 0], { branch: { ret: false, onFalse: true } })
          a.op('GET_PROP', [1, 10], { store: 0 }); p(a, sp)
          a.op('GET_PROP', [1, 5], { store: 0 }); p(a, sp)
          a.op('GET_PROP', [1, 3], { store: 0 }); p(a, sp) // the default: 0
          a.op('PUT_PROP', [1, 10, L(1000)])
          a.op('GET_PROP', [1, 10], { store: 0 }); p(a, sp)
          a.op('GET_PROP_ADDR', [2, 4], { store: 16 })
          a.op('GET_PROP_LEN', [v(16)], { store: 0 }); p(a, sp)
          a.op('GET_PROP_LEN', [0], { store: 0 }); p(a, sp)
          a.op('GET_PROP_ADDR', [2, 9], { store: 0 }); p(a, sp)
          a.op('GET_NEXT_PROP', [1, 0], { store: 0 }); p(a, sp)
          a.op('GET_NEXT_PROP', [1, 10], { store: 0 }); p(a, sp)
          a.op('GET_NEXT_PROP', [1, 5], { store: 0 }); p(a, sp)
          a.op('PRINT_OBJ', [2])
          a.op('QUIT')
        },
        { objects: objects(v3) },
      )
      expect(r.out).toBe(`2 3 1 3 0 0 42 7 0 1000 ${v3 ? 4 : 8} 0 0 10 5 0 box`)
    })
  }

  it('an object that doesn’t exist is a fault', () => {
    const r = run(3, a => a.routine('main').op('GET_PARENT', [L(300)], { store: 0 }).op('QUIT'))
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'bad-object' } })
  })
})

describe('printing and output streams (§7)', () => {
  it('print_char, print_num, print_addr, print_paddr, print_unicode, check_unicode', () => {
    const r = run(5, a => {
      a.routine('main')
      a.jump('go')
      a.string('str', 'packed')
      a.label('go')
      a.op('PRINT_CHAR', [65])
      a.op('PRINT_NUM', [L(-42)])
      a.op('PRINT_PADDR', [R('str')])
      a.op('PRINT_UNICODE', [L(0x263a)])
      a.op('CHECK_UNICODE', [L(0x263a)], { store: 0 }); p(a, sp)
      a.op('CHECK_UNICODE', [1], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('A-42packed☺3 0 ')
  })

  it('@print_table prints rows, each on its own line (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      'abcXdef'.split('').forEach((c, i) => a.op('STOREB', [L(DATA), i, c.charCodeAt(0)]))
      a.op('PRINT_TABLE', [L(DATA), 3, 2, 1])
      a.op('QUIT')
    })
    expect(r.out).toBe('abc\ndef')
  })

  it('output stream 3 nests, takes everything while open, and stores each table’s length (§7.1.2.1)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('OUTPUT_STREAM', [3, L(DATA)])
      a.op('PRINT', [], { text: 'ab' })
      a.op('OUTPUT_STREAM', [3, L(DATA + 100)])
      a.op('PRINT', [], { text: 'cd' })
      a.op('NEW_LINE')
      a.op('OUTPUT_STREAM', [L(-3)])
      a.op('PRINT', [], { text: 'e' })
      a.op('OUTPUT_STREAM', [L(-3)])
      a.op('PRINT', [], { text: 'shown' })
      a.op('QUIT')
    })
    expect(r.out).toBe('shown')
    expect(r.word(DATA)).toBe(3)
    expect([0, 1, 2].map(i => String.fromCharCode(r.byte(DATA + 2 + i))).join('')).toBe('abe')
    expect(r.word(DATA + 100)).toBe(3)
    expect([r.byte(DATA + 102), r.byte(DATA + 103), r.byte(DATA + 104)]).toEqual([99, 100, 13])
  })

  it('output stream 3 nested more than 16 deep is a fault (§7.1.2.1.1)', () => {
    const r = run(5, a => {
      a.routine('main')
      for (let i = 0; i < 17; i++) a.op('OUTPUT_STREAM', [3, L(DATA + i * 20)])
      a.op('QUIT')
    })
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'stack-overflow' } })
  })

  it('stream 1 off hides text; stream 2 sets the transcript bit; streams 4 and the input stream are taken', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('OUTPUT_STREAM', [L(-1)])
      a.op('PRINT', [], { text: 'hidden' })
      a.op('OUTPUT_STREAM', [1])
      a.op('OUTPUT_STREAM', [2])
      a.op('OUTPUT_STREAM', [4])
      a.op('OUTPUT_STREAM', [L(-4)])
      a.op('INPUT_STREAM', [0])
      a.op('PRINT', [], { text: 'shown' })
      a.op('QUIT')
    })
    expect(r.out).toBe('shown')
    expect(r.byte(0x11) & 1).toBe(1)
  })
})

describe('the screen model (§8)', () => {
  it('@split_window, @set_window, @set_cursor, @get_cursor, @erase_line, @erase_window: the upper window is a grid, not the transcript', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('SPLIT_WINDOW', [2])
      a.op('SET_WINDOW', [1])
      a.op('SET_CURSOR', [2, 5])
      a.op('PRINT', [], { text: 'Score' })
      a.op('GET_CURSOR', [L(DATA)])
      a.op('SET_CURSOR', [1, 1])
      a.op('PRINT', [], { text: 'Room name' })
      a.op('SET_CURSOR', [1, 5])
      a.op('ERASE_LINE', [1])
      a.op('SET_WINDOW', [0])
      a.op('PRINT', [], { text: 'Below' })
      a.op('QUIT')
    })
    expect(r.out).toBe('Below')
    const grid = r.m.state.screen.upper.grid.map(row => row.map(c => c.ch).join('').trimEnd())
    expect(grid).toEqual(['Room', '    Score'])
    expect([r.word(DATA), r.word(DATA + 2)]).toEqual([2, 10])
  })

  it('@erase_window -1 unsplits and clears; v3 clears the upper window on split (§8.7.3.2, §8.6.1.1.2)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('SPLIT_WINDOW', [1]).op('SET_WINDOW', [1]).op('PRINT', [], { text: 'x' }).op('SET_WINDOW', [0])
      a.op('PRINT', [], { text: 'gone' })
      a.op('ERASE_WINDOW', [L(-1)])
      a.op('QUIT')
    })
    expect(r.m.state.screen.upper.rows).toBe(0)
    expect(r.m.state.screen.lower.runs).toEqual([])
    const r3 = run(3, a => {
      a.routine('main')
      a.op('SPLIT_WINDOW', [1]).op('SET_WINDOW', [1]).op('PRINT', [], { text: 'x' }).op('SET_WINDOW', [0])
      a.op('SPLIT_WINDOW', [1])
      a.op('QUIT')
    })
    expect(r3.m.state.screen.upper.grid[0]!.map(c => c.ch).join('').trim()).toBe('')
  })

  it('styles, colours, fonts and buffer mode are data for the player (§8.7)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('SET_TEXT_STYLE', [2])
      a.op('SET_TEXT_STYLE', [4])
      a.op('PRINT', [], { text: 'bold italic' })
      a.op('SET_TEXT_STYLE', [0])
      a.op('SET_COLOUR', [3, 4])
      a.op('PRINT', [], { text: 'red' })
      a.op('SET_FONT', [4], { store: 16 })
      a.op('SET_FONT', [3], { store: 17 })
      a.op('SET_FONT', [0], { store: 18 })
      a.op('BUFFER_MODE', [0])
      a.op('SET_TRUE_COLOUR', [L(0x7c00), L(0x001f)])
      a.op('BUFFER_SCREEN', [0], { store: 19 })
      a.op('SOUND_EFFECT', [1])
      a.op('QUIT')
    })
    const runs = r.m.state.screen.lower.runs
    expect(runs[0]).toMatchObject({ text: 'bold italic', style: 6 })
    expect(runs[1]).toMatchObject({ text: 'red', style: 0, fg: 3, bg: 4 })
    expect([r.word(0x40 + 0), r.word(0x40 + 2), r.word(0x40 + 4)]).toEqual([1, 0, 4])
    expect(r.m.state.screen.lower.bufferMode).toBe(false)
    expect(r.m.state.screen.beeps).toEqual([1])
  })

  it('v3: @show_status and every read set the status line from globals 0–2 (§8.2.2)', () => {
    const score = run(
      3,
      a => {
        a.routine('main')
        a.op('SHOW_STATUS')
        a.op('QUIT')
      },
      { objects: [{ name: 'West of House' }], globals: { 0: 1, 1: 0xfffb, 2: 12 } },
    )
    expect(score.m.state.screen.statusLine).toEqual({ location: 'West of House', score: -5, moves: 12 })
    const time = run(
      3,
      a => {
        a.routine('main')
        a.op('READ', [L(DATA), L(DATA + 100)])
        a.op('QUIT')
      },
      { objects: [{ name: 'Kitchen' }], globals: { 0: 1, 1: 9, 2: 30 }, header: { 1: 0x02 } },
    )
    expect(time.m.state.screen.statusLine).toEqual({ location: 'Kitchen', hours: 9, minutes: 30 })
  })
})

describe('input (§10, §13)', () => {
  const textBuffer = DATA
  const parseBuffer = DATA + 200

  it('v3 @sread: the text from byte 1, lowercased, zero-ended; the parse buffer’s words and positions (§15 read, §13.6)', () => {
    const r = run(
      3,
      a => {
        a.routine('main')
        a.op('STOREB', [L(textBuffer), 0, 20])
        a.op('STOREB', [L(parseBuffer), 0, 4])
        a.op('READ', [L(textBuffer), L(parseBuffer)])
        a.op('QUIT')
      },
      { words: ['take', 'lamp'] },
      ['Take the LAMP, now please'],
    )
    const text = [...Array(20)].map((_, i) => r.byte(textBuffer + 1 + i))
    // 19 letters at most (byte 0 − 1, §15 read in v1–4), then the terminator.
    expect(String.fromCharCode(...text.slice(0, 19))).toBe('take the lamp, now ')
    expect(text[19]).toBe(0)
    expect(r.byte(parseBuffer + 1)).toBe(4) // take, the, lamp, ",", (now: the 5th, past the 4 the buffer holds)
    const block = (i: number) => [r.word(parseBuffer + 2 + i * 4) !== 0, r.byte(parseBuffer + 4 + i * 4), r.byte(parseBuffer + 5 + i * 4)]
    expect([block(0), block(1), block(2), block(3)]).toEqual([
      [true, 4, 1],
      [false, 3, 6],
      [true, 4, 10],
      [false, 1, 14],
    ])
  })

  it('v5 @aread: the count in byte 1, the text from byte 2, the terminator stored; a parse buffer of 0 means no tokenising (§15 read)', () => {
    const r = run(
      5,
      a => {
        a.routine('main')
        a.op('STOREB', [L(textBuffer), 0, 5])
        a.op('READ', [L(textBuffer), 0], { store: 16 })
        a.op('QUIT')
      },
      { words: ['go'] },
      ['North!'],
    )
    expect(r.byte(textBuffer + 1)).toBe(5)
    expect(String.fromCharCode(...[0, 1, 2, 3, 4].map(i => r.byte(textBuffer + 2 + i)))).toBe('north')
    expect(r.word(0x40)).toBe(13)
  })

  it('v5 @aread reports text already in the buffer as preloaded', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('STOREB', [L(textBuffer), 0, 10])
      a.op('STOREB', [L(textBuffer), 1, 2])
      a.op('STOREB', [L(textBuffer), 2, 104])
      a.op('STOREB', [L(textBuffer), 3, 105])
      a.op('READ', [L(textBuffer), 0], { store: 0 })
      a.op('QUIT')
    })
    expect(r.stop).toEqual({ kind: 'input-line', maxLength: 10, preloaded: 'hi' })
  })

  it('@tokenise with a custom dictionary, and the flag that leaves unknown words’ blocks alone (§15 tokenise)', () => {
    const r = run(
      5,
      a => {
        a.routine('main')
        'xyzzy lamp'.split('').forEach((c, i) => a.op('STOREB', [L(textBuffer), i + 2, c.charCodeAt(0)]))
        a.op('STOREB', [L(textBuffer), 1, 10])
        a.op('STOREB', [L(parseBuffer), 0, 4])
        // The block for word 1 holds a marker; with the flag, an unknown word leaves it.
        a.op('STOREW', [L(parseBuffer + 2), 0, L(0xbeef)])
        a.op('TOKENISE', [L(textBuffer), L(parseBuffer), 0, 1])
        a.op('LOADW', [L(parseBuffer + 2), 0], { store: 16 })
        a.op('TOKENISE', [L(textBuffer), L(parseBuffer)])
        a.op('LOADW', [L(parseBuffer + 2), 0], { store: 17 })
        a.op('LOADW', [L(parseBuffer + 2), 2], { store: 18 })
        a.op('QUIT')
      },
      { words: ['lamp'] },
    )
    expect(r.word(0x40)).toBe(0xbeef)
    expect(r.word(0x42)).toBe(0)
    expect(r.word(0x44)).not.toBe(0)
  })

  it('@encode_text makes a dictionary word (§15 encode_text, §3.7)', () => {
    const r = run(5, a => {
      a.routine('main')
      'xhellox'.split('').forEach((c, i) => a.op('STOREB', [L(DATA), i, c.charCodeAt(0)]))
      a.op('ENCODE_TEXT', [L(DATA), 5, 1, L(DATA + 50)])
      a.op('QUIT')
    })
    // "hello" padded with 5s to 9 Z-characters: h e l l o 5 5 5 5, end bit on the last word.
    const z = [13, 10, 17, 17, 20, 5, 5, 5, 5]
    const words = [0, 3, 6].map(i => (z[i]! << 10) | (z[i + 1]! << 5) | z[i + 2]!)
    words[2]! |= 0x8000
    expect([r.word(DATA + 50), r.word(DATA + 52), r.word(DATA + 54)]).toEqual(words)
  })

  it('@read_char stops for a key and stores it', () => {
    const r = run(5, a => a.routine('main').op('READ_CHAR', [1], { store: 16 }).op('QUIT'), {}, ['x'])
    expect(r.word(0x40)).toBe(120)
  })

  it('timed input: the interrupt routine runs when the time is up; false keeps waiting, true ends the read (§10.2.4)', () => {
    const r = run(
      5,
      a => {
        a.routine('main')
        a.op('STOREB', [L(textBuffer), 0, 20])
        a.op('READ', [L(textBuffer), 0, 10, R('tick')], { store: 16 })
        a.op('PRINT', [], { text: '[ended]' })
        a.op('QUIT')
        // tick: prints, and ends the read the second time.
        a.routine('tick')
        a.op('PRINT', [], { text: 'tick ' })
        a.op('INC', [17])
        a.op('JE', [v(17), 2], { branch: { ret: true } })
        a.op('RFALSE')
      },
      {},
      ['timeout', 'timeout'],
    )
    expect(r.out).toBe('tick tick [ended]')
    expect(r.word(0x40)).toBe(0) // terminator 0: the read was ended by the interrupt
  })

  it('a timed @read_char that times out with a true interrupt stores 0', () => {
    const r = run(
      5,
      a => {
        a.routine('main').op('READ_CHAR', [1, 5, R('stop')], { store: 16 }).op('QUIT')
        a.routine('stop').op('RTRUE')
      },
      { globals: { 0: 99 } },
      ['timeout'],
    )
    expect(r.word(0x40)).toBe(0)
  })

  it('the stop says when a read has a time limit', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('STOREB', [L(textBuffer), 0, 20])
      a.op('READ', [L(textBuffer), 0, 10, R('tick')], { store: 16 })
      a.op('QUIT')
      a.routine('tick').op('RFALSE')
    })
    expect(r.stop).toMatchObject({ kind: 'input-line', timeout: { tenths: 10 } })
  })
})

describe('the game: random, verify, undo, save, restart, quit', () => {
  it('@random: in range; -n seeds ZVM’s xorshift; 0 goes back (§2.4)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('RANDOM', [L(-100)], { store: 0 }); p(a, sp)
      for (let i = 0; i < 3; i++) {
        a.op('RANDOM', [20], { store: 0 }); p(a, sp)
      }
      a.op('RANDOM', [0], { store: 0 }); p(a, sp)
      a.op('QUIT')
    })
    let seed = -100
    const next = () => {
      seed ^= seed << 13
      seed ^= seed >> 17
      seed ^= seed << 5
      return 1 + ((seed & 0x7fff) % 20)
    }
    expect(r.out).toBe(`0 ${next()} ${next()} ${next()} 0 `)
  })

  it('@verify checks the checksum; @piracy says genuine; @nop does nothing', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('VERIFY', [], { branch: { to: 'ok' } })
      a.op('QUIT')
      a.label('ok')
      a.op('PIRACY', [], { branch: { to: 'genuine' } })
      a.op('QUIT')
      a.label('genuine')
      a.op('NOP')
      a.op('PRINT', [], { text: 'ok' })
      a.op('QUIT')
    })
    expect(r.out).toBe('ok')
  })

  it('@save_undo and @restore_undo: 1 when saved, 2 when restored to (§15)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('SAVE_UNDO', [], { store: 16 })
      a.op('JE', [v(16), 2], { branch: { to: 'restored' } })
      a.op('STORE', [17, 77]) // undone
      a.op('RESTORE_UNDO', [], { store: 0 })
      a.op('PRINT', [], { text: 'not here' })
      a.op('QUIT')
      a.label('restored')
      p(a, v(17))
      a.op('RESTORE_UNDO', [], { store: 0 }) // nothing left: 0
      p(a, sp)
      a.op('QUIT')
    })
    expect(r.out).toBe('0 0 ')
  })

  it('save and restore to files fail until Phase 2 (v3 branch, v4 store, v5+ extended)', () => {
    const r3 = run(3, a => a.routine('main').op('SAVE', [], { branch: { to: 'saved' } }).op('RESTORE', [], { branch: { to: 'saved' } }).op('PRINT', [], { text: 'failed' }).op('QUIT').label('saved').op('QUIT'))
    expect(r3.out).toBe('failed')
    const r4 = run(4, a => a.routine('main').op('SAVE', [], { store: 0 }).op('PRINT_NUM', [sp]).op('RESTORE', [], { store: 0 }).op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r4.out).toBe('00')
    const r5 = run(5, a => a.routine('main').op('SAVE', [], { store: 0 }).op('PRINT_NUM', [sp]).op('RESTORE', [], { store: 0 }).op('PRINT_NUM', [sp]).op('QUIT'))
    expect(r5.out).toBe('00')
  })

  it('@restart reloads dynamic memory but keeps the transcript bit (§6.1.3, §11.1)', () => {
    const r = run(5, a => {
      a.routine('main')
      a.op('LOADW', [0x10, 0], { store: 0 })
      a.op('TEST', [sp, 1], { branch: { to: 'second' } })
      a.op('STORE', [16, 5])
      a.op('OUTPUT_STREAM', [2])
      a.op('RESTART')
      a.label('second')
      p(a, v(16)) // reset to 0 by the restart
      a.op('QUIT')
    })
    expect(r.out).toBe('0 ')
    expect(r.stop).toEqual({ kind: 'quit' })
  })

  it('the header says what the interpreter does (§11)', () => {
    const r3 = run(3, a => a.routine('main').op('QUIT'))
    expect(r3.byte(1) & 0x70).toBe(0x60) // status line available, split available, variable-pitch default
    const r5 = run(5, a => a.routine('main').op('QUIT'))
    expect(r5.byte(1) & 0x9c).toBe(0x9c) // bold, italic, fixed, timed input
    expect([r5.byte(0x32), r5.byte(0x33)]).toEqual([1, 1])
  })
})

describe('faults', () => {
  it('an opcode the version doesn’t have is a fault (§14)', () => {
    const r = run(5, a => a.routine('main').bytes(0xbe, 0x20, 0xff).op('QUIT'))
    expect(r.stop).toMatchObject({ kind: 'fault', fault: { code: 'illegal-opcode' } })
  })

  it('resume() when nothing is waiting says so', () => {
    const m = Machine.create(assemble(5, a => a.routine('main').op('QUIT')), { seed: 1 }) as Machine
    m.run(100)
    expect(m.resume({ line: 'x' })).toMatchObject({ code: 'not-waiting' })
  })
})

describe('every opcode of every version runs (decoding and dispatch per version)', () => {
  /** Harmless operands for each opcode; behaviour is checked by the tests above (v5) and the walkthroughs. */
  const snippet = (a: Asm, name: string, version: Version) => {
    const st = { store: 16 }
    const br = { branch: { to: `after-${name}` } }
    const done = () => a.label(`after-${name}`)
    switch (name) {
      case 'JE': case 'JL': case 'JG': case 'TEST': return a.op(name, [1, 1], br) && done()
      case 'JZ': return a.op(name, [0], br) && done()
      case 'JIN': return a.op(name, [2, 1], br) && done()
      case 'TEST_ATTR': return a.op(name, [1, 1], br) && done()
      case 'INC_CHK': case 'DEC_CHK': return a.op(name, [17, 0], br) && done()
      case 'GET_SIBLING': case 'GET_CHILD': return a.op(name, [1], { ...st, ...br }) && done()
      case 'SCAN_TABLE': return a.op(name, [0, L(DATA), 2], { ...st, ...br }) && done()
      case 'CHECK_ARG_COUNT': return a.op(name, [1], br) && done()
      case 'VERIFY': case 'PIRACY': return a.op(name, [], br) && done()
      case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD': case 'OR': case 'AND': case 'LOG_SHIFT': case 'ART_SHIFT': return a.op(name, [6, 2], st)
      case 'NOT': case 'LOAD': return a.op(name, [17], st)
      case 'STORE': return a.op(name, [17, 3])
      case 'INC': case 'DEC': return a.op(name, [17])
      case 'PUSH': return a.op(name, [1])
      case 'PULL': return a.op('PUSH', [1]).op(name, [17])
      case 'POP': return a.op('PUSH', [1]).op(name)
      case 'CATCH': return a.op(name, [], st)
      case 'LOADW': case 'LOADB': return a.op(name, [L(DATA), 0], st)
      case 'STOREW': case 'STOREB': return a.op(name, [L(DATA), 0, 0])
      case 'COPY_TABLE': return a.op(name, [L(DATA), L(DATA + 10), 4])
      case 'GET_PARENT': return a.op(name, [2], st)
      case 'GET_PROP': return a.op(name, [1, 10], st)
      case 'GET_PROP_ADDR': return a.op(name, [1, 10], st)
      case 'GET_PROP_LEN': return a.op(name, [0], st)
      case 'GET_NEXT_PROP': return a.op(name, [1, 0], st)
      case 'PUT_PROP': return a.op(name, [1, 10, 5])
      case 'SET_ATTR': case 'CLEAR_ATTR': return a.op(name, [1, 2])
      case 'INSERT_OBJ': return a.op(name, [3, 1])
      case 'REMOVE_OBJ': return a.op(name, [3])
      case 'CALL': case 'CALL_VS': case 'CALL_1S': return a.op(name, [R('nothing')], st)
      case 'CALL_2S': return a.op(name, [R('nothing'), 1], st)
      case 'CALL_VS2': return a.op(name, [R('nothing'), 1, 2, 3, 4, 5], st)
      case 'CALL_1N': return a.op(name, [R('nothing')])
      case 'CALL_2N': return a.op(name, [R('nothing'), 1])
      case 'CALL_VN': return a.op(name, [R('nothing'), 1])
      case 'CALL_VN2': return a.op(name, [R('nothing'), 1, 2, 3, 4, 5])
      case 'PRINT': case 'PRINT_RET': return name === 'PRINT' ? a.op(name, [], { text: 'p' }) : a.op(version <= 3 ? 'CALL' : 'CALL_VS', [R('printret')], st)
      case 'NEW_LINE': return a.op(name)
      case 'PRINT_CHAR': return a.op(name, [65])
      case 'PRINT_NUM': return a.op(name, [5])
      case 'PRINT_ADDR': return a.op(name, [L(DATA)])
      case 'PRINT_PADDR': return a.op(name, [R('str')])
      case 'PRINT_OBJ': return a.op(name, [1])
      case 'PRINT_TABLE': return a.op(name, [L(DATA), 2])
      case 'PRINT_UNICODE': return a.op(name, [65])
      case 'CHECK_UNICODE': return a.op(name, [65], st)
      case 'RANDOM': return a.op(name, [6], st)
      case 'NOP': case 'SHOW_STATUS': return a.op(name)
      case 'SPLIT_WINDOW': return a.op(name, [1])
      case 'SET_WINDOW': return a.op(name, [0])
      case 'ERASE_WINDOW': return a.op(name, [1])
      case 'ERASE_LINE': return a.op(name, [1])
      case 'SET_CURSOR': return a.op('SET_WINDOW', [1]).op(name, [1, 1]).op('SET_WINDOW', [0])
      case 'GET_CURSOR': return a.op(name, [L(DATA)])
      case 'SET_TEXT_STYLE': return a.op(name, [0])
      case 'BUFFER_MODE': return a.op(name, [1])
      case 'OUTPUT_STREAM': return a.op(name, [1])
      case 'INPUT_STREAM': return a.op(name, [0])
      case 'SOUND_EFFECT': return a.op(name, [1])
      case 'SET_COLOUR': return a.op(name, [1, 1])
      case 'SET_FONT': return a.op(name, [1], st)
      case 'SET_TRUE_COLOUR': return a.op(name, [L(-1), L(-1)])
      case 'BUFFER_SCREEN': return a.op(name, [0], st)
      case 'TOKENISE': return a.op(name, [L(DATA + 100), L(DATA + 200)])
      case 'ENCODE_TEXT': return a.op(name, [L(DATA), 1, 0, L(DATA + 50)])
      case 'SAVE': case 'RESTORE': return version <= 3 ? a.op(name, [], br) && done() : a.op(name, [], st)
      case 'SAVE_UNDO': case 'RESTORE_UNDO': return a.op(name, [], st)
      case 'READ': return a.op(name, version >= 5 ? [L(DATA + 100), L(DATA + 200)] : [L(DATA + 100), L(DATA + 200)], version >= 5 ? st : {})
      case 'READ_CHAR': return a.op(name, [1], st)
      case 'THROW': return a.op(version <= 3 ? 'CALL' : 'CALL_VS', [R('thrower')], st)
      case 'JUMP': return a.jump(`after-${name}`) && done()
      // Done last, or as the program's frame: these end or restart it.
      case 'RET': case 'RTRUE': case 'RFALSE': case 'RET_POPPED': case 'QUIT': case 'RESTART':
        return a
    }
    throw new Error(`no snippet for ${name}`)
  }

  for (const version of [3, 4, 5, 8] as Version[]) {
    it(`v${version}`, () => {
      const names: string[] = []
      for (const look of [op2, op1, op0, opVar, opExt]) for (let n = 0; n < 32; n++) { const i = look(n, version); if (i && !names.includes(i.name)) names.push(i.name) }
      const inputs: string[] = []
      const r = run(
        version,
        a => {
          a.routine('main')
          // A restart comes back here: the transcript bit (which survives it) says it already happened.
          a.op('LOADW', [0x10, 0], { store: 0 })
          a.op('TEST', [sp, 1], { branch: { to: 'end' } })
          a.op('STOREB', [L(DATA + 100), 0, 10])
          a.op('STOREB', [L(DATA + 200), 0, 4])
          for (const n of names) {
            snippet(a, n, version)
            if (n === 'READ') inputs.push('take lamp')
            if (n === 'READ_CHAR') inputs.push('x')
          }
          a.op('OUTPUT_STREAM', [2])
          a.op('RESTART')
          a.label('end')
          a.op('QUIT')
          a.routine('nothing', 1).op(version <= 3 ? 'CALL' : 'CALL_VS', [R('rets')], { store: 0 }).op('RET_POPPED')
          a.routine('rets').op(version <= 3 ? 'CALL' : 'CALL_VS', [R('rf')], { store: 0 }).op('RTRUE')
          a.routine('rf').op(version <= 3 ? 'CALL' : 'CALL_VS', [R('r9')], { store: 0 }).op('RFALSE')
          a.routine('r9').op('RET', [9])
          a.routine('printret').op('PRINT_RET', [], { text: 'r' })
          if (version >= 5) a.routine('thrower', 1).op('CATCH', [], { store: 1 }).op('THROW', [1, v(1)])
          a.string('str', 'paddr')
        },
        {
          objects: [
            { name: 'room', child: 2, attributes: [1], properties: { 10: [0, 1] } },
            { name: 'box', parent: 1, sibling: 0 },
            { name: 'key' },
          ],
          words: ['lamp', 'take'],
        },
        inputs,
      )
      expect(r.stop, JSON.stringify(r.stop)).toEqual({ kind: 'quit' })
    })
  }
})

describe('coverage', () => {
  it('between these tests and the walkthroughs, every opcode of every version has run', async () => {
    for (const file of sampleFiles()) {
      const w = new URL(`../../../samples/walkthroughs/${file.replace(/\.z\d$/, '')}.txt`, import.meta.url)
      if (!existsSync(w)) continue
      const { play } = await import('../src/index.js')
      const r = play(readSample(file), readScript(w), { seed: 1 })
      record(r.machine!)
    }
    for (const version of [3, 4, 5, 8] as Version[]) {
      const all = new Set<string>()
      for (const look of [op0, op1, op2, opVar, opExt]) for (let n = 0; n < 32; n++) { const i = look(n, version); if (i) all.add(i.name) }
      const missing = [...all].filter(n => !ran[version]!.has(n))
      expect(missing, `v${version}`).toEqual([])
    }
  })
})
