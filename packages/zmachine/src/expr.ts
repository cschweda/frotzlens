/**
 * The debugger's expression language (docs/20 §3): conditions, watches and the app's hovers. Small
 * and with no side effects: no routine calls, nothing assigned. 16-bit values; arithmetic and
 * comparisons are signed, as Inform's are. Parsed once into a tree, evaluated against a context
 * the debugger builds from the machine and the symbols.
 */

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'object'; shortName: string }
  | { kind: 'action'; name: string }
  | { kind: 'unary'; op: '-' | '!'; arg: Expr }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'has'; negate: boolean; object: Expr; attribute: string | number }
  | { kind: 'prop'; object: Expr; property: string | number }
  | { kind: 'tree'; fn: 'parent' | 'child' | 'sibling'; arg: Expr }

type BinaryOp = '||' | '&&' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '+' | '-' | '*' | '/' | '%' | 'in'

/** What an expression can see. Every lookup returns undefined for "there's no such thing". */
export interface ExprContext {
  local(name: string): number | undefined
  global(name: string): number | undefined
  object(name: string): number | undefined
  objectByShortName(text: string): number | undefined
  constant(name: string): number | undefined
  action(name: string): number | undefined
  attributeNumber(name: string): number | undefined
  propertyNumber(name: string): number | undefined
  /** The object table; each may throw an Error that says what's wrong, in words. */
  parent(o: number): number
  child(o: number): number
  sibling(o: number): number
  hasAttribute(o: number, a: number): boolean
  property(o: number, p: number): number
}

export class ExprError extends Error {}

const signed = (v: number) => (v & 0x8000 ? (v & 0xffff) - 0x10000 : v & 0xffff)
const word = (v: number) => v & 0xffff

// ── the tokenizer ─────────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'str'; v: string }
  | { t: 'action'; v: string }
  | { t: 'op'; v: string }

const OPS = ['||', '&&', '==', '~=', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '.', '(', ')']

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^(?:0x|\$)([0-9a-f]+)/i.exec(rest))) {
      out.push({ t: 'num', v: parseInt(m[1]!, 16) })
      i += m[0].length
    } else if ((m = /^\d+/.exec(rest))) {
      out.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if ((m = /^##([A-Za-z_][A-Za-z0-9_]*)/.exec(rest))) {
      out.push({ t: 'action', v: m[1]! })
      i += m[0].length
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
    } else if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new ExprError(`a quoted name starting at "${rest.slice(0, 12)}" has no closing ${c}`)
      out.push({ t: 'str', v: src.slice(i + 1, end) })
      i = end + 1
    } else {
      const op = OPS.find(o => rest.startsWith(o))
      if (!op) throw new ExprError(`"${c}" isn't part of an expression here`)
      out.push({ t: 'op', v: op === '~=' ? '!=' : op })
      i += op.length
    }
  }
  return out
}

// ── the parser ────────────────────────────────────────────────────────────────

/** Parse an expression, or throw an ExprError that says what's wrong. */
export function parseExpr(src: string): Expr {
  const toks = tokenize(src)
  if (!toks.length) throw new ExprError('the expression is empty')
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const isWord = (v: string) => peek()?.t === 'id' && peek()!.v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`expected "${v}"${peek() ? ` before "${tokText(peek()!)}"` : ' at the end'}`)
    p++
  }

  const or = (): Expr => {
    let l = and()
    while (isOp('||')) {
      p++
      l = { kind: 'binary', op: '||', left: l, right: and() }
    }
    return l
  }
  const and = (): Expr => {
    let l = not()
    while (isOp('&&')) {
      p++
      l = { kind: 'binary', op: '&&', left: l, right: not() }
    }
    return l
  }
  const not = (): Expr => {
    if (isOp('!')) {
      p++
      return { kind: 'unary', op: '!', arg: not() }
    }
    return compare()
  }
  const compare = (): Expr => {
    const l = sum()
    const t = peek()
    if (t?.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      p++
      return { kind: 'binary', op: t.v as BinaryOp, left: l, right: sum() }
    }
    if (isWord('has') || isWord('hasnt')) {
      const negate = peek()!.v === 'hasnt'
      p++
      const a = peek()
      if (a?.t === 'id') {
        p++
        return { kind: 'has', negate, object: l, attribute: a.v }
      }
      if (a?.t === 'num') {
        p++
        return { kind: 'has', negate, object: l, attribute: a.v }
      }
      throw new ExprError('"has" needs an attribute after it')
    }
    if (isWord('in')) {
      p++
      return { kind: 'binary', op: 'in', left: l, right: sum() }
    }
    return l
  }
  const sum = (): Expr => {
    let l = product()
    while (isOp('+') || isOp('-')) {
      const op = peek()!.v as '+' | '-'
      p++
      l = { kind: 'binary', op, left: l, right: product() }
    }
    return l
  }
  const product = (): Expr => {
    let l = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = peek()!.v as '*' | '/' | '%'
      p++
      l = { kind: 'binary', op, left: l, right: unary() }
    }
    return l
  }
  const unary = (): Expr => {
    if (isOp('-')) {
      p++
      return { kind: 'unary', op: '-', arg: unary() }
    }
    return postfix()
  }
  const postfix = (): Expr => {
    let e = primary()
    while (isOp('.')) {
      p++
      const t = peek()
      if (t?.t === 'id' || t?.t === 'num') {
        p++
        e = { kind: 'prop', object: e, property: t.v }
      } else throw new ExprError('"." needs a property after it')
    }
    return e
  }
  const primary = (): Expr => {
    const t = peek()
    if (!t) throw new ExprError('the expression ends too soon')
    if (t.t === 'num') {
      p++
      return { kind: 'num', value: t.v }
    }
    if (t.t === 'str') {
      p++
      return { kind: 'object', shortName: t.v }
    }
    if (t.t === 'action') {
      p++
      return { kind: 'action', name: t.v }
    }
    if (t.t === 'op' && t.v === '(') {
      p++
      const e = or()
      expect(')')
      return e
    }
    if (t.t === 'id') {
      p++
      if ((t.v === 'parent' || t.v === 'child' || t.v === 'sibling') && isOp('(')) {
        p++
        const arg = or()
        expect(')')
        return { kind: 'tree', fn: t.v, arg }
      }
      if (t.v === 'true') return { kind: 'num', value: 1 }
      if (t.v === 'false' || t.v === 'nothing') return { kind: 'num', value: 0 }
      return { kind: 'name', name: t.v }
    }
    throw new ExprError(`"${tokText(t)}" can't start a value`)
  }

  const e = or()
  if (p < toks.length) throw new ExprError(`"${tokText(toks[p]!)}" doesn't belong after the expression`)
  return e
}

