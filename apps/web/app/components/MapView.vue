<script setup lang="ts">
import { roomGraph, toMapGraph, type RoomExit, type StoryFile } from '@frotzinc/zcode'

/**
 * The map of an Inform game, from its rooms' exits (which need the debug file
 * to be found). Drawn on a grid, as frotzsmith's map is, and listed as text
 * below — the list is the map for anyone who can't see the picture.
 */
const props = defineProps<{ story: StoryFile; fileName: string }>()
const { symbols } = useSymbols()

const graph = computed(() => (symbols.value ? roomGraph(props.story, symbols.value) : undefined))
const map = computed(() => (graph.value ? layoutMap(graph.value) : undefined))

const CELL = 170
const W = 136
const H = 52
const PAD = 24
const box = computed(() => {
  const b = map.value?.bounds ?? { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }
  const x = b.minCol * CELL - W / 2 - PAD
  const y = b.minRow * CELL - H / 2 - PAD
  return { x, y, w: (b.maxCol - b.minCol) * CELL + W + PAD * 2, h: (b.maxRow - b.minRow) * CELL + H + PAD * 2 }
})
const at = computed(() => new Map(map.value?.rooms.map(r => [r.number, r]) ?? []))
const centre = (n: number) => {
  const r = at.value.get(n)!
  return { x: r.col * CELL, y: r.row * CELL }
}
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s)

const DIRS: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', in: 'in', out: 'out',
}
// A room's label: its short name, with its number when another room has the same name (as toMapGraph does).
const nameCount = computed(() => {
  const m = new Map<string, number>()
  for (const r of graph.value?.rooms ?? []) m.set(objectName(props.story, r.number), (m.get(objectName(props.story, r.number)) ?? 0) + 1)
  return m
})
const name = (n: number) => {
  const plain = objectName(props.story, n)
  return (nameCount.value.get(plain) ?? 0) > 1 ? `${plain} (${n})` : plain
}
function exitText(e: RoomExit): string {
  if (e.kind === 'room') return ''
  if (e.kind === 'door') return `through ${name(e.door!)}`
  if (e.kind === 'routine') return e.candidates?.length ? 'decided as the game runs: perhaps' : 'decided as the game runs'
  return 'no way through (a message)'
}
// Each room's exits, indexed once (a big map would otherwise rescan every exit per room).
const exitIndex = computed(() => {
  const m = new Map<number, RoomExit[]>()
  for (const e of graph.value?.exits ?? []) m.set(e.from, [...(m.get(e.from) ?? []), e])
  return m
})
const exitsFrom = (n: number) => exitIndex.value.get(n) ?? []
const LINK = 'text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid'
const copy = () => JSON.stringify(toMapGraph(graph.value!), null, 2) + '\n'
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Map" :eyebrow="fileName" :copy="graph ? copy : undefined" copy-label="Copy the map (frotzsmith's shape)">
      The rooms and the exits between them, from each room’s direction properties. Exits worked out as the
      game runs are drawn to the rooms their routine can return, dashed.
    </ViewHeader>

    <div v-if="!symbols" class="flex flex-col gap-3 rounded-xl border border-default p-5">
      <p>The map needs the game’s debug file: it finds exits by their property names (<code class="data">n_to</code>, <code class="data">s_to</code>, …).</p>
      <a href="#symbols" class="w-fit text-lamp hover:underline">Load a debug file</a>
    </div>
    <p v-else-if="!graph" class="text-muted">This game has no direction properties to find exits by.</p>

    <template v-else-if="map">
      <p class="text-sm text-muted">
        {{ graph.rooms.length }} {{ graph.rooms.length === 1 ? 'room' : 'rooms' }}<template v-if="graph.start">; the game starts in {{ name(graph.start) }}</template>.
      </p>
      <div class="overflow-x-auto rounded-xl border border-default bg-muted">
        <svg
          :viewBox="`${box.x} ${box.y} ${box.w} ${box.h}`"
          :width="box.w"
          :height="box.h"
          class="mx-auto block max-w-none"
          role="group"
          :aria-label="`A map of ${graph.rooms.length} rooms; each links to its object. The list below gives each room's exits.`"
        >
          <g aria-hidden="true">
            <line
              v-for="(c, i) in map.connectors"
              :key="i"
              :x1="centre(c.from).x"
              :y1="centre(c.from).y"
              :x2="centre(c.to).x"
              :y2="centre(c.to).y"
              stroke="var(--frotz-lamp-text)"
              stroke-width="2"
              :stroke-dasharray="c.routine ? '6 5' : undefined"
              stroke-opacity="0.7"
            />
          </g>
          <a v-for="r in map.rooms" :key="r.number" :href="`#object/${r.number}`">
            <title>{{ name(r.number) }}</title>
            <rect
              :x="r.col * CELL - W / 2"
              :y="r.row * CELL - H / 2"
              :width="W"
              :height="H"
              rx="8"
              fill="var(--ui-bg-elevated)"
              :stroke="r.number === graph.start ? 'var(--frotz-lamp-text)' : 'var(--ui-border-accented)'"
              :stroke-width="r.number === graph.start ? 3 : 1.5"
            />
            <text :x="r.col * CELL" :y="r.row * CELL + 5" text-anchor="middle" font-size="14" fill="var(--ui-text-highlighted)">{{ short(name(r.number)) }}</text>
          </a>
        </svg>
      </div>

      <section aria-labelledby="rooms-title" class="flex flex-col gap-3">
        <h2 id="rooms-title" class="font-display text-xl font-semibold text-highlighted">Rooms and exits</h2>
        <ul class="flex flex-col gap-3 text-sm">
          <li v-for="r in graph.rooms" :key="r.number">
            <a :href="`#object/${r.number}`" class="font-semibold text-lamp hover:underline">{{ name(r.number) }}</a>
            <span v-if="r.number === graph.start" class="ml-2 text-xs text-muted">where the game starts</span>
            <ul v-if="exitsFrom(r.number).length" class="mt-1 flex flex-col gap-0.5 pl-4">
              <li v-for="(e, i) in exitsFrom(r.number)" :key="i">
                <span class="data inline-block w-24 text-muted">{{ DIRS[e.dir] }}</span>
                {{ exitText(e) }}
                <!-- Links inside a sentence are underlined, so they don't rely on colour alone (WCAG 1.4.1). -->
                <template v-if="e.to !== undefined"><template v-if="e.kind === 'door'"> to </template><a :href="`#object/${e.to}`" :class="LINK">{{ name(e.to) }}</a></template>
                <template v-for="(c, j) in e.kind === 'routine' ? e.candidates ?? [] : []" :key="c">{{ j ? ' or ' : ' ' }}<a :href="`#object/${c}`" :class="LINK">{{ name(c) }}</a></template>
                <template v-if="e.kind === 'routine'"> (<a :href="`#routine/${hex(e.routine!)}`" :class="LINK">{{ routineName(story, e.routine!) }}</a>)</template>
              </li>
            </ul>
            <p v-else class="pl-4 text-muted">No exits.</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
