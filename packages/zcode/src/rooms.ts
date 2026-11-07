/**
 * The map of an Inform game, from its objects' direction properties (`n_to`,
 * `s_to`, … `out_to`), which need the debug file's names to be found. An exit
 * holds a room, a door (followed through its `door_to` when that is a room
 * too), a routine (an exit worked out as the game runs) or a string (a
 * refusal: "You can't go that way"). `toMapGraph` gives the shape
 * Frotzsmith's map draws.
 */
import { packedScale } from './address.js'
import type { Symbols } from './debug.js'
import type { StoryFile, Version, ZObject } from './types.js'

export type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'u' | 'd' | 'in' | 'out'

/** Inform's direction properties, in the Standard Library's (and PunyInform's) names. */
export const DIRECTION_PROPERTIES: Record<string, Direction> = {
  n_to: 'n', s_to: 's', e_to: 'e', w_to: 'w', ne_to: 'ne', nw_to: 'nw', se_to: 'se', sw_to: 'sw',
  u_to: 'u', d_to: 'd', in_to: 'in', out_to: 'out',
}

export interface RoomExit {
  from: number
  dir: Direction
  /** room: straight to `to`; door: through `door` (to `to`, when its door_to is a room);
   *  routine: decided as the game runs (`routine` is the address); message: a refusal (`string`). */
  kind: 'room' | 'door' | 'routine' | 'message'
  to?: number
  door?: number
  routine?: number
  /** For a routine: the rooms it can return (each a constant it returns that is a room). */
  candidates?: number[]
  string?: number
}

export interface RoomGraph {
  /** Object numbers, with their short names, in object order. */
  rooms: { number: number; name: string }[]
  exits: RoomExit[]
  /** Where the game starts: the room Initialise puts the player in, when that is a constant. */
  start?: number
}

/**
 * The room graph, or undefined when the symbols name no direction properties
 * (a game without Inform's library, or a debug file that isn't this story's).
 */
export function roomGraph(story: StoryFile, symbols: Symbols): RoomGraph | undefined {
  const dirs = new Map<number, Direction>()
  let doorTo: number | undefined
  for (const [n, name] of Object.entries(symbols.properties)) {
    if (DIRECTION_PROPERTIES[name]) dirs.set(Number(n), DIRECTION_PROPERTIES[name])
    if (name === 'door_to') doorTo = Number(n)
  }
  if (!dirs.size) return undefined

  const objects = story.objects.objects
  const get = (n: number): ZObject | undefined => (n >= 1 && n <= objects.length ? objects[n - 1] : undefined)
  const word = (o: ZObject, prop: number) => {
    const p = o.properties.find(x => x.number === prop)
    return p && p.size === 2 ? (p.data[0]! << 8) | p.data[1]! : undefined
  }
  const scale = packedScale(story.header.version as Version)
  const routines = new Set(story.code.routines.map(r => r.address))
  const strings = new Set(story.strings.map(s => s.address))

  const exits: RoomExit[] = []
  for (const o of objects) {
    for (const p of o.properties) {
      const dir = dirs.get(p.number)
      if (!dir || p.size !== 2) continue
      const v = (p.data[0]! << 8) | p.data[1]!
      if (v === 0) continue
      const target = get(v)
      if (target) {
        const through = doorTo !== undefined && target.properties.some(x => x.number === doorTo) ? word(target, doorTo) : undefined
        if (through === undefined) exits.push({ from: o.number, dir, kind: 'room', to: v })
        else exits.push({ from: o.number, dir, kind: 'door', door: v, ...(get(through) ? { to: through } : {}) })
      } else if (routines.has(v * scale)) exits.push({ from: o.number, dir, kind: 'routine', routine: v * scale })
      else if (strings.has(v * scale)) exits.push({ from: o.number, dir, kind: 'message', string: v * scale })
    }
  }

  const numbers = new Set<number>()
  for (const e of exits) {
    numbers.add(e.from)
    if (e.to) numbers.add(e.to)
  }
  const start = startRoom(story, symbols)
  if (start) numbers.add(start)
  // A routine exit's candidates: the rooms among the constants it returns (`return Pavilion;`), the
  // rooms already known and any other object that could be one: in nothing (a room has no parent),
  // and not one of Inform's classes (`return true` is a 1, which is the Class object).
  const classes = new Set(Object.keys(symbols.classes).map(Number))
  const roomLike = (n: number) => !!get(n) && get(n)!.parent === 0 && !classes.has(n)
  const byAddress = new Map(story.code.routines.map(r => [r.address, r]))
  for (const e of exits) {
    if (e.kind !== 'routine') continue
    const found = new Set<number>()
    for (const ins of byAddress.get(e.routine!)!.instructions) {
      const o = ins.operands[0]
      if (ins.name === 'RET' && o && o.kind !== 'variable' && (numbers.has(o.value) || roomLike(o.value))) found.add(o.value)
    }
    for (const n of found) numbers.add(n)
    if (found.size) e.candidates = [...found].sort((a, b) => a - b)
  }
  const rooms = [...numbers].sort((a, b) => a - b).map(n => ({ number: n, name: get(n)!.shortName.text }))
  return { rooms, exits, ...(start ? { start } : {}) }
}

