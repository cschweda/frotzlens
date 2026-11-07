<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** The 240 global variables: their starting values, names (with a debug file) and the routines that use them. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

const number = computed(() => (props.id && /^\d+$/.test(props.id) ? Number(props.id) : undefined))
const global = computed(() => (number.value === undefined ? undefined : props.story.globals[number.value]))

const filter = ref('')
const rows = computed(() => {
  const s = props.story
  const q = filter.value.trim().toLowerCase()
  return s.globals
    // Uses: each place an instruction reads or writes it, as the detail's "Used by" counts them.
    .map(g => ({ g, name: globalName(g.number), txd: `G${hex(g.number, 2)}`, uses: s.xrefs[g.id]?.from.length ?? 0 }))
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.txd.toLowerCase() === q || hex(r.g.value).includes(q.replace(/^#|0x/, '')))
})

/** As text: each global, its name if any, and its starting value. */
const asText = () =>
  props.story.globals
    .map(g => `G${hex(g.number, 2)}  ${hex(g.value)}${activeSymbols.value?.globals[g.number] ? `  ${activeSymbols.value.globals[g.number]}` : ''}`)
    .join('\n') + '\n'
</script>

<template>
  <div v-if="id === undefined" class="flex flex-col gap-6">
    <ViewHeader title="Globals" :eyebrow="fileName" :copy="asText" copy-label="Copy the globals">
      The 240 global variables (G00–Gef), with the value each starts with and the routines that use it.
      <template v-if="!activeSymbols"> Load the game’s debug file to see their names.</template>
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Search names, G-numbers or values" aria-label="Search globals" class="max-w-md" />
    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="w-full text-sm">
        <caption class="sr-only">Global variables</caption>
        <thead class="bg-muted text-left text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-semibold">Global</th>
            <th v-if="activeSymbols" scope="col" class="px-4 py-2 font-semibold">Number</th>
            <th scope="col" class="px-4 py-2 font-semibold">Address</th>
            <th scope="col" class="px-4 py-2 font-semibold">Starts as</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Used by</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.g.number" class="border-t border-default">
            <td class="data px-4 py-1.5"><a :href="`#global/${r.g.number}`" class="text-lamp hover:underline">{{ r.name }}</a></td>
            <td v-if="activeSymbols" class="data px-4 py-1.5 text-muted">{{ r.txd }}</td>
            <td class="data px-4 py-1.5 text-muted">{{ hex(r.g.address) }}</td>
            <td class="data px-4 py-1.5">{{ hex(r.g.value) }} <span class="text-muted">({{ r.g.value }})</span></td>
            <td class="data px-4 py-1.5 text-right">{{ r.uses }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="text-muted">{{ story.globals.length ? `No global matches “${filter}”.` : 'This file has no globals table.' }}</p>
  </div>

  <div v-else-if="global" class="flex flex-col gap-6">
    <ViewHeader
      :title="globalName(global.number)"
      :eyebrow="`G${hex(global.number, 2)} · variable ${global.number + 16} · at ${hex(global.address)}`"
      :back="{ to: '#globals', label: 'All globals' }"
    />
    <dl class="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
      <dt class="text-muted">Starts as</dt>
      <dd class="data">{{ hex(global.value) }} ({{ global.value }})</dd>
    </dl>
    <Referrers :story="story" :id="global.id" from-title="Used by" />
  </div>

  <NotFound v-else :what="`global ${id}`" back="#globals" back-label="All globals" />
</template>
