/**
 * Phase 6b: a routine's instructions as Inform statements where they can be (docs/09-decompiler.md
 * §3c, "Expressions"). The Z-machine is a stack machine: what one instruction pushes, a later one
 * pulls. Followed through the routine, those become nested expressions, a store to a variable an
 * assignment, and a print, call, move or return its statement:
 *
 *   @mul x 2 -> sp; @sub sp g -> y;     becomes   y = x*2 - g;
 *
 * A plain push stays assembly, and so does what takes its value: Inform never pushes a variable or a
 * number only to pass it on, so a push in a story is the compiler's own scaffolding (strict mode's).
 *
 * Branches and jumps stay assembly here (`if (a == b) jump L;` doesn't compile to one branch; 6c
 * writes them as if, while and for), and so does anything not translated, mixed in the same routine,
 * which Inform allows. A value left on the stack across a label or a branch stays assembly too.
 *
 * Whether each routine's statements compile back to the same instructions is checked by compiling
 * them (verify.ts): a routine that doesn't is written as assembly instead.
 */
import type { Instruction, Operand } from '../decode.js'
import type { Routine } from '../routines.js'
import { instructionText, operandText, routineLabels, type AsmNames } from './asm.js'

/** An expression waiting on the stack: its text, how tightly it binds, and the assembly it came from. */
interface Node {
  text: string
  precedence: number
  asm: string[]
}

const BINARY: Record<string, [string, number]> = {
  ADD: ['+', 4], SUB: ['-', 4], MUL: ['*', 5], DIV: ['/', 5], MOD: ['%', 5], AND: ['&', 6], OR: ['|', 6],
}
const ATOM = 10
/** Inform's `style` statement's words, by the text style they set (§15, set_text_style). */
const STYLES: Record<number, string> = { 0: 'roman', 1: 'reverse', 2: 'bold', 4: 'underline', 8: 'fixed' }

/** Opcodes whose first operand names a variable (§14.2.3). */
const VARIABLE_REFERENCE = new Set(['INC', 'DEC', 'INC_CHK', 'DEC_CHK', 'STORE', 'LOAD', 'PULL'])

export interface StatementNames extends AsmNames {
  /** A property's name, by number. */
  property: (n: number) => string | undefined
  /** An attribute's name, by number. */
  attribute: (n: number) => string | undefined
  /** An object's name, by number. */
  object: (n: number) => string | undefined
}

/**
 * The routine's body as statements and assembly, four spaces in, labels two; or undefined when it
 * has nothing a statement would make clearer.
 */
