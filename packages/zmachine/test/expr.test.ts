/** The expression language (docs/20 §3), against a small world. */
import { describe, expect, it } from 'vitest'
import { ExprError, evaluateExpr, parseExpr, type ExprContext } from '../src/expr.js'

// Objects: 1 hall, 2 lantern (in hall, has light=5), 3 player (in hall), 4 box (child of player).
const tree: Record<number, [number, number, number]> = { 1: [0, 2, 0], 2: [1, 0, 3], 3: [1, 4, 0], 4: [3, 0, 0] }
const world: ExprContext = {
  local: n => ({ count: 3, L00: 3, L01: 0xffff })[n],
  global: n => ({ score: 7, G00: 1, location: 1 })[n],
  object: n => ({ hall: 1, lantern: 2, player: 3, box: 4 })[n],
  objectByShortName: t => ({ 'brass lantern': 2 })[t],
  constant: n => ({ MAX_SCORE: 10 })[n],
  action: n => ({ Take: 4 })[n],
  attributeNumber: n => ({ light: 5, open: 6 })[n],
  propertyNumber: n => ({ description: 3, weight: 9 })[n],
  parent: o => tree[o]![0],
  child: o => tree[o]![1],
  sibling: o => tree[o]![2],
  hasAttribute: (o, a) => o === 2 && a === 5,
  property: (o, p) => {
    if (o === 2 && p === 9) return 0xfffe
    if (p === 3) return 0x1234
    throw new Error(`object ${o} has no property ${p}`)
  },
}
const ev = (s: string) => evaluateExpr(parseExpr(s), world)
const err = (s: string) => {
  try {
    ev(s)
  } catch (e) {
    expect(e).toBeInstanceOf(ExprError)
    return (e as Error).message
  }
  throw new Error(`"${s}" evaluated`)
}

describe('expressions', () => {
  it('numbers, hex, true/false/nothing', () => {
    expect([ev('42'), ev('$2a'), ev('0x2A'), ev('true'), ev('false'), ev('nothing')]).toEqual([42, 42, 42, 1, 0, 0])
  })

  it('arithmetic is 16-bit and signed, division truncating', () => {
    expect(ev('2 + 3 * 4')).toBe(14)
    expect(ev('(2 + 3) * 4')).toBe(20)
    expect(ev('-1')).toBe(0xffff)
    expect(ev('0 - 7 / 2')).toBe(0xfffd) // -3
    expect(ev('-7 % 2')).toBe(0xffff) // -1
    expect(ev('32767 + 1')).toBe(0x8000)
    expect(ev('L01 < 0')).toBe(1) // 0xffff is -1
    expect(err('1 / 0')).toBe('division by zero')
  })

  it('comparisons, ~= as !=, and logic', () => {
    expect([ev('3 == 3'), ev('3 ~= 3'), ev('3 != 4'), ev('2 <= 2'), ev('2 > 3')]).toEqual([1, 0, 1, 1, 0])
    expect([ev('1 && 0'), ev('1 || 0'), ev('!0'), ev('!5'), ev('0 || 0 && 1')]).toEqual([0, 1, 1, 0, 0])
  })

  it('names: locals first, then globals, objects, constants', () => {
    expect(ev('count')).toBe(3)
    expect(ev('L00')).toBe(3)
    expect(ev('score')).toBe(7)
    expect(ev('lantern')).toBe(2)
    expect(ev('MAX_SCORE - score')).toBe(3)
    expect(ev('"brass lantern"')).toBe(2)
    expect(ev('##Take')).toBe(4)
    expect(err('lantren')).toBe("there's no local, global, object or constant called lantren")
    expect(err('"lamp"')).toBe('no object is called "lamp"')
  })

  it('the object tree: has, hasnt, in, parent/child/sibling', () => {
    expect(ev('lantern has light')).toBe(1)
    expect(ev('lantern hasnt light')).toBe(0)
    expect(ev('player has light')).toBe(0)
    expect(ev('lantern has 5')).toBe(1)
    expect(ev('lantern in hall')).toBe(1)
    expect(ev('box in hall')).toBe(0)
    expect(ev('parent(box) == player')).toBe(1)
    expect([ev('child(hall)'), ev('sibling(lantern)')]).toEqual([2, 3])
    expect(ev('lantern in location && lantern has light')).toBe(1)
    expect(err('lantern has shiny')).toBe("there's no attribute called shiny")
    expect(err('nothing has light')).toBe('that is nothing (object 0)')
  })

  it('properties: obj.prop by name or number, and a missing one says so', () => {
    expect(ev('lantern.description')).toBe(0x1234)
    expect(ev('lantern.weight < 0')).toBe(1)
    expect(ev('lantern.3')).toBe(0x1234)
    expect(err('box.weight')).toBe('object 4 has no property 9')
    expect(err('lantern.colour')).toBe("there's no property called colour")
  })

  it('says what is wrong with an expression that doesn’t parse', () => {
    const bad = (s: string) => {
      try {
        parseExpr(s)
      } catch (e) {
        expect(e).toBeInstanceOf(ExprError)
        return (e as Error).message
      }
      throw new Error(`"${s}" parsed`)
    }
    expect(bad('')).toBe('the expression is empty')
    expect(bad('(1 + 2')).toBe('expected ")" at the end')
    expect(bad('1 +')).toBe('the expression ends too soon')
    expect(bad('1 2')).toBe('"2" doesn\'t belong after the expression')
    expect(bad('score = 3')).toBe('"=" isn\'t part of an expression here')
    expect(bad('lantern has')).toBe('"has" needs an attribute after it')
    expect(bad('"open')).toContain('no closing')
  })

  it('can’t change anything: there is no assignment, call or increment', () => {
    for (const s of ['score = 1', 'score++', 'Foo()', 'x := 1']) expect(() => parseExpr(s)).toThrow(ExprError)
  })
})
