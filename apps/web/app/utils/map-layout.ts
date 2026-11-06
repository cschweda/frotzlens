/**
 * Grid placement for the map: Trizbort's rule, as Frotzsmith's map draws it
 * (ported from Frotzsmith's app/composables/map-graph.ts, by the same author,
 * keyed by object number here instead of room name). The start room sits at
 * (0, 0); each exit puts its room one step away in its compass direction,
 * or the nearest free cell when that one is taken; up, down, in and out go
 * to the nearest free cell. Rooms no exit reaches start a group of their own.
 */
import type { Direction, RoomGraph } from '@frotzinc/zcode'

export interface PlacedRoom { number: number; name: string; col: number; row: number }
export interface Connector { from: number; to: number; dir: Direction; grid: boolean }
export interface MapLayout {
  rooms: PlacedRoom[]
  connectors: Connector[]
  bounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }
}

export const DELTA: Record<Direction, [number, number]> = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
  ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
  u: [0, 0], d: [0, 0], in: [0, 0], out: [0, 0],
}

/** Each exit that reaches a room, or for a routine exit each room it can return: what the map draws. */
export function mapEdges(g: RoomGraph): { from: number; to: number; dir: Direction }[] {
  const rooms = new Set(g.rooms.map(r => r.number))
  return g.exits.flatMap(e => (e.to !== undefined ? [e.to] : (e.candidates ?? [])).filter(t => rooms.has(t)).map(to => ({ from: e.from, to, dir: e.dir })))
}

export function layoutMap(g: RoomGraph): MapLayout {
  const edges = mapEdges(g)
  const pos = new Map<number, [number, number]>()
  const occupied = new Set<string>()
  const key = (c: number, r: number) => `${c},${r}`
  const place = (room: number, c: number, r: number) => {
    pos.set(room, [c, r])
    occupied.add(key(c, r))
  }
  const nearestFree = (c: number, r: number): [number, number] => {
    for (let ring = 0; ring < 64; ring++)
      for (let dc = -ring; dc <= ring; dc++)
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
          if (!occupied.has(key(c + dc, r + dr))) return [c + dc, r + dr]
        }
    return [c, r]
  }
  // Place each exit's room by its source, by the exit's compass step, until nothing more can be placed.
  const relax = () => {
    for (let changed = true; changed; ) {
      changed = false
      for (const e of edges) {
        const from = pos.get(e.from)
        if (!from || pos.has(e.to)) continue
        const [dc, dr] = DELTA[e.dir]
        if ((dc || dr) && !occupied.has(key(from[0] + dc, from[1] + dr))) place(e.to, from[0] + dc, from[1] + dr)
        else place(e.to, ...nearestFree(from[0] + dc, from[1] + dr))
        changed = true
      }
    }
  }
  const first = g.start ?? g.rooms[0]?.number
  if (first !== undefined) place(first, 0, 0)
  relax()
  for (const r of g.rooms) {
    if (pos.has(r.number)) continue
    place(r.number, ...nearestFree(0, 0))
    relax()
  }

  const connectors = edges.map(e => {
    const a = pos.get(e.from)!
    const b = pos.get(e.to)!
    const [dc, dr] = DELTA[e.dir]
    return { ...e, grid: (dc !== 0 || dr !== 0) && b[0] === a[0] + dc && b[1] === a[1] + dr }
  })
  const placed = [...pos.values()]
  const cols = placed.map(p => p[0])
  const rows = placed.map(p => p[1])
  const bounds = placed.length
    ? { minCol: Math.min(...cols), maxCol: Math.max(...cols), minRow: Math.min(...rows), maxRow: Math.max(...rows) }
    : { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }
  return { rooms: g.rooms.map(r => ({ ...r, col: pos.get(r.number)![0], row: pos.get(r.number)![1] })), connectors, bounds }
}
