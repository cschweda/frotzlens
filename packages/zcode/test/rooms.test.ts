/**
 * The room graph, from direction properties named by the debug file, and its
 * frotzsmith map shape. Doors (no fixture has one) are checked on a model
 * built by hand.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseStory, readSymbols, roomGraph, toMapGraph, type StoryFile, type Symbols } from '../src/index.js'
import { FIXTURES_DIR, readStory } from './fixtures.js'

const graph = (name: string) =>
  roomGraph(parseStory(readStory(`${name}.z5`)), readSymbols(readFileSync(`${FIXTURES_DIR}${name}.dbg`, 'utf8')))

describe('roomGraph', () => {
  it('dark-cellar: two rooms, an exit each way, starting in the Hall', () => {
    const g = graph('dark-cellar')!
    expect(g.rooms.map(r => r.name)).toEqual(['Hall', 'Cellar'])
    const [hall, cellar] = g.rooms.map(r => r.number)
    expect(g.start).toBe(hall)
    expect(g.exits).toEqual([
      { from: hall, dir: 'd', kind: 'room', to: cellar },
      { from: cellar, dir: 'u', kind: 'room', to: hall },
    ])
    expect(toMapGraph(g)).toEqual({
      rooms: ['Hall', 'Cellar'],
      edges: [{ from: 'Hall', to: 'Cellar', dir: 'd' }, { from: 'Cellar', to: 'Hall', dir: 'u' }],
      start: 'Hall',
    })
  })

  it('mingus-1: every exit leads to a room, and routine exits name the rooms they can return', () => {
    const g = graph('mingus-1')!
    // 19: the ending's room, The River's Edge, is reached only by a routine exit (`return river_edge;`).
    expect(g.rooms.length).toBe(19)
    expect(g.rooms.map(r => r.name)).toContain("The River's Edge")
    expect(g.rooms.find(r => r.number === g.start)?.name).toBe('Wind-Scoured Mesa')
    const rooms = new Set(g.rooms.map(r => r.number))
    for (const e of g.exits) {
      expect(rooms.has(e.from)).toBe(true)
      if (e.kind === 'room') expect(rooms.has(e.to!)).toBe(true)
      if (e.kind === 'routine') expect(e.candidates?.length).toBeGreaterThanOrEqual(1)
    }
    const m = toMapGraph(g)
    expect(m.rooms[0]).toBe('Wind-Scoured Mesa')
    expect(m.edges.length).toBe(g.exits.reduce((n, e) => n + (e.candidates?.length ?? 1), 0))
    // Connected: every room can be reached from the start.
    const seen = new Set([m.start!])
    for (let grew = true; grew; ) {
      grew = false
      for (const e of m.edges) if (seen.has(e.from) && !seen.has(e.to)) grew = seen.add(e.to) !== undefined
    }
    expect([...seen].sort()).toEqual([...m.rooms].sort())
  })

  it("puny-dark-cellar: PunyInform's start is its INITIAL_LOCATION_VALUE", () => {
    const g = roomGraph(parseStory(readStory('puny-dark-cellar.z5')), readSymbols(readFileSync(`${FIXTURES_DIR}puny-dark-cellar.dbg`, 'utf8')))!
    expect(g.start).toBe(8)
    expect(g.rooms.find(r => r.number === g.start)?.name).toBe('Hall')
  })

  it('no direction properties named, no graph', () => {
    const story = parseStory(readStory('dark-cellar.z5'))
    expect(roomGraph(story, readSymbols('<inform-story-file></inform-story-file>'))).toBeUndefined()
  })
})

describe('doors, messages and shared names (a model built by hand)', () => {
  // Objects: 1 Porch, 2 the front door (door_to → 3), 3 Hallway, 4 a trapdoor (door_to a routine),
  // 5 Hallway again (another room with the same name). Property 10 is n_to, 11 s_to, 12 door_to, 13 d_to.
  const obj = (number: number, name: string, props: [number, number][]) => ({
    id: `object:${number}` as const, number, attributes: [], parent: 0, sibling: 0, child: 0, propertyTable: 0,
    shortName: { id: `string:0` as const, address: 0, length: 0, text: name },
    properties: props.map(([n, v]) => ({ number: n, address: 0, dataAddress: 0, size: 2, data: [v >> 8, v & 255] })),
  })
  const story = {
    header: { version: 5 },
    objects: { objects: [
      obj(1, 'Porch', [[10, 2], [11, 0x500 / 4], [13, 4]]),
      obj(2, 'front door', [[12, 3]]),
      obj(3, 'Hallway', [[11, 1], [13, 5]]),
      obj(4, 'trapdoor', [[12, 0x600 / 4]]),
      obj(5, 'Hallway', [[10, 3]]),
      obj(6, '', [[11, 0x700 / 4]]),
      obj(7, '', [[10, 0x700 / 4]]),
      obj(8, 'Vault', []),
      obj(9, 'Treasure', []), // a class: in nothing, like a room, but not one
    ] },
    code: { routines: [
      { address: 0x600, instructions: [] },
      // return Vault (a room no plain exit reaches); return Treasure (a class, not a room).
      { address: 0x700, instructions: [{ name: 'RET', operands: [{ kind: 'small', value: 8 }] }, { name: 'RET', operands: [{ kind: 'small', value: 9 }] }] },
    ] },
    strings: [{ address: 0x500 }],
  } as unknown as StoryFile
  const symbols = { properties: { 10: 'n_to', 11: 's_to', 12: 'door_to', 13: 'd_to' }, globals: {}, routines: {}, classes: { 9: 'Treasure' }, constants: {} } as unknown as Symbols

  it('follows a door to its room; a door to a routine leads nowhere yet; a string is a refusal', () => {
    const g = roomGraph(story, symbols)!
    expect(g.exits.filter(e => e.from <= 5)).toEqual([
      { from: 1, dir: 'n', kind: 'door', door: 2, to: 3 },
      { from: 1, dir: 's', kind: 'message', string: 0x500 },
      { from: 1, dir: 'd', kind: 'door', door: 4 },
      { from: 3, dir: 's', kind: 'room', to: 1 },
      { from: 3, dir: 'd', kind: 'room', to: 5 },
      { from: 5, dir: 'n', kind: 'room', to: 3 },
    ])
  })

  it("a routine exit's room counts even when no plain exit reaches it; a class isn't one", () => {
    const g = roomGraph(story, symbols)!
    expect(g.exits.filter(e => e.kind === 'routine').map(e => e.candidates)).toEqual([[8], [8]])
    expect(g.rooms.map(r => r.number)).toEqual([1, 3, 5, 6, 7, 8])
  })

  it('the map shape: names two rooms share, and unnamed rooms, are told apart', () => {
    expect(toMapGraph(roomGraph(story, symbols)!)).toEqual({
      rooms: ['Porch', 'Hallway (3)', 'Hallway (5)', '(object 6)', '(object 7)', 'Vault'],
      edges: [
        { from: 'Porch', to: 'Hallway (3)', dir: 'n' },
        { from: 'Hallway (3)', to: 'Porch', dir: 's' },
        { from: 'Hallway (3)', to: 'Hallway (5)', dir: 'd' },
        { from: 'Hallway (5)', to: 'Hallway (3)', dir: 'n' },
        { from: '(object 6)', to: 'Vault', dir: 's' },
        { from: '(object 7)', to: 'Vault', dir: 'n' },
      ],
      start: null,
    })
  })
})