/**
 * Where the game starts, as far as it can be read without running it: the Standard Library's
 * `location = Room;` in Initialise (a STORE of a constant to the `location` global), else
 * PunyInform's `Constant INITIAL_LOCATION_VALUE`, else the `location` global's starting value.
 * A start the game works out as it runs isn't found.
 */
function startRoom(story: StoryFile, symbols: Symbols): number | undefined {
  const isObject = (n: number | undefined) => (n !== undefined && n >= 1 && n <= story.objects.objects.length ? n : undefined)
  const location = Object.entries(symbols.globals).find(([, n]) => n === 'location')?.[0]
  const init = Object.values(symbols.routines).find(r => r.name === 'Initialise')
  const routine = init && story.code.routines.find(r => r.address === init.address)
  if (location !== undefined && routine) {
    const variable = 16 + Number(location)
    for (const ins of routine.instructions) {
      const [v, value] = ins.operands
      if (ins.name === 'STORE' && v?.kind !== 'variable' && v?.value === variable && value && value.kind !== 'variable') return isObject(value.value)
    }
  }
  return isObject(symbols.constants.INITIAL_LOCATION_VALUE) ?? (location !== undefined ? isObject(story.globals[Number(location)]?.value) : undefined)
}

/**
 * Frotzsmith's map shape: rooms by name, an edge for each exit that reaches a room, and for each
 * room a routine exit can return (so a map of a game whose exits are routines is still connected).
 * Names two rooms share get their number.
 */
export function toMapGraph(g: RoomGraph): { rooms: string[]; edges: { from: string; to: string; dir: Direction }[]; start: string | null } {
  // An unnamed room is "(object N)" (unique already); a name two rooms share gets each one's number.
  const label = (r: { number: number; name: string }) => r.name || `(object ${r.number})`
  const count = new Map<string, number>()
  for (const r of g.rooms) count.set(label(r), (count.get(label(r)) ?? 0) + 1)
  const name = new Map(g.rooms.map(r => [r.number, count.get(label(r))! > 1 ? `${label(r)} (${r.number})` : label(r)]))
  const edges = g.exits.flatMap(e =>
    (e.to !== undefined ? [e.to] : (e.candidates ?? [])).filter(t => name.has(t)).map(t => ({ from: name.get(e.from)!, to: name.get(t)!, dir: e.dir })),
  )
  // The start first: Frotzsmith lays the map out from its first room.
  const rooms = g.rooms.map(r => name.get(r.number)!)
  const start = g.start !== undefined ? name.get(g.start)! : null
  return { rooms: start ? [start, ...rooms.filter(r => r !== start)] : rooms, edges, start }
}
