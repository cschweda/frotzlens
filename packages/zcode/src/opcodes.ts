/**
 * The Z-machine's opcodes (Standard §14, §15), for versions 3–5 and 8: name,
 * and whether the instruction stores a result, branches, or carries inline
 * text. Names are the Standard's in capitals, as txd prints them.
 */
import type { Version } from './types.js'

export type OpForm = 'short' | 'long' | 'variable' | 'extended'
export type OpCount = '0OP' | '1OP' | '2OP' | 'VAR' | 'EXT'

export interface OpInfo {
  name: string
  store?: boolean
  branch?: boolean
  /** An inline string follows the operands (print, print_ret). */
  text?: boolean
  /** Control never falls through to the next instruction. */
  terminal?: boolean
  /** A routine call; its first operand is the routine. */
  call?: boolean
  /** Up to 8 operands, with two operand-type bytes (call_vs2, call_vn2: §4.4.3.1). */
  doubleTypes?: boolean
}

type Table = Record<number, OpInfo | ((v: Version) => OpInfo | undefined)>

const T = (name: string, more: Partial<OpInfo> = {}): OpInfo => ({ name, ...more })

/** 0OP: §14.1, opcodes 0xb0–0xbf (short form, operand type 11). */
const OP0: Table = {
  0x0: T('RTRUE', { terminal: true }),
  0x1: T('RFALSE', { terminal: true }),
  0x2: T('PRINT', { text: true }),
  0x3: T('PRINT_RET', { text: true, terminal: true }),
  0x4: T('NOP'),
  // save/restore: branch in v1–3, store in v4; extended in v5+ (§15).
  0x5: v => (v <= 3 ? T('SAVE', { branch: true }) : v === 4 ? T('SAVE', { store: true }) : undefined),
  0x6: v => (v <= 3 ? T('RESTORE', { branch: true }) : v === 4 ? T('RESTORE', { store: true }) : undefined),
  0x7: T('RESTART', { terminal: true }),
  0x8: T('RET_POPPED', { terminal: true }),
  0x9: v => (v <= 4 ? T('POP') : T('CATCH', { store: true })),
  0xa: T('QUIT', { terminal: true }),
  0xb: T('NEW_LINE'),
  0xc: v => (v === 3 ? T('SHOW_STATUS') : undefined),
  0xd: T('VERIFY', { branch: true }),
  // 0xe is the extended-opcode prefix in v5+ (decoded separately).
  0xf: v => (v >= 5 ? T('PIRACY', { branch: true }) : undefined),
}

/** 1OP: §14.1, opcodes 0x80–0xaf. */
const OP1: Table = {
  0x0: T('JZ', { branch: true }),
  0x1: T('GET_SIBLING', { store: true, branch: true }),
  0x2: T('GET_CHILD', { store: true, branch: true }),
  0x3: T('GET_PARENT', { store: true }),
  0x4: T('GET_PROP_LEN', { store: true }),
  0x5: T('INC'),
  0x6: T('DEC'),
  0x7: T('PRINT_ADDR'),
  0x8: v => (v >= 4 ? T('CALL_1S', { store: true, call: true }) : undefined),
  0x9: T('REMOVE_OBJ'),
  0xa: T('PRINT_OBJ'),
  0xb: T('RET', { terminal: true }),
  0xc: T('JUMP', { terminal: true }),
  0xd: T('PRINT_PADDR'),
  0xe: T('LOAD', { store: true }),
  0xf: v => (v <= 4 ? T('NOT', { store: true }) : T('CALL_1N', { call: true })),
}

/** 2OP: §14.1, opcodes 0x00–0x7f (long form) and 0xc0–0xdf (variable form). */
const OP2: Table = {
  0x01: T('JE', { branch: true }),
  0x02: T('JL', { branch: true }),
  0x03: T('JG', { branch: true }),
  0x04: T('DEC_CHK', { branch: true }),
  0x05: T('INC_CHK', { branch: true }),
  0x06: T('JIN', { branch: true }),
  0x07: T('TEST', { branch: true }),
  0x08: T('OR', { store: true }),
  0x09: T('AND', { store: true }),
  0x0a: T('TEST_ATTR', { branch: true }),
  0x0b: T('SET_ATTR'),
  0x0c: T('CLEAR_ATTR'),
  0x0d: T('STORE'),
  0x0e: T('INSERT_OBJ'),
  0x0f: T('LOADW', { store: true }),
  0x10: T('LOADB', { store: true }),
  0x11: T('GET_PROP', { store: true }),
  0x12: T('GET_PROP_ADDR', { store: true }),
  0x13: T('GET_NEXT_PROP', { store: true }),
  0x14: T('ADD', { store: true }),
  0x15: T('SUB', { store: true }),
  0x16: T('MUL', { store: true }),
  0x17: T('DIV', { store: true }),
  0x18: T('MOD', { store: true }),
  0x19: v => (v >= 4 ? T('CALL_2S', { store: true, call: true }) : undefined),
  0x1a: v => (v >= 5 ? T('CALL_2N', { call: true }) : undefined),
  0x1b: v => (v >= 5 ? T('SET_COLOUR') : undefined),
  0x1c: v => (v >= 5 ? T('THROW', { terminal: true }) : undefined),
}

