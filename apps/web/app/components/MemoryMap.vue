<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

const props = defineProps<{ story: StoryFile }>()
const hex = (n: number) => n.toString(16).padStart(4, '0')

interface Band {
  key: string
  label: string
  start: number
  end: number
  /** A tone from the palette, by how "data-like" the band is. */
  tone: 'header' | 'table' | 'text' | 'code' | 'strings'
}

/** The tables the model locates, plus the code and string areas (also from the model). */
const bands = computed<Band[]>(() => {
  const s = props.story
  const tone = (kind: string): Band['tone'] =>
    kind === 'header' || kind === 'header-extension' ? 'header' : kind === 'dictionary' || kind === 'abbreviations' ? 'text' : 'table'
  const out: Band[] = s.memory.segments.map(g => ({ key: g.kind, label: g.label, start: g.start, end: g.end, tone: tone(g.kind) }))
  const r = s.code.routines
  if (r.length) out.push({ key: 'code', label: `Routines (${r.length})`, start: r[0]!.address, end: s.code.end, tone: 'code' })
  const st = s.strings
  if (st.length) out.push({ key: 'strings', label: `Strings (${st.length})`, start: st[0]!.address, end: st.at(-1)!.address + st.at(-1)!.length, tone: 'strings' })
  return out.sort((a, b) => a.start - b.start)
})

const size = computed(() => props.story.memory.size || 1)
const pct = (n: number) => `${(100 * n) / size.value}%`
const regions = computed(() => props.story.memory.regions)
const go = (key: string) => { location.hash = `memory/${key}` }
</script>

<template>
  <section aria-labelledby="map-title" class="flex flex-col gap-4">
    <h2 id="map-title" class="font-display text-2xl font-semibold text-highlighted sm:text-[1.6rem]">Memory map</h2>
    <p class="text-sm text-muted">
      The whole file, {{ story.memory.size.toLocaleString() }} bytes, drawn to scale. Select a part to open it.
    </p>

    <!-- Regions: dynamic, static, high (§1.1). Static and high may overlap. -->
    <!-- High memory gets its own row: it overlaps static memory (§1.1). -->
    <div class="relative h-12 w-full rounded bg-elevated" aria-hidden="true">
      <div
        v-for="r in regions"
        :key="r.kind"
        class="absolute h-6 overflow-hidden border-x border-default text-[11px] leading-6 text-muted"
        :style="{ left: pct(r.start), width: pct(r.end - r.start), top: r.kind === 'high' ? '1.5rem' : '0' }"
      >
        <span class="block truncate px-1">{{ r.label }}</span>
      </div>
    </div>
    <!-- The strip truncates narrow regions; the full names and bounds, as text. -->
    <p class="-mt-2 text-xs text-muted">
      <template v-for="(r, i) in regions" :key="r.kind">
        <span v-if="i" aria-hidden="true"> · </span>{{ r.label }} <span class="data">{{ hex(r.start) }}–{{ hex(r.end - 1) }}</span>
      </template>
    </p>

    <!-- The parts, to scale. A pointer shortcut only: many are a few pixels wide,
         so the list below is the accessible (and keyboard) way to open each one. -->
    <div class="relative h-14 w-full overflow-hidden rounded-lg bg-elevated" aria-hidden="true">
      <div
        v-for="b in bands"
        :key="b.key"
        class="band absolute top-0 h-full cursor-pointer"
        :class="`band-${b.tone}`"
        :style="{ left: pct(b.start), width: `max(3px, ${pct(b.end - b.start)})` }"
        :title="`${b.label}: ${hex(b.start)}–${hex(b.end - 1)}, ${(b.end - b.start).toLocaleString()} bytes`"
        @click="go(b.key)"
      />
    </div>

    <ul class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" aria-label="Parts of the file">
      <li v-for="b in bands" :key="b.key" class="flex items-center gap-2">
        <span class="band inline-block size-3 shrink-0 rounded-sm" :class="`band-${b.tone}`" aria-hidden="true" />
        <a :href="`#memory/${b.key}`" class="text-default hover:underline">{{ b.label }}</a>
        <span class="data ml-auto text-muted">{{ hex(b.start) }}–{{ hex(b.end - 1) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.band { transition: filter 0.15s; }
.band:hover { filter: brightness(1.25); }
.band-header { background: var(--frotz-ink-2); }
.band-table { background: color-mix(in oklab, var(--frotz-lamp) 55%, var(--frotz-panel)); }
.band-text { background: color-mix(in oklab, var(--frotz-lamp) 80%, var(--frotz-ink)); }
.band-code { background: var(--frotz-lamp); }
.band-strings { background: color-mix(in oklab, var(--frotz-lamp) 35%, var(--frotz-panel)); }
</style>
