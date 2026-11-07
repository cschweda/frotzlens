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

/**
 * The routine before it's written out: lines, labels, and the branches and jumps between them, each
 * with its assembly (written when it's not made part of an if or a loop, 6c) and, for a branch, its
 * condition both ways.
 */
type Item =
  | { k: 'line'; text: string }
  | { k: 'label'; name: string }
  | { k: 'branch'; taken: string; notTaken: string; target?: string; returns?: boolean; asm: string[]; test: { op: string; args: string[]; onTrue: boolean } }
  | { k: 'jump'; target: string; asm: string[] }
  /** `get_sibling x -> x ?top`: the end of an objectloop's round. */
  | { k: 'next'; variable: string; target: string; asm: string[] }
  /** A value pulled into a variable (`@pull temp_global`): how a switch's subject is evaluated. */
  | { k: 'subject'; variable: string; expr: string; asm: string[] }

/** An expression waiting on the stack: its text, how tightly it binds, and the assembly it came from. */
interface Node {
  text: string
  precedence: number
  asm: string[]
  /** A condition's value (`o ofclass C`): tested with jz, it's written as itself, not `~= 0`. */
  boolean?: true
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
  /** 6d: write calls to Inform's veneer as the syntax that makes them (`RV__Pr(o, p)` as `o.p`). */
  idioms?: boolean
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
export function routineStatements(r0: Routine, n: StatementNames, structured = false, embedded = false): string[] {
  // 6d: strict mode's checks, inlined around an array access or an `in`, taken out: the plain
  // instruction compiles to them again (in strict mode).
  const r = n.idioms ? { ...r0, instructions: desugar(r0.instructions, p => n.routine(p) === 'RT__Err') } : r0
  const labels = routineLabels(r)
  const out: Item[] = []
  const line = (text: string): Item => ({ k: 'line', text: text.trimStart() })
  /** Expressions pushed and not yet pulled. Below them, `real` values the assembly pushed. */
  let pending: Node[] = []
  let real = 0
  const flush = () => {
    for (const p of pending) for (const l of p.asm) out.push(line(l))
    real += pending.length
    pending = []
  }
  const asm = (i: Instruction) => `    ${instructionText(i, labels, n)}`

  /** An operand as the assembly names it (a routine, a string, a word, an action), but -1 for $FFFF. */
  const constant = (op: Operand, i: Instruction, index: number): string => {
    const text = operandText(i, op, index, n)
    return /^\$[0-9A-F]+$/.test(text) ? String(Number.parseInt(text.slice(1), 16) - 0x10000) : text
  }

  let skipPush = false
  /** The label after a get_child folded into child(o): it goes with that value's assembly. */
  let skipLabelAt = -1
  for (const [index, i] of r.instructions.entries()) {
    if (skipPush) {
      skipPush = false
      continue
    }
    const label = labels.get(i.address)
    if (label && i.address !== skipLabelAt) {
      flush()
      out.push({ k: 'label', name: label })
    }

    // The operands, the stack's taken off as the machine takes them: the first is the top.
    const sp = i.operands.map((op, k) => op.kind === 'variable' && op.value === 0 && !(k === 0 && VARIABLE_REFERENCE.has(i.name)))
    const needed = sp.filter(Boolean).length + (i.name === 'RET_POPPED' ? 1 : 0) // it takes the top without naming it
    if (needed > pending.length) {
      // It takes values pushed by assembly: it stays assembly, and so do any expressions waiting.
      flush()
      real -= Math.min(real, needed)
      out.push(line(asm(i)))
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
      // A value for the stack, or for a variable. Strict mode keeps a value it needs twice in
      // temp_global and pushes it (`temp_global = x.p; @push temp_global`): that's the value, pushed.
      const nextOne = r.instructions[index + 1]
      if (i.store !== undefined && i.store >= 16 && n.variable(i.store) === 'temp_global' && nextOne?.name === 'PUSH' && nextOne.operands[0]?.kind === 'variable' && nextOne.operands[0].value === i.store && !labels.get(nextOne.address)) {
        pending.push({ ...node, asm: [...asmOf, asm(i), asm(nextOne)] })
        skipPush = true
        return
      }
      if (i.store === 0) pending.push({ ...node, asm: [...asmOf, asm(i)] })
      else if (i.store !== undefined) out.push(line(`${n.variable(i.store)} = ${node.text};`))
    }
    const statement = (text: string) => out.push(line(`${text};`))
    const fallBack = () => {
      // What's waiting below was pushed before what this took: out first, in order.
      flush()
      for (const l of asmOf) out.push(line(l))
      out.push(line(asm(i)))
    }

    // Branches and jumps, and what's left on the stack before them, stay assembly (6c).
    const target = i.operands[0]
    const namesStack = VARIABLE_REFERENCE.has(i.name) && target?.kind !== 'variable' && target?.value === 0
    if (namesStack) {
      fallBack()
      continue
    }
    // get_child and get_sibling branch on whether there is one; `x = child(o)` branches to the next
    // instruction, which is no branch at all.
    const noBranch = i.branch?.target === i.address + i.length && (i.name === 'GET_CHILD' || i.name === 'GET_SIBLING') && i.store !== undefined
    if (noBranch) {
      // Written as assembly after all, it needs its label; written as child(o), neither is there.
      const after = labels.get(i.address + i.length)
      const onlyHere = after && r.instructions.filter(x => x.branch?.target === i.address + i.length || x.jumpTarget === i.address + i.length).length === 1
      if (onlyHere) skipLabelAt = i.address + i.length
      keep({ text: `${i.name === 'GET_CHILD' ? 'child' : 'sibling'}(${obj(0)})`, precedence: ATOM, asm: [] })
      if (onlyHere && i.store === 0) pending.at(-1)!.asm.push(`.${after};`)
      if (i.store !== 0 && pending.length) {
        const last = out.pop()!
        flush()
        out.push(last)
      }
      continue
    }
    if (i.jumpTarget !== undefined) {
      flush()
      for (const l of asmOf) out.push(line(l))
      out.push({ k: 'jump', target: labels.get(i.jumpTarget) ?? String(i.jumpTarget), asm: [asm(i)] })
      continue
    }
    // get_sibling x -> x ?top: an objectloop's next round.
    if (i.name === 'GET_SIBLING' && i.store !== undefined && i.store !== 0 && i.operands[0]?.kind === 'variable' && i.operands[0].value === i.store && i.branch?.onTrue && i.branch.target !== undefined) {
      flush()
      out.push({ k: 'next', variable: n.variable(i.store), target: labels.get(i.branch.target) ?? '', asm: [asm(i)] })
      continue
    }
    if (i.branch) {
      flush()
      const c = condition(i, ops, obj, sub, n.attribute)
      if (c && !i.store) {
        const [C, notC] = c
        out.push({
          k: 'branch',
          taken: i.branch.onTrue ? C : notC,
          notTaken: i.branch.onTrue ? notC : C,
          ...(i.branch.returns !== undefined ? { returns: i.branch.returns } : { target: labels.get(i.branch.target!) ?? String(i.branch.target) }),
          asm: [...asmOf, asm(i)],
          test: { op: i.name, args: ops.map(o => o.text), onTrue: i.branch.onTrue },
        })
      } else {
        for (const l of asmOf) out.push(line(l))
        out.push(line(asm(i)))
      }
      continue
    }
    if (i.info.terminal && !['RTRUE', 'RFALSE', 'RET', 'RET_POPPED', 'PRINT_RET', 'QUIT'].includes(i.name)) {
      flush()
      for (const l of asmOf) out.push(line(l))
      out.push(line(asm(i)))
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
    else if (n.idioms && i.info.call && i.operands[0]!.kind !== 'variable' && idiom(n.routine(i.operands[0]!.value), ops.slice(1), i.operands.slice(1), sp.slice(1), n, i.store !== undefined)) {
      const r = idiom(n.routine(i.operands[0]!.value), ops.slice(1), i.operands.slice(1), sp.slice(1), n, i.store !== undefined)!
      if (r.statement) statement(r.statement)
      else keep({ text: r.expr!, precedence: r.precedence ?? ATOM, asm: [], ...(r.boolean ? { boolean: true as const } : {}) })
    }
    else if (i.info.call && i.store !== undefined && i.operands[0]!.kind !== 'variable' && n.routine(i.operands[0]!.value)) {
      keep({ text: `${n.routine(i.operands[0]!.value)}(${ops.slice(1).map(o => o.text).join(', ')})`, precedence: ATOM, asm: [] })
    }
    else if (name === 'PULL' && i.operands[0]!.kind !== 'variable' && taken.length === 0 && pending.length) {
      // The value on top is pulled into a variable: a switch's subject, if a switch takes it.
      const top = pending.pop()!
      flush()
      out.push({ k: 'subject', variable: n.variable(i.operands[0]!.value), expr: top.text, asm: [...top.asm, asm(i)] })
      continue
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
    // (Not when this only pushed a value, by way of temp_global.)
    if (i.store !== 0 && !skipPush) {
      if (pending.length) {
        const below = pending
        pending = []
        const last = out.pop()!
        for (const p of below) for (const l of p.asm) out.push(line(l))
        real += below.length
        out.push(last)
      }
    }
  }
  flush()
  return structured ? structure(out, embedded) : flat(out)
}

/** A branch's condition, both ways: `[when it holds, when it doesn't]`; undefined when it has none to write. */
function condition(i: Instruction, ops: Node[], obj: (k: number) => string, sub: (node: Node, above: number) => string, attribute: (n: number) => string | undefined): [string, string] | undefined {
  const a = (k: number) => sub(ops[k]!, 4)
  switch (i.name) {
    case 'JE': {
      if (ops.length < 2) return undefined
      const rest = ops.slice(1).map((_, k) => a(k + 1)).join(' or ')
      return [`${a(0)} == ${rest}`, `${a(0)} ~= ${rest}`]
    }
    case 'JL':
      return [`${a(0)} < ${a(1)}`, `${a(0)} >= ${a(1)}`]
    case 'JG':
      return [`${a(0)} > ${a(1)}`, `${a(0)} <= ${a(1)}`]
    case 'JZ':
      // A condition's value (o ofclass C) is tested as itself.
      if (ops[0]!.boolean) return [`~~(${ops[0]!.text})`, ops[0]!.text]
      return [`${a(0)} == 0`, `${a(0)} ~= 0`]
    case 'JIN':
      return [`${obj(0)} in ${obj(1)}`, `${obj(0)} notin ${obj(1)}`]
    case 'TEST_ATTR': {
      const attr = i.operands[1]?.kind !== 'variable' ? attribute(i.operands[1]!.value) : undefined
      return attr ? [`${obj(0)} has ${attr}`, `${obj(0)} hasnt ${attr}`] : undefined
    }
    default:
      return undefined
  }
}

/** The items as 6b writes them: statements, and assembly for every branch and jump. */
function flat(items: Item[]): string[] {
  const out: string[] = []
  for (const it of items) {
    if (it.k === 'line') out.push(`    ${it.text}`)
    else if (it.k === 'label') out.push(`  .${it.name};`)
    else for (const l of it.asm) out.push(`    ${l.trimStart()}`)

  }
  return out
}

/**
 * The items with their control flow as Inform writes it (6c), in the shapes Inform compiles them to:
 *   if (C) body               branch (when not C) past the body
 *   if (C) A else B           the same, A ending in a jump past B
 *   if (C1 && C2) body        two branches past the body
 *   while (C) body            .top; branch (when not C) out; body; jump top
 *   do body until (C)         .top; body; branch (when not C) back to top
 *   if (C) rtrue              a branch that returns
 * A label nothing is left jumping to goes; a jump left over is `jump L;` (which compiles to one
 * jump); a branch left over stays assembly.
 */
function structure(items0: Item[], embedded: boolean): string[] {
  const items = conditionValues(items0)
  const at = new Map<string, number>()
  items.forEach((it, k) => it.k === 'label' && at.set(it.name, k))
  const refs = new Map<string, number>()
  for (const it of items) if ((it.k === 'branch' && it.target) || it.k === 'jump' || it.k === 'next') refs.set(it.target!, (refs.get(it.target!) ?? 0) + 1)
  // A branch left as an assembly line refers to its label too (`@jz sp ?~L2;`): that label stays.
  for (const it of items) if (it.k === 'line' && it.text.startsWith('@')) for (const m of it.text.matchAll(/(?:\?~?|@jump )(L\d+)\b/g)) refs.set(m[1]!, (refs.get(m[1]!) ?? 0) + 1)
  const pad = (d: number) => '    '.repeat(d)
  /** A block: one line without braces, more in braces. */
  const block = (head: string, body: string[], d: number, tail = ''): string[] => {
    // `if (C) rtrue;` compiles to one branch that returns; a branch past an rtrue was written
    // otherwise, as `if (C) return true;` is.
    if (body.length === 1 && /^\s*r(true|false);$/.test(body[0]!)) body = [body[0]!.replace(/r(true|false);/, 'return $1;')]
    if (body.length === 1 && !body[0]!.trimStart().startsWith('.') && !/[{}]$/.test(body[0]!)) return [`${pad(d)}${head} ${body[0]!.trimStart()}${tail ? ` ${tail}` : ''}`]
    return [`${pad(d)}${head} {`, ...body, `${pad(d)}}${tail ? ` ${tail}` : ''}`]
  }

  type Branch = Extract<Item, { k: 'branch' }>
  /** A switch starting at a branch: its cases, each [start, end) of items, the default, and where it ends. */
  const switchAt = (i: number, end: number) => {
    const first = items[i]
    if (first?.k !== 'branch' || first.test.op !== 'JE' || first.test.onTrue || !first.target) return undefined
    const variable = first.test.args[0]!
    const cases: { values: string[]; start: number; end: number; label: string; jumps: boolean }[] = []
    let p = i
    let exit: string | undefined
    let otherwise: [number, number] | undefined
    for (;;) {
      const b = items[p]
      if (b?.k !== 'branch' || b.test.op !== 'JE' || b.test.onTrue || b.test.args[0] !== variable || !b.target) break
      const l = at.get(b.target)
      if (l === undefined || l <= p || l > end || refs.get(b.target) !== 1) break
      const last = items[l - 1]
      if (last?.k === 'jump' && at.get(last.target) !== undefined && at.get(last.target)! > l && (exit === undefined || last.target === exit)) {
        exit = last.target
        cases.push({ values: b.test.args.slice(1), start: p + 1, end: l - 1, label: b.target, jumps: true })
        p = l + 1 // past the next case's label
        continue
      }
      // A case that ends in a return needs no jump to the end: Inform leaves it out.
      if (last?.k === 'line' && /^(rtrue|rfalse|return\b|print_ret\b|quit)/.test(last.text) && items[l + 1]?.k === 'branch') {
        cases.push({ values: b.test.args.slice(1), start: p + 1, end: l, label: b.target, jumps: false })
        p = l + 1
        continue
      }
      // The last case: no jump at its end; its label is the end (or the default follows).
      cases.push({ values: b.test.args.slice(1), start: p + 1, end: l, label: b.target, jumps: false })
      p = l
      break
    }
    if (!cases.length) return undefined
    const e = exit !== undefined ? at.get(exit)! : p
    if (e > end) return undefined
    const lastCase = cases.at(-1)!
    // The default: after the last case that jumped, what comes before the end.
    if (lastCase.jumps && p < e) otherwise = [p, e]
    else if (!lastCase.jumps && exit !== undefined && lastCase.end + 1 < e) otherwise = [lastCase.end + 1, e]
    // Worth it: two cases or more, or one testing 0 (which an if would test with jz).
    if (cases.length < 2 && !cases[0]!.values.includes('0')) return undefined
    // Each case's label was its test's alone, and each case's jump went to the end.
    for (const c of cases) {
      refs.set(c.label, 0)
      if (c.jumps) refs.set(exit!, refs.get(exit!)! - 1)
    }
    return { variable, cases, otherwise, next: e }
  }

  /** The rfalse Inform puts at the end of an action case or an embedded routine by itself. */
  // (Not after a label: the label would end the case, which Inform won't have before the next.)
  const dropFinalRfalse = (lines: string[]) => (lines.at(-1)?.trim() === 'rfalse;' && !lines.at(-2)?.trim().startsWith('.') ? lines.slice(0, -1) : lines)
  /** Action cases from here to the routine's end: each a test of sw__var, its body ending in a return. */
  const actionCasesAt = (i: number) => {
    const cases: { values: string[]; start: number; end: number }[] = []
    let p = i
    for (;;) {
      const b = items[p]
      if (b?.k !== 'branch' || b.test.op !== 'JE' || b.test.onTrue || b.test.args[0] !== 'sw__var' || !b.target || !b.test.args.slice(1).every(v => v.startsWith('##'))) break
      const l = at.get(b.target)
      const last = l !== undefined ? items[l - 1] : undefined
      if (l === undefined || l <= p || refs.get(b.target) !== 1 || last?.k !== 'line' || !/^(rtrue|rfalse|return\b|print_ret\b|quit)/.test(last.text)) break
      cases.push({ values: b.test.args.slice(1), start: p + 1, end: l })
      p = l + 1
    }
    if (!cases.length) return undefined
    for (const c of cases) {
      const b = items[c.start - 1] as Branch
      refs.set(b.target!, 0)
    }
    return { cases, otherwise: p < items.length ? ([p, items.length] as [number, number]) : undefined }
  }

  const renderSwitch = (sw: NonNullable<ReturnType<typeof switchAt>>, subject: string, d: number): string[] => {
    const lines = [`${pad(d)}switch (${subject}) {`]
    for (const c of sw.cases) lines.push(`${pad(d + 1)}${c.values.join(', ')}:`, ...render(c.start, c.end, d + 2))
    if (sw.otherwise) lines.push(`${pad(d + 1)}default:`, ...render(sw.otherwise[0], sw.otherwise[1], d + 2))
    lines.push(`${pad(d)}}`)
    return lines
  }

  const render = (start: number, end: number, d: number): string[] => {
    const out: string[] = []
    for (let i = start; i < end; i++) {
      const it = items[i]!
      if (it.k === 'line') {
        out.push(pad(d) + it.text)
        continue
      }
      if (it.k === 'label') {
        // while (C) body: .top; branch out when not C; body; jump top; .out
        const b = items[i + 1]
        if (refs.get(it.name) === 1 && b?.k === 'branch' && b.target) {
          const e = at.get(b.target)
          const back = e !== undefined ? items[e - 1] : undefined
          if (e !== undefined && e > i + 1 && e <= end && back?.k === 'jump' && back.target === it.name) {
            refs.set(b.target, refs.get(b.target)! - 1)
            out.push(...block(`while (${b.notTaken})`, render(i + 2, e - 1, d + 1), d))
            i = e - 1
            continue
          }
        }
        // do body until (C): .top; body; branch back to top when not C
        if (refs.get(it.name) === 1) {
          const j = items.findIndex((x, k) => k > i && k < end && x.k === 'branch' && x.target === it.name)
          if (j > i) {
            const back = items[j] as Extract<Item, { k: 'branch' }>
            out.push(...block('do', render(i + 1, j, d + 1), d, `until (${back.notTaken});`))
            i = j
            continue
          }
        }
        if ((refs.get(it.name) ?? 0) > 0) out.push(`${pad(Math.max(0, d - 1))}  .${it.name};`)
        continue
      }
      if (it.k === 'jump') {
        out.push(`${pad(d)}jump ${it.target};`)
        continue
      }
      if (it.k === 'next') {
        for (const l of it.asm) out.push(pad(d) + l.trimStart())
        continue
      }
      if (it.k === 'subject') {
        // objectloop (x in P): x = child(P); if x is 0, past it; .top body; x = sibling(x), to top.
        const m = /^child\((.+)\)$/.exec(it.expr)
        const z = items[i + 1]
        const top = items[i + 2]
        if (m && z?.k === 'branch' && z.test.op === 'JZ' && z.test.args[0] === it.variable && z.test.onTrue && z.target && top?.k === 'label') {
          const e = at.get(z.target)
          const nx = e !== undefined ? items[e - 1] : undefined
          if (e !== undefined && e <= end && nx?.k === 'next' && nx.variable === it.variable && nx.target === top.name && refs.get(top.name) === 1 && refs.get(z.target) === 1) {
            refs.set(top.name, 0)
            refs.set(z.target, 0)
            out.push(...block(`objectloop (${it.variable} in ${m[1]})`, render(i + 3, e - 1, d + 1), d))
            i = e - 1
            continue
          }
        }
        // Taken by the switch after it, or written as it is.
        const sw = switchAt(i + 1, end)
        if (sw && sw.variable === it.variable) {
          out.push(...renderSwitch(sw, it.expr, d))
          i = sw.next - 1
          continue
        }
        for (const l of it.asm) out.push(pad(d) + l.trimStart())
        continue
      }
      // A branch that returns: if (C) rtrue;
      if (it.returns !== undefined) {
        out.push(`${pad(d)}if (${it.taken}) ${it.returns ? 'rtrue' : 'rfalse'};`)
        continue
      }
      // switch (V) { a, b: A; c: B; default: C; }: tests of one variable, each `je V a b ?~next`,
      // each case ending in a jump to the end (the last one needn't). It's also how `x == 0`
      // in a switch is written: as an if, Inform would test it with jz.
      // An embedded routine's action cases: `Take, Drop: …` (tests of sw__var at its top).
      const actions = embedded && d === 1 && end === items.length ? actionCasesAt(i) : undefined
      if (actions) {
        for (const c of actions.cases) {
          out.push(`${pad(d)}${c.values.map(v => v.replace(/^##/, '')).join(', ')}:`, ...dropFinalRfalse(render(c.start, c.end, d + 1)))
        }
        if (actions.otherwise) out.push(`${pad(d)}default:`, ...dropFinalRfalse(render(actions.otherwise[0], actions.otherwise[1], d + 1)))
        i = items.length
        continue
      }
      // switch (X): Inform evaluates X into temp_global (`temp_global = X;` just before), then tests it.
      const sw = switchAt(i, end)
      const assigned = sw?.variable === 'temp_global' ? /^temp_global = (.+);$/.exec(out.at(-1)?.trim() ?? '') : null
      if (sw && assigned) {
        out.pop()
        out.push(...renderSwitch(sw, assigned[1]!, d))
        i = sw.next - 1
        continue
      }

      // if (C1 || C2 || C3) body: each but the last branches (when it holds) into the body, which
      // starts just after the last; that one branches (when it doesn't hold) past the body.
      let orN = 0
      for (let n = 2; i + n < end && items[i + n - 1]!.k === 'branch'; n++) {
        if (items[i + n]?.k === 'label' && (items[i + n] as { name: string }).name === it.target) {
          orN = n
          break
        }
      }
      if (it.target && orN) {
        const n = orN
        const lastB = items[i + n - 1] as Branch
        const into = it.target
        const all = items.slice(i, i + n - 1) as Branch[]
        const e = lastB.target ? at.get(lastB.target) : undefined
        if (all.every(b => b.target === into) && refs.get(into) === n - 1 && lastB.target && e !== undefined && e > i + n && e <= end && lastB.target !== into) {
          const cond = [...all.map(b => `(${b.taken})`), `(${lastB.notTaken})`].join(' || ')
          refs.set(into, 0)
          refs.set(lastB.target!, refs.get(lastB.target!)! - 1)
          out.push(...block(`if (${cond})`, render(i + n + 1, e, d + 1), d))
          i = e - 1
          continue
        }
      }

      // Branches past a body: if, with && for several to the same place, and else.
      const target = it.target!
      let n = 1
      while (i + n < end && items[i + n]!.k === 'branch' && (items[i + n] as { target?: string }).target === target) n++
      const j = at.get(target)
      if (j === undefined || j <= i || j > end) {
        for (const l of it.asm) out.push(pad(d) + l.trimStart())
        continue
      }
      const conds = items.slice(i, i + n).map(x => (x as Extract<Item, { k: 'branch' }>).notTaken)
      const cond = conds.length === 1 ? conds[0]! : conds.map(c => `(${c})`).join(' && ')
      refs.set(target, refs.get(target)! - n)
      const last = items[j - 1]
      const k = last?.k === 'jump' ? at.get(last.target) : undefined
      if (last?.k === 'jump' && k !== undefined && k > j && k <= end && refs.get(target) === 0) {
        // if (C) A else B: A ends in a jump past B
        refs.set(last.target, refs.get(last.target)! - 1)
        const then = render(i + n, j - 1, d + 1)
        const otherwise = render(j + 1, k, d + 1)
        const head = block(`if (${cond})`, then, d)
        if (otherwise.length === 1 && otherwise[0]!.trimStart().startsWith('if (') === false && !/[{}]$/.test(otherwise[0]!)) out.push(...head, `${pad(d)}else ${otherwise[0]!.trimStart()}`)
        else out.push(...head, `${pad(d)}else {`, ...otherwise, `${pad(d)}}`)
        i = k - 1
        continue
      }
      out.push(...block(`if (${cond})`, render(i + n, j, d + 1), d))
      i = j - 1
    }
    return out
  }
  return render(0, items.length, 1)
}

/**
 * 6d: a call to one of Inform's veneer routines as the syntax that compiles to it (calibrated by
 * compiling each, with strict mode and without). Undefined when it isn't one, or its property or
 * attribute isn't a name.
 */
function idiom(
  routine: string | undefined,
  args: Node[],
  raw: Operand[],
  onStack: boolean[],
  n: StatementNames,
  stores: boolean,
): { expr?: string; statement?: string; precedence?: number; boolean?: true } | undefined {
  if (!routine) return undefined
  const a = (k: number) => args[k]?.text ?? ''
  const tight = (k: number) => (args[k] && args[k]!.precedence < ATOM ? `(${args[k]!.text})` : a(k))
  // A property by name, or one chosen at run time as `(expression)` (Inform's `obj.(expr)`).
  const prop = (k: number) => (!onStack[k] && raw[k] && raw[k]!.kind !== 'variable' ? n.property(raw[k]!.value) : args[k] ? `(${args[k]!.text})` : undefined)
  const attr = (k: number) => (!onStack[k] && raw[k] && raw[k]!.kind !== 'variable' ? n.attribute(raw[k]!.value) : undefined)
  const obj = (k: number) => (!onStack[k] && raw[k]?.kind === 'small' ? n.object(raw[k]!.value) ?? a(k) : tight(k))
  switch (routine) {
    case 'RV__Pr':
    case 'RT__ChPR':
      return prop(1) && stores ? { expr: `${obj(0)}.${prop(1)}`, precedence: 9 } : undefined
    case 'WV__Pr':
    case 'RT__ChPS':
      return prop(1) && !stores ? { statement: `${obj(0)}.${prop(1)} = ${a(2)}` } : undefined
    case 'CA__Pr': {
      if (!prop(1)) return undefined
      const call = `${obj(0)}.${prop(1)}(${args.slice(2).map(x => x.text).join(', ')})`
      return stores ? { expr: call } : { statement: call }
    }
    case 'IA__Pr':
    case 'IB__Pr':
    case 'DA__Pr':
    case 'DB__Pr': {
      if (!prop(1) || stores) return undefined
      const op = routine.startsWith('I') ? '++' : '--'
      return { statement: routine[2] === 'A' ? `${obj(0)}.${prop(1)}${op}` : `${op}${obj(0)}.${prop(1)}` }
    }
    case 'OP__Pr':
      return stores && prop(1) ? { expr: `${tight(0)} provides ${prop(1)}`, precedence: 3, boolean: true } : undefined
    case 'OC__Cl':
      return stores ? { expr: `${tight(0)} ofclass ${obj(1)}`, precedence: 3, boolean: true } : undefined
    case 'Meta__class':
      return stores ? { expr: `metaclass(${a(0)})` } : undefined
    case 'Z__Region':
      return stores ? { expr: `ZRegion(${a(0)})` } : undefined
    case 'Unsigned__Compare':
      return stores ? { expr: `UnsignedCompare(${a(0)}, ${a(1)})` } : undefined
    case 'RT__ChT':
      return stores ? undefined : { statement: `move ${obj(0)} to ${obj(1)}` }
    case 'RT__ChR':
      return stores ? undefined : { statement: `remove ${obj(0)}` }
    case 'RT__ChG':
      return !stores && attr(1) ? { statement: `give ${obj(0)} ${attr(1)}` } : undefined
    case 'RT__ChGt':
      return !stores && attr(1) ? { statement: `give ${obj(0)} ~${attr(1)}` } : undefined
    case 'RT__ChPrintC':
      return stores ? undefined : { statement: `print (char) ${a(0)}` }
    case 'RT__ChPrintS':
      return stores ? undefined : { statement: `print (string) ${a(0)}` }
    case 'RT__ChPrintA':
      return stores ? undefined : { statement: `print (address) ${a(0)}` }
    case 'RT__ChPrintO':
      return stores ? undefined : { statement: `print (object) ${obj(0)}` }
    case 'PrintShortName':
      return stores ? undefined : { statement: `print (name) ${obj(0)}` }
    case 'Print__PName':
      return stores ? undefined : { statement: `print (property) ${a(0)}` }
    default:
      return undefined
  }
}

/**
 * The instructions without strict mode's inlined checks (calibrated by compiling each in strict mode):
 *
 *   jl X 0 ?err; jl X N ?ok; .err call RT__Err …; jump past; .ok loadw a X …      (a-->X, a->X, = v)
 *   pull t; push t; jl t 0 ?err; jl t N ?ok; .err call RT__Err …; jz sp; jump past;
 *     .ok loadw a sp …                                                             (the same, X an expression)
 *   jl x 1 ?err; jg x MAX ?~ok; .err call RT__Err 2 x; jump past; .ok jin x y …    (x in y)
 *
 * Each becomes its last instruction alone, at the check's address (where any branch to it went).
 */
function desugar(ins: Instruction[], isErr: (packed: number) => boolean): Instruction[] {
  const out: Instruction[] = []
  const same = (a: Operand | undefined, b: Operand | undefined) => !!a && !!b && a.kind === b.kind && a.value === b.value
  const call = (i: Instruction | undefined) => !!i && !!i.info.call && i.store === undefined && i.operands[0]?.kind !== 'variable' && isErr(i.operands[0]!.value)
  const ACCESS = new Set(['LOADW', 'STOREW', 'LOADB', 'STOREB'])
  for (let k = 0; k < ins.length; k++) {
    const [a, b, c, d, e, f, g, h] = [ins[k], ins[k + 1], ins[k + 2], ins[k + 3], ins[k + 4], ins[k + 5], ins[k + 6], ins[k + 7]]
    // An array access with its bounds checked, its value wanted: the error pushes a 0 in its place.
    if (a?.name === 'JL' && b?.name === 'JL' && call(c) && d?.name === 'PUSH' && d.operands[0]?.kind === 'small' && d.operands[0].value === 0 && e?.name === 'JUMP' && f && ACCESS.has(f.name) &&
      a.branch?.onTrue && a.branch.target === c!.address && b.branch?.onTrue && b.branch.target === f.address &&
      same(a.operands[0], b.operands[0]) && same(a.operands[0], f.operands[1]) && e.jumpTarget === f.address + f.length && f.store === 0) {
      out.push({ ...f, address: a.address })
      k += 5
      continue
    }
    // An array access with its bounds checked.
    if (a?.name === 'JL' && b?.name === 'JL' && call(c) && d?.name === 'JUMP' && e && ACCESS.has(e.name) &&
      a.branch?.onTrue && a.branch.target === c!.address && b.branch?.onTrue && b.branch.target === e.address &&
      same(a.operands[0], b.operands[0]) && same(a.operands[0], e.operands[1]) && d.jumpTarget === e.address + e.length) {
      out.push({ ...e, address: a.address })
      k += 4
      continue
    }
    // The same, the index an expression: pulled into a variable and pushed again for the access.
    if (a?.name === 'PULL' && b?.name === 'PUSH' && c?.name === 'JL' && d?.name === 'JL' && call(e) && f?.name === 'JZ' && g?.name === 'JUMP' && h && ACCESS.has(h.name) &&
      b.operands[0]?.kind === 'variable' && b.operands[0].value === a.operands[0]?.value &&
      c.branch?.onTrue && c.branch.target === e!.address && d.branch?.onTrue && d.branch.target === h.address &&
      f.operands[0]?.kind === 'variable' && f.operands[0].value === 0 && g.jumpTarget === h.address + h.length &&
      h.operands[1]?.kind === 'variable' && h.operands[1].value === 0) {
      out.push({ ...h, address: a.address })
      k += 7
      continue
    }
    // objectloop (x in P), before it: P checked to be an object, and kept in temp_global for get_child.
    if (a?.name === 'JG' && b?.name === 'JG' && c?.name === 'JIN' && call(d) && e?.name === 'STORE' && f?.name === 'JUMP' && g?.name === 'STORE' && h?.name === 'GET_CHILD' &&
      same(a.operands[1], b.operands[0]) && same(a.operands[1], c.operands[0]) && same(a.operands[1], g.operands[1]) &&
      same(e.operands[0], g.operands[0]) && h.operands[0]?.kind === 'variable' && h.operands[0].value === g.operands[0]!.value && f.jumpTarget === h.address) {
      out.push({ ...h, operands: [a.operands[1]!], address: a.address })
      k += 7
      continue
    }
    // objectloop (x in P), each time round: x checked to be an object, and still in P.
    if (a?.name === 'JG' && b?.name === 'JG' && c?.name === 'JIN' && call(d) && e?.name === 'JUMP' && f?.name === 'JIN' && call(g) && h?.name === 'JUMP' && i9_(ins, k)?.name === 'GET_SIBLING' &&
      same(a.operands[1], b.operands[0]) && same(a.operands[1], c.operands[0]) && same(a.operands[1], f.operands[0]) && same(a.operands[1], i9_(ins, k)!.operands[0])) {
      out.push({ ...i9_(ins, k)!, address: a.address })
      k += 8
      continue
    }
    // The same in a return: the error path returns a 0 (`jz sp; push 0; ret_popped`) instead.
    const i9 = ins[k + 8]
    if (a?.name === 'PULL' && b?.name === 'PUSH' && c?.name === 'JL' && d?.name === 'JL' && call(e) && f?.name === 'JZ' && g?.name === 'PUSH' && h?.name === 'RET_POPPED' && i9 && ACCESS.has(i9.name) &&
      b.operands[0]?.kind === 'variable' && b.operands[0].value === a.operands[0]?.value &&
      c.branch?.onTrue && c.branch.target === e!.address && d.branch?.onTrue && d.branch.target === i9.address &&
      g.operands[0]?.kind === 'small' && g.operands[0].value === 0 && i9.operands[1]?.kind === 'variable' && i9.operands[1].value === 0) {
      out.push({ ...i9, address: a.address })
      k += 8
      continue
    }
    // `x in y`, `x has a`: x checked to be an object first (jl x 1, or jg 1 x).
    const below = a?.name === 'JL' && a.operands[1]?.kind === 'small' && a.operands[1].value === 1 ? a.operands[0] : a?.name === 'JG' && a.operands[0]?.kind === 'small' && a.operands[0].value === 1 ? a.operands[1] : undefined
    // (The error path jumps past, or returns false when the test was the routine's answer.)
    if (below && b?.name === 'JG' && call(c) && (d?.name === 'JUMP' || d?.name === 'RFALSE' || d?.name === 'RTRUE') && e && ['JIN', 'TEST_ATTR'].includes(e.name) &&
      a!.branch?.onTrue && a!.branch.target === c!.address && b.branch && !b.branch.onTrue && b.branch.target === e.address &&
      same(below, b.operands[0]) && same(below, e.operands[0])) {
      out.push({ ...e, address: a!.address })
      k += 4
      continue
    }
    out.push(ins[k]!)
  }
  return out
}

const i9_ = (ins: Instruction[], k: number) => ins[k + 8]

/**
 * A condition used as a value: Inform pushes 1 or 0 by branching, and the value is then pulled into
 * a variable or returned. `C` is when the 1 is pushed.
 *
 *   branches (when not C) to L; push 1; jump E; .L; push 0; .E; pull x      x = (C);
 *   branches (when not C) to L; push 1; ret_popped; .L; push 0; ret_popped   return (C);
 *
 * (Pushing 0 first is `~~(C)`.) Several branches to L are `&&`.
 */
function conditionValues(items: Item[]): Item[] {
  const out = items.slice()
  const push = (it: Item | undefined) => (it?.k === 'line' ? /^@push ([01]);$/.exec(it.text)?.[1] : undefined)
  for (let i = 0; i < out.length; i++) {
    let n = 0
    const target = (out[i] as { target?: string }).target
    while (out[i + n]?.k === 'branch' && (out[i + n] as { target?: string }).target === target && target) n++
    if (!n) continue
    const first = push(out[i + n])
    if (first === undefined) continue
    const conds = out.slice(i, i + n).map(b => (b as Extract<Item, { k: 'branch' }>).notTaken)
    const c = conds.length === 1 ? conds[0]! : conds.map(x => `(${x})`).join(' && ')
    const value = first === '1' ? `(${c})` : `~~(${c})`
    const other = first === '1' ? '0' : '1'
    const refsTo = (name: string) => out.filter(x => (x as { target?: string }).target === name || (x.k === 'line' && x.text.includes(`L${name.slice(1)}`) && new RegExp(`[?~ ]${name}\\b`).test(x.text))).length
    // return (C);
    const a1 = out[i + n + 1]
    const lab = out[i + n + 2]
    if (a1?.k === 'line' && a1.text === '@ret_popped;' && lab?.k === 'label' && lab.name === target && push(out[i + n + 3]) === other && out[i + n + 4]?.k === 'line' && (out[i + n + 4] as { text: string }).text === '@ret_popped;' && refsTo(target) === n) {
      out.splice(i, n + 5, { k: 'line', text: `return ${value};` })
      continue
    }
    // x = (C);
    const j = out[i + n + 1]
    if (j?.k === 'jump' && lab?.k === 'label' && lab.name === target && push(out[i + n + 3]) === other) {
      const e = out[i + n + 4]
      const pull = out[i + n + 5]
      const m = pull?.k === 'line' ? /^@pull (\w+);$/.exec(pull.text) : null
      if (e?.k === 'label' && e.name === j.target && m && refsTo(target) === n && refsTo(j.target) === 1) {
        out.splice(i, n + 6, { k: 'line', text: `${m[1]} = ${value};` })
        continue
      }
    }
  }
  return out
}
