<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatMap } from '@frotzinc/zcode/format'

/**
 * The memory map, and a hex view of the file (HexPane, from @frotzinc/zcode-ui): of one part
 * (#memory/dictionary) or from any address. Each row notes the parts that begin in it.
 */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

interface Part { key: string; label: string; start: number; end: number }
const parts = computed<Part[]>(() => {
  const s = props.story
  const out: Part[] = s.memory.segments.map(g => ({ key: g.kind, label: g.label, start: g.start, end: g.end }))
  const r = s.code.routines
  if (r.length) out.push({ key: 'code', label: `Routines (${r.length})`, start: r[0]!.address, end: s.code.end })
  const st = s.strings
  if (st.length) out.push({ key: 'strings', label: `Strings (${st.length})`, start: st[0]!.address, end: st.at(-1)!.address + st.at(-1)!.length })
  for (const g of s.memory.regions) out.push({ key: g.kind, label: g.label, start: g.start, end: g.end })
  return out.sort((a, b) => a.start - b.start)
})

const part = computed(() => parts.value.find(p => p.key === props.id))
/** The hex pane's first row: a part opens at its start. */
const top = ref(0)
watch(part, p => (top.value = Math.floor((p?.start ?? 0) / 16) * 16), { immediate: true })
const notes = (from: number, to: number) => parts.value.filter(p => p.start >= from && p.start < to).map(p => p.label)
const inPart = (a: number) => !part.value || (a >= part.value.start && a < part.value.end)
</script>

<template>
  <NotFound v-if="id && !part" :what="`part of memory called “${id}”`" back="#memory" back-label="Memory" />
  <div v-else class="flex flex-col gap-8">
    <ViewHeader
      :title="part ? part.label : 'Memory'"
      :eyebrow="part ? `${hex(part.start)}–${hex(part.end - 1)} · ${(part.end - part.start).toLocaleString()} bytes` : fileName"
      :back="part ? { to: '#memory', label: 'Memory' } : undefined"
      :copy="() => formatMap(story, { fileName })"
      copy-label="Copy the map (infodump)"
    />

    <MemoryMap :story="story" />

    <HexPane v-model:top="top" :bytes="story.bytes" :notes="notes" :in-range="inPart" />
  </div>
</template>
