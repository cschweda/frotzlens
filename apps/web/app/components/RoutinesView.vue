<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatRoutine, formatTxd, routineView } from '@frotzinc/zcode/format'

/** Every routine (the list), or one routine's disassembly with what it calls and what calls it. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

const address = computed(() => (props.id && /^[0-9a-f]+$/i.test(props.id) ? parseInt(props.id, 16) : undefined))
const index = computed(() => (address.value === undefined ? -1 : props.story.code.routines.findIndex(r => r.address === address.value)))
const routine = computed(() => (index.value >= 0 ? props.story.code.routines[index.value] : undefined))
// With a debug file loaded and names on, the disassembly names routines, globals, locals,
// attributes and properties; copying gives the same text.
const symbolsOpt = computed(() => (activeSymbols.value ? { symbols: activeSymbols.value } : {}))
const view = computed(() => (routine.value ? routineView(props.story, routine.value.address, symbolsOpt.value) : undefined))
const prev = computed(() => (index.value > 0 ? props.story.code.routines[index.value - 1] : undefined))
const next = computed(() => (index.value >= 0 ? props.story.code.routines[index.value + 1] : undefined))

// The list.
const filter = ref('')
const rows = computed(() => {
  const s = props.story
  const q = filter.value.trim().toLowerCase()
  return s.code.routines
    .map(r => ({
      r,
      name: routineName(s, r.address),
      // Both counts are distinct routines: the routines it calls, the routines that call it.
      from: new Set((s.xrefs[r.id]?.from ?? []).filter(f => f.id.startsWith('routine:')).map(f => f.id)).size,
      calls: (s.xrefs[r.id]?.to ?? []).filter(t => t.startsWith('routine:')).length,
    }))
    .filter(x => !q || x.name.toLowerCase().includes(q) || hex(x.r.address).includes(q.replace(/^0x/, '')))
})
const list = useLimit(() => rows.value)
watch(filter, () => list.reset())

// Labels: a branch or jump target scrolls to its line and focuses it (the route stays the routine).
function jump(target: number) {
  const el = document.getElementById(`at-${hex(target)}`)
  el?.scrollIntoView({ block: 'center' })
  el?.focus()
}
</script>

<template>
  <div v-if="id === undefined" class="flex flex-col gap-6">
    <ViewHeader title="Routines" :eyebrow="fileName" :copy="() => formatTxd(story, symbolsOpt)" :copy-label="activeSymbols ? 'Copy the disassembly (with names)' : 'Copy the disassembly (txd)'">
      Every routine, found by reading the code area from the end of the dictionary, as txd does. Each one's
      disassembly links every routine, string, object and dictionary word it uses.
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Filter by name (R0012) or address" aria-label="Filter routines" class="max-w-md" />
    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="w-full text-sm">
        <caption class="sr-only">Routines</caption>
        <thead class="bg-muted text-left text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-semibold">Routine</th>
            <th scope="col" class="px-4 py-2 font-semibold">Address</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Locals</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Instructions</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Calls</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Called from</th>
          </tr>
        </thead>
        <tbody class="data">
          <tr v-for="x in list.shown.value" :key="x.r.address" class="border-t border-default">
            <td class="px-4 py-1.5"><a :href="`#routine/${hex(x.r.address)}`" class="text-lamp hover:underline">{{ x.name }}</a><span v-if="x.r.address === story.code.main" class="ml-2 font-sans text-xs text-muted">main</span></td>
            <td class="px-4 py-1.5 text-muted">{{ hex(x.r.address) }}</td>
            <td class="px-4 py-1.5 text-right">{{ x.r.locals }}</td>
            <td class="px-4 py-1.5 text-right">{{ x.r.instructions.length }}</td>
            <td class="px-4 py-1.5 text-right">{{ x.calls }}</td>
            <td class="px-4 py-1.5 text-right">{{ x.from }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="text-muted">{{ filter.trim() ? `No routine matches “${filter}”.` : 'This file has no routines.' }}</p>
    <UButton v-if="list.remaining.value" color="neutral" variant="outline" class="w-fit" @click="list.more">Show more ({{ list.remaining.value }} left)</UButton>
  </div>

  <div v-else-if="routine && view" class="flex flex-col gap-6">
    <ViewHeader
      :title="`Routine ${view.name}`"
      :eyebrow="`${hex(routine.address)}–${hex(routine.end - 1)} · ${routine.locals} ${routine.locals === 1 ? 'local' : 'locals'} · ${routine.instructions.length} instructions`"
      :back="{ to: '#routines', label: 'All routines' }"
      :copy="() => formatRoutine(story, routine!.address, symbolsOpt) ?? ''"
    />
    <nav aria-label="Neighbouring routines" class="flex gap-4 text-sm">
      <a v-if="prev" :href="`#routine/${hex(prev.address)}`" class="text-muted hover:underline">← {{ routineName(story, prev.address) }}</a>
      <a v-if="next" :href="`#routine/${hex(next.address)}`" class="text-muted hover:underline">{{ routineName(story, next.address) }} →</a>
    </nav>
    <div class="overflow-x-auto rounded-xl border border-default bg-muted" role="region" aria-label="Disassembly" tabindex="0">
      <div class="data min-w-max p-4 text-sm leading-6">
        <div class="whitespace-pre text-highlighted">{{ view.header }}</div>
        <div v-for="(n, i) in view.notes" :key="i" class="whitespace-pre text-muted">{{ n }}</div>
        <div aria-hidden="true">&nbsp;</div>
        <div
          v-for="l in view.lines"
          :id="`at-${hex(l.address)}`"
          :key="l.address"
          tabindex="-1"
          class="whitespace-pre rounded focus:bg-elevated"
        ><span class="text-muted">{{ `${hex(l.address).padStart(5)}  ` }}</span><span class="text-lamp">{{ (l.label ? `${l.label}:` : '').padEnd(7) }}</span><template v-for="(p, j) in l.pieces" :key="j"><a v-if="p.id" :href="idRoute(p.id)" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid">{{ p.text }}</a><a v-else-if="p.target !== undefined" :href="`#routine/${hex(routine.address)}`" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid" :aria-label="`${p.text}, the instruction at ${hex(p.target)}`" @click.prevent="jump(p.target)">{{ p.text }}</a><span v-else>{{ p.text }}</span></template></div>
      </div>
    </div>
    <Referrers :story="story" :id="routine.id" from-title="Referred to from" to-title="Calls and uses" />
  </div>

  <NotFound v-else :what="`routine ${id}`" back="#routines" back-label="All routines" />
</template>