/** VAR: §14.1, opcodes 0xe0–0xff. */
const OPV: Table = {
  0x00: v => (v <= 3 ? T('CALL', { store: true, call: true }) : T('CALL_VS', { store: true, call: true })),
  0x01: T('STOREW'),
  0x02: T('STOREB'),
  0x03: T('PUT_PROP'),
  // sread (v1–4) / aread (v5+, which stores): txd calls both READ.
  0x04: v => (v <= 4 ? T('READ') : T('READ', { store: true })),
  0x05: T('PRINT_CHAR'),
  0x06: T('PRINT_NUM'),
  0x07: T('RANDOM', { store: true }),
  0x08: T('PUSH'),
  0x09: T('PULL'),
  0x0a: v => (v >= 3 ? T('SPLIT_WINDOW') : undefined),
  0x0b: v => (v >= 3 ? T('SET_WINDOW') : undefined),
  0x0c: v => (v >= 4 ? T('CALL_VS2', { store: true, call: true, doubleTypes: true }) : undefined),
  0x0d: v => (v >= 4 ? T('ERASE_WINDOW') : undefined),
  0x0e: v => (v >= 4 ? T('ERASE_LINE') : undefined),
  0x0f: v => (v >= 4 ? T('SET_CURSOR') : undefined),
  0x10: v => (v >= 4 ? T('GET_CURSOR') : undefined),
  0x11: v => (v >= 4 ? T('SET_TEXT_STYLE') : undefined),
  0x12: v => (v >= 4 ? T('BUFFER_MODE') : undefined),
  0x13: v => (v >= 3 ? T('OUTPUT_STREAM') : undefined),
  0x14: v => (v >= 3 ? T('INPUT_STREAM') : undefined),
  0x15: v => (v >= 3 ? T('SOUND_EFFECT') : undefined),
  0x16: v => (v >= 4 ? T('READ_CHAR', { store: true }) : undefined),
  0x17: v => (v >= 4 ? T('SCAN_TABLE', { store: true, branch: true }) : undefined),
  0x18: v => (v >= 5 ? T('NOT', { store: true }) : undefined),
  0x19: v => (v >= 5 ? T('CALL_VN', { call: true }) : undefined),
  0x1a: v => (v >= 5 ? T('CALL_VN2', { call: true, doubleTypes: true }) : undefined),
  0x1b: v => (v >= 5 ? T('TOKENISE') : undefined),
  0x1c: v => (v >= 5 ? T('ENCODE_TEXT') : undefined),
  0x1d: v => (v >= 5 ? T('COPY_TABLE') : undefined),
  0x1e: v => (v >= 5 ? T('PRINT_TABLE') : undefined),
  0x1f: v => (v >= 5 ? T('CHECK_ARG_COUNT', { branch: true }) : undefined),
}

/** EXT: §14.2, opcodes 0xbe followed by the number (v5+). */
const OPX: Table = {
  0x00: T('SAVE', { store: true }),
  0x01: T('RESTORE', { store: true }),
  0x02: T('LOG_SHIFT', { store: true }),
  0x03: T('ART_SHIFT', { store: true }),
  0x04: T('SET_FONT', { store: true }),
  0x09: T('SAVE_UNDO', { store: true }),
  0x0a: T('RESTORE_UNDO', { store: true }),
  0x0b: T('PRINT_UNICODE'),
  0x0c: T('CHECK_UNICODE', { store: true }),
  0x0d: T('SET_TRUE_COLOUR'),
  // Standard 1.1 (§15, EXT:29): whether the screen may buffer output. Inform 6 never emits it.
  0x1d: T('BUFFER_SCREEN', { store: true }),
}

const look = (table: Table, n: number, v: Version): OpInfo | undefined => {
  const e = table[n]
  return typeof e === 'function' ? e(v) : e
}

export const op0 = (n: number, v: Version) => look(OP0, n, v)
export const op1 = (n: number, v: Version) => look(OP1, n, v)
export const op2 = (n: number, v: Version) => look(OP2, n, v)
export const opVar = (n: number, v: Version) => look(OPV, n, v)
export const opExt = (n: number, v: Version) => (v >= 5 ? look(OPX, n, v) : undefined)
