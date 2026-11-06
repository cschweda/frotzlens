<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatRoutine } from '@frotzinc/zcode/format'

/**
 * What a route names, until Phase 4's full views: enough to be useful from the
 * command palette — a routine's disassembly, an object's details, a string's
 * text, a dictionary word's flags — and a link back.
 */
const props = defineProps<{ story: StoryFile; view: string; id?: string }>()
const hex = (n: number) => n.toString(16).padStart(4, '0')
const n = computed(() => (props.id ? parseInt(props.id, props.view === 'object' ? 10 : 16) : NaN))

const routine = computed(() => (props.view === 'routine' ? formatRoutine(props.story, n.value) : undefined))
const object = computed(() => (props.view === 'object' ? props.story.objects.objects[n.value - 1] : undefined))
const string = computed(() => (props.view === 'string' ? props.story.strings.find(s => s.address === n.value) : undefined))
const word = computed(() => (props.view === 'dict' ? props.story.dictionary.entries.find(e => e.address === n.value) : undefined))
const name = (o?: number) => (o ? props.story.objects.objects[o - 1]?.shortName.text || `object ${o}` : '—')

const LISTS: Record<string, string> = {
  objects: 'the object tree',
  routines: 'every routine',
  strings: 'every string',
  dictionary: 'the dictionary',
  grammar: 'the grammar',
  memory: 'the memory and hex view',
  symbols: 'debug symbols',
}
const flags = (w: NonNullable<typeof word.value>) =>
  w.inform ? Object.entries(w.inform).filter(([, on]) => on).map(([k]) => k).join(', ') || 'none' : '—'
</script>

<template>
  <div class="flex flex-col gap-6">
    <a href="#overview" class="text-sm text-muted hover:underline">← Overview</a>

    <template v-if="routine">
      <h1 class="font-display text-3xl font-bold text-highlighted">Routine {{ id }}</h1>
      <pre class="data overflow-x-auto rounded-xl border border-default bg-muted p-4 text-sm leading-6 text-default">{{ routine }}</pre>
    </template>

    <template v-else-if="object">
      <h1 class="font-display text-3xl font-bold text-highlighted">{{ object.shortName.text || `Object ${object.number}` }}</h1>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
        <dt class="text-muted">Number</dt><dd class="data">{{ object.number }}</dd>
        <dt class="text-muted">Parent</dt><dd><a v-if="object.parent" :href="`#object/${object.parent}`" class="hover:underline">{{ name(object.parent) }}</a><span v-else>—</span></dd>
        <dt class="text-muted">First child</dt><dd><a v-if="object.child" :href="`#object/${object.child}`" class="hover:underline">{{ name(object.child) }}</a><span v-else>—</span></dd>
        <dt class="text-muted">Next sibling</dt><dd><a v-if="object.sibling" :href="`#object/${object.sibling}`" class="hover:underline">{{ name(object.sibling) }}</a><span v-else>—</span></dd>
        <dt class="text-muted">Attributes</dt><dd class="data">{{ object.attributes.join(', ') || 'none' }}</dd>
        <dt class="text-muted">Properties</dt><dd class="data">{{ object.properties.map(p => p.number).join(', ') || 'none' }}</dd>
      </dl>
    </template>

    <template v-else-if="string">
      <h1 class="font-display text-3xl font-bold text-highlighted">String at {{ hex(string.address) }}</h1>
      <p class="whitespace-pre-wrap rounded-xl border border-default bg-muted p-5 text-lg">{{ string.text }}</p>
    </template>

    <template v-else-if="word">
      <h1 class="font-display text-3xl font-bold text-highlighted">“{{ word.word }}”</h1>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
        <dt class="text-muted">Entry</dt><dd class="data">{{ word.index }} at {{ hex(word.address) }}</dd>
        <dt class="text-muted">Inform flags</dt><dd>{{ flags(word) }}</dd>
        <dt class="text-muted">Data</dt><dd class="data">{{ word.data.map(b => b.toString(16).padStart(2, '0')).join(' ') }}</dd>
      </dl>
    </template>

    <template v-else>
      <h1 class="font-display text-3xl font-bold text-highlighted">{{ LISTS[view] ? `Coming next: ${LISTS[view]}` : 'Nothing here' }}</h1>
      <p class="max-w-2xl text-muted">
        {{ LISTS[view]
          ? 'This view arrives in the next phase. Meanwhile, ⌘K / Ctrl+K finds any routine, object, string or dictionary word by name or address.'
          : `There's no ${view}${id ? ` “${id}”` : ''} in this file.` }}
      </p>
    </template>
  </div>
</template>