const tokText = (t: Token) => (t.t === 'str' ? `"${t.v}"` : t.t === 'action' ? `##${t.v}` : String(t.v))

// ── evaluation ────────────────────────────────────────────────────────────────

/** Evaluate a parsed expression: a 16-bit value, or throw an ExprError that says why it has none. */
export function evaluateExpr(e: Expr, ctx: ExprContext): number {
  const ev = (x: Expr): number => evaluateExpr(x, ctx)
  const objectOf = (x: Expr) => {
    const o = ev(x)
    if (o === 0) throw new ExprError('that is nothing (object 0)')
    return o
  }
  try {
    switch (e.kind) {
      case 'num':
        return word(e.value)
      case 'name': {
        // Locals first (the routine's own names, or L00), then globals (by name, or G05/g5), objects, constants.
        const v = ctx.local(e.name) ?? ctx.global(e.name) ?? ctx.object(e.name) ?? ctx.constant(e.name)
        if (v === undefined) throw new ExprError(`there's no local, global, object or constant called ${e.name}`)
        return word(v)
      }
      case 'object': {
        const o = ctx.objectByShortName(e.shortName)
        if (o === undefined) throw new ExprError(`no object is called "${e.shortName}"`)
        return o
      }
      case 'action': {
        const a = ctx.action(e.name)
        if (a === undefined) throw new ExprError(`there's no action called ##${e.name}`)
        return a
      }
      case 'unary':
        return e.op === '-' ? word(-signed(ev(e.arg))) : ev(e.arg) === 0 ? 1 : 0
      case 'has': {
        const a = typeof e.attribute === 'number' ? e.attribute : ctx.attributeNumber(e.attribute)
        if (a === undefined) throw new ExprError(`there's no attribute called ${e.attribute}`)
        const has = ctx.hasAttribute(objectOf(e.object), a)
        return has !== e.negate ? 1 : 0
      }
      case 'prop': {
        const pn = typeof e.property === 'number' ? e.property : ctx.propertyNumber(e.property)
        if (pn === undefined) throw new ExprError(`there's no property called ${e.property}`)
        return word(ctx.property(objectOf(e.object), pn))
      }
      case 'tree': {
        const o = objectOf(e.arg)
        return e.fn === 'parent' ? ctx.parent(o) : e.fn === 'child' ? ctx.child(o) : ctx.sibling(o)
      }
      case 'binary': {
        if (e.op === '&&') return ev(e.left) !== 0 && ev(e.right) !== 0 ? 1 : 0
        if (e.op === '||') return ev(e.left) !== 0 || ev(e.right) !== 0 ? 1 : 0
        if (e.op === 'in') return ctx.parent(objectOf(e.left)) === ev(e.right) ? 1 : 0
        const a = signed(ev(e.left))
        const b = signed(ev(e.right))
        switch (e.op) {
          case '==': return a === b ? 1 : 0
          case '!=': return a !== b ? 1 : 0
          case '<': return a < b ? 1 : 0
          case '>': return a > b ? 1 : 0
          case '<=': return a <= b ? 1 : 0
          case '>=': return a >= b ? 1 : 0
          case '+': return word(a + b)
          case '-': return word(a - b)
          case '*': return word(Math.imul(a, b))
          case '/':
          case '%':
            if (b === 0) throw new ExprError('division by zero')
            // Truncating, as @div and @mod are (§15).
            return word(e.op === '/' ? Math.trunc(a / b) : a - Math.trunc(a / b) * b)
        }
      }
    }
  } catch (err) {
    if (err instanceof ExprError) throw err
    throw new ExprError(err instanceof Error ? err.message : String(err))
  }
}
