/**
 * What each operand position of each opcode holds — a number, an object, a
 * variable named by number, a routine, a string, … — as txd shows them. Shared
 * by the txd formatter and the cross-reference index.
 */
import type { Instruction } from './decode.js'

/**
 * How txd shows each operand position, by opcode (observed from its output):
 *   any      a large constant that is a string's packed address → S###, a dictionary
 *            address → "text" (both → S### OR "text"); otherwise a number
 *   num      a number
 *   attr     an attribute number; prop: a property number (numbers in txd's text; names with symbols)
 *   obj      an object's number → its short name in quotes
 *   low      a byte address inside the dictionary → "text" decoded there
 *   ref      a variable named by number (store, inc, pull …)
 *   routine  a packed routine address → the routine
 *   paddr    a packed string address → S###
 *   style    set_text_style's style; stream: output_stream's stream; char: print_char's character
 * A position past the end of its list takes the list's last type.
 */
export type Kind = 'any' | 'num' | 'obj' | 'low' | 'ref' | 'routine' | 'paddr' | 'style' | 'stream' | 'char' | 'attr' | 'prop'
export const KINDS: Record<string, Kind[]> = {
  JE: ['any'], JL: ['num'], JG: ['num'], DEC_CHK: ['ref', 'num'], INC_CHK: ['ref', 'num'],
  JIN: ['obj', 'obj'], TEST: ['num'], OR: ['num'], AND: ['num'],
  TEST_ATTR: ['obj', 'attr'], SET_ATTR: ['obj', 'attr'], CLEAR_ATTR: ['obj', 'attr'],
  STORE: ['ref', 'any'], INSERT_OBJ: ['obj', 'obj'], LOADW: ['low', 'num'], LOADB: ['low', 'num'],
  GET_PROP: ['obj', 'prop'], GET_PROP_ADDR: ['obj', 'prop'], GET_NEXT_PROP: ['obj', 'prop'],
  ADD: ['any'], SUB: ['num'], MUL: ['num'], DIV: ['num'], MOD: ['num'],
  JZ: ['num'], GET_SIBLING: ['obj'], GET_CHILD: ['obj'], GET_PARENT: ['obj'], GET_PROP_LEN: ['num'],
  INC: ['ref'], DEC: ['ref'], PRINT_ADDR: ['low'], REMOVE_OBJ: ['obj'], PRINT_OBJ: ['obj'], RET: ['any'],
  PRINT_PADDR: ['paddr'], LOAD: ['ref'], NOT: ['num'],
  STOREW: ['low', 'num', 'any'], STOREB: ['low', 'num', 'any'], PUT_PROP: ['obj', 'prop', 'any'],
  PRINT_CHAR: ['char'], PRINT_NUM: ['num'], RANDOM: ['num'], PUSH: ['any'], PULL: ['ref'],
  SET_TEXT_STYLE: ['style'], OUTPUT_STREAM: ['stream', 'num'], READ_CHAR: ['num', 'num', 'routine'],
  // Timed input's routine (v4+), and the routine a sound calls when it finishes (v5+).
  READ: ['low', 'low', 'num', 'routine'], SOUND_EFFECT: ['num', 'num', 'num', 'routine'],
}

/** The kind of operand `i` of `ins` (a call's first operand is its routine). */
export function operandKind(ins: Instruction, i: number): Kind {
  const kinds = KINDS[ins.name] ?? (ins.info.call ? (['routine', 'any'] as Kind[]) : (['num'] as Kind[]))
  return kinds[Math.min(i, kinds.length - 1)]!
}