export function routineStatements(r: Routine, n: StatementNames): string[] {
  const labels = routineLabels(r)
  const out: string[] = []
  /** Expressions pushed and not yet pulled. Below them, `real` values the assembly pushed. */
  let pending: Node[] = []
  let real = 0
  const flush = () => {
    for (const p of pending) for (const l of p.asm) out.push(l)
    real += pending.length
    pending = []
  }
  const asm = (i: Instruction) => `    ${instructionText(i, labels, n)}`

  /** An operand as the assembly names it (a routine, a string, a word, an action), but -1 for $FFFF. */
  const constant = (op: Operand, i: Instruction, index: number): string => {
    const text = operandText(i, op, index, n)
    return /^\$[0-9A-F]+$/.test(text) ? String(Number.parseInt(text.slice(1), 16) - 0x10000) : text
  }

  for (const i of r.instructions) {
    const label = labels.get(i.address)
    if (label) {
      flush()
      out.push(`  .${label};`)
    }

    // The operands, the stack's taken off as the machine takes them: the first is the top.
    const sp = i.operands.map((op, k) => op.kind === 'variable' && op.value === 0 && !(k === 0 && VARIABLE_REFERENCE.has(i.name)))
    const needed = sp.filter(Boolean).length + (i.name === 'RET_POPPED' ? 1 : 0) // it takes the top without naming it
    if (needed > pending.length) {
      // It takes values pushed by assembly: it stays assembly, and so do any expressions waiting.
      flush()
      real -= Math.min(real, needed)
      out.push(asm(i))
      continue
    }
    const taken = pending.splice(pending.length - needed, needed).reverse()
    let t = 0
    const operand = (k: number): Node => {
      const op = i.operands[k]!
      if (sp[k]) return taken[t++]!
      return { text: constant(op, i, k), precedence: ATOM, asm: [] }
    }
    const ops = i.operands.map((_, k) => operand(k))
    /** An operand that is an object: by its name when it's a one-byte number the names know. */
    const obj = (k: number): string => {
      const op = i.operands[k]!
      if (!sp[k] && op.kind === 'small') return n.object(op.value) ?? ops[k]!.text
      return ops[k]!.text
    }
    const sub = (node: Node, above: number) => (node.precedence < above ? `(${node.text})` : node.text)
    const asmOf = [...taken.slice().reverse().flatMap(x => x.asm)]
    const keep = (node: Node) => {
      // A value for the stack, or for a variable.
      if (i.store === 0) pending.push({ ...node, asm: [...asmOf, asm(i)] })
      else if (i.store !== undefined) out.push(`    ${n.variable(i.store)} = ${node.text};`)
    }
    const statement = (text: string) => out.push(`    ${text};`)
    const fallBack = () => {
      // What's waiting below was pushed before what this took: out first, in order.
      flush()
      for (const l of asmOf) out.push(l)
      out.push(asm(i))
    }

    // Branches and jumps, and what's left on the stack before them, stay assembly (6c).
    const target = i.operands[0]
    const namesStack = VARIABLE_REFERENCE.has(i.name) && target?.kind !== 'variable' && target?.value === 0
    if (namesStack) {
      fallBack()
      continue
    }
    if (i.branch || i.jumpTarget !== undefined || i.info.terminal && !['RTRUE', 'RFALSE', 'RET', 'RET_POPPED', 'PRINT_RET', 'QUIT'].includes(i.name)) {
      flush()
      for (const l of asmOf) out.push(l)
      out.push(asm(i))
      continue
    }

    const name = i.name
    if (BINARY[name] && ops.length === 2 && i.store !== undefined) {
      const [sym, prec] = BINARY[name]!
      keep({ text: `${sub(ops[0]!, prec)} ${sym} ${sub(ops[1]!, prec + 1)}`, precedence: prec, asm: [] })
    } else if (name === 'LOADW' && i.store !== undefined) keep({ text: `${sub(ops[0]!, ATOM)}-->${sub(ops[1]!, ATOM)}`, precedence: 8, asm: [] })
    else if (name === 'LOADB' && i.store !== undefined) keep({ text: `${sub(ops[0]!, ATOM)}->${sub(ops[1]!, ATOM)}`, precedence: 8, asm: [] })
    else if (name === 'GET_PROP' && i.store !== undefined && i.operands[1]!.kind !== 'variable' && n.property(i.operands[1]!.value)) {
      keep({ text: `${i.operands[0]!.kind === 'small' ? obj(0) : sub(ops[0]!, ATOM)}.${n.property(i.operands[1]!.value)}`, precedence: 9, asm: [] })
    } else if (name === 'GET_PARENT' && i.store !== undefined) keep({ text: `parent(${obj(0)})`, precedence: ATOM, asm: [] })
    else if (name === 'RANDOM' && i.store !== undefined) keep({ text: `random(${ops[0]!.text})`, precedence: ATOM, asm: [] })
    else if (i.info.call && i.store !== undefined && i.operands[0]!.kind !== 'variable' && n.routine(i.operands[0]!.value)) {
      keep({ text: `${n.routine(i.operands[0]!.value)}(${ops.slice(1).map(o => o.text).join(', ')})`, precedence: ATOM, asm: [] })
    }
    else if (name === 'STORE' && i.operands[0]!.kind !== 'variable') statement(`${n.variable(i.operands[0]!.value)} = ${ops[1]!.text}`)
    else if (name === 'STOREW') statement(`${sub(ops[0]!, ATOM)}-->${sub(ops[1]!, ATOM)} = ${ops[2]!.text}`)
    else if (name === 'STOREB') statement(`${sub(ops[0]!, ATOM)}->${sub(ops[1]!, ATOM)} = ${ops[2]!.text}`)
    else if ((name === 'INC' || name === 'DEC') && i.operands[0]!.kind !== 'variable') statement(`${n.variable(i.operands[0]!.value)}${name === 'INC' ? '++' : '--'}`)
    else if (name === 'PRINT' && i.text) statement(`print ${n.stringLiteral(i.text.text)}`)
    else if (name === 'PRINT_RET' && i.text) statement(`print_ret ${n.stringLiteral(i.text.text)}`)
    else if (name === 'NEW_LINE') statement('new_line')
    else if (name === 'PRINT_NUM') statement(`print ${ops[0]!.text}`)
    else if (name === 'PRINT_CHAR') statement(`print (char) ${ops[0]!.text}`)
    // A string literal: Inform prints a long one from the strings area by itself (print_paddr).
    else if (name === 'PRINT_PADDR' && !sp[0] && ops[0]!.text.startsWith('"')) statement(`print ${ops[0]!.text}`)
    else if (name === 'PRINT_PADDR') statement(`print (string) ${ops[0]!.text}`)
    else if (name === 'PRINT_OBJ') statement(`print (object) ${obj(0)}`)
    else if (i.info.call && i.store === undefined && i.operands[0]!.kind !== 'variable' && n.routine(i.operands[0]!.value)) {
      statement(`${n.routine(i.operands[0]!.value)}(${ops.slice(1).map(o => o.text).join(', ')})`)
    } else if (name === 'SET_ATTR' && i.operands[1]!.kind !== 'variable' && n.attribute(i.operands[1]!.value)) statement(`give ${obj(0)} ${n.attribute(i.operands[1]!.value)}`)
    else if (name === 'CLEAR_ATTR' && i.operands[1]!.kind !== 'variable' && n.attribute(i.operands[1]!.value)) statement(`give ${obj(0)} ~${n.attribute(i.operands[1]!.value)}`)
    else if (name === 'INSERT_OBJ') statement(`move ${obj(0)} to ${obj(1)}`)
    else if (name === 'REMOVE_OBJ') statement(`remove ${obj(0)}`)
    else if (name === 'RTRUE') statement('rtrue')
    else if (name === 'RFALSE') statement('rfalse')
    else if (name === 'RET') statement(`return ${ops[0]!.text}`)
    // (Not a value only pushed, as strict mode's checks do: `return 0;` compiles to rfalse.)
    else if (name === 'RET_POPPED' && taken.length === 1 && !taken[0]!.asm.at(-1)?.trim().startsWith('@push')) statement(`return ${ops.length ? ops[0]!.text : taken[0]!.text}`)
    else if (name === 'SET_TEXT_STYLE' && i.operands[0]!.kind !== 'variable' && STYLES[i.operands[0]!.value]) statement(`style ${STYLES[i.operands[0]!.value]}`)
    else if (name === 'QUIT') statement('quit')
    else {
      fallBack()
      continue
    }
    // A statement ran: anything still waiting below was evaluated before it, so it goes out first.
    if (i.store !== 0) {
      if (pending.length) {
        const below = pending
        pending = []
        const last = out.pop()!
        for (const p of below) for (const l of p.asm) out.push(l)
        real += below.length
        out.push(last)
      }
    }
  }
  flush()
  return out
}
