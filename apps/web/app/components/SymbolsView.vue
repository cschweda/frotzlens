<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/**
 * The debug file: Inform writes gameinfo.dbg when it compiles with -k. Loaded
 * over the open story, it names what the file only numbers: routines and their
 * locals, globals, objects, properties, attributes and actions.
 */
const props = defineProps<{ story: StoryFile; fileName: string }>()
const { symbols, symbolsFile, symbolsStatus, symbolsMessage, names, loadSymbols } = useSymbols()
const input = useTemplateRef<HTMLInputElement>('input')
const isInform = computed(() => props.story.fingerprint?.compiler === 'inform6')

function onPick(e: Event) {
  const picker = e.target as HTMLInputElement
  const file = picker.files?.[0]
  picker.value = ''
  if (file) loadSymbols(file, props.story)
}

const counts = computed(() => {
  const s = symbols.value
  if (!s) return []
  const n = (o: object) => Object.keys(o).length
  return [
    { label: 'Routines', value: n(s.routines), to: '#routines' },
    { label: 'Globals', value: n(s.globals), to: '#globals' },
    { label: 'Objects', value: n(s.objects), to: '#objects' },
    { label: 'Properties', value: n(s.properties) },
    { label: 'Attributes', value: n(s.attributes) },
    { label: 'Actions', value: n(s.actions), to: props.story.grammar ? '#grammar' : undefined },
    { label: 'Arrays', value: s.arrays.length },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Symbols" :eyebrow="fileName">
      Inform writes a debug file, <code class="data">gameinfo.dbg</code>, when it compiles with <code class="data">-k</code>.
      Load it here (or drop it anywhere) and the views show the names from the source instead of numbers:
      routines and their locals, globals, properties, attributes and actions. It also draws the map.
    </ViewHeader>

    <p v-if="!isInform" class="text-muted">
      This story wasn’t compiled by Inform 6<template v-if="story.fingerprint?.compiler === 'zilf'"> (ZILF made it)</template>, so it has no Inform debug file.
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <UButton icon="i-lucide-file-code" :disabled="symbolsStatus === 'loading'" @click="input?.click()">
        {{ symbols ? 'Choose another debug file' : 'Choose a debug file' }}
      </UButton>
      <input ref="input" type="file" class="sr-only" accept=".dbg" tabindex="-1" aria-hidden="true" @change="onPick">
      <USwitch v-if="symbols" v-model="names" label="Show names" />
    </div>
    <p v-if="symbolsStatus === 'loading'" class="text-sm text-muted" role="status">Reading…</p>
    <p v-else-if="symbolsMessage" class="text-sm" :class="symbolsStatus === 'failed' || !symbols ? 'text-error' : 'text-muted'" role="alert">{{ symbolsMessage }}</p>

    <template v-if="symbols">
      <p>
        <span class="data">{{ symbolsFile }}</span>, from {{ symbols.creator ?? 'Inform' }} {{ symbols.creatorVersion }},
        written for this story file.
      </p>
      <section aria-label="What it names" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile v-for="c in counts" :key="c.label" :value="c.value" :label="c.label" :to="c.to" />
      </section>
      <p><a href="#map" class="text-lamp hover:underline">See the map</a></p>
      <section v-if="symbols.sources.length" aria-labelledby="sources-title" class="flex flex-col gap-2">
        <h2 id="sources-title" class="font-display text-xl font-semibold text-highlighted">Source files</h2>
        <ul class="data flex flex-col gap-0.5 text-sm">
          <li v-for="(s, i) in symbols.sources" :key="i">{{ s }}</li>
        </ul>
      </section>
    </template>
  </div>
</template>
