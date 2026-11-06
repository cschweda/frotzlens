<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatGrammar, grammarLineText } from '@frotzinc/zcode/format'

/** Inform's grammar: each verb, its words, its lines, and each line's action routine. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()
const g = computed(() => props.story.grammar)

const dictByWord = computed(() => new Map(props.story.dictionary.entries.map(e => [e.word, e])))

const filter = ref('')
const verbs = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return (g.value?.verbs ?? []).map((v, i) => ({ v, i })).filter(x => !q || x.v.words.some(w => w.includes(q)))
})
const list = useLimit(() => verbs.value, 60)
watch(filter, () => list.reset())

const actionRoutine = (action: number) => g.value?.actions[action]
const VERSIONS: Record<number, string> = { 1: 'version 1 (old Inform)', 2: 'version 2 (the Standard Library)', 3: 'version 3 (PunyInform)' }

// #grammar/12: show (and focus) verb 12, even when it's past the first page.
const selected = computed(() => (props.id && /^\d+$/.test(props.id) ? Number(props.id) : undefined))
watch(selected, async (i) => {
  if (i === undefined) return
  filter.value = ''
  while (list.shown.value.length <= i && list.remaining.value) list.more()
  await nextTick()
  const el = document.getElementById(`verb-${i}`)
  el?.scrollIntoView({ block: 'start' })
  el?.focus()
}, { immediate: true })
</script>

<template>
  <div v-if="g" class="flex flex-col gap-6">
    <ViewHeader title="Grammar" :eyebrow="fileName" :copy="() => formatGrammar(story, { fileName })" copy-label="Copy the grammar (infodump)">
      How the parser reads a command: each verb's words, then its grammar lines in the order they're tried,
      each ending in the action routine that carries it out. Inform grammar {{ VERSIONS[g.version] }}.
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Find a verb" aria-label="Find a verb" class="max-w-md" />
    <ol class="flex flex-col gap-4">
      <li v-for="x in list.shown.value" :id="`verb-${x.i}`" :key="x.i" tabindex="-1" class="rounded-xl border border-default p-4 focus:border-[var(--frotz-lamp)] focus:outline-none" :class="selected === x.i ? 'border-[var(--frotz-lamp)]' : ''">
        <h2 class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="data text-sm text-muted">verb {{ x.v.number }}</span>
          <span class="flex flex-wrap gap-x-2 text-lg font-semibold">
            <template v-for="(w, k) in x.v.words" :key="w">
              <span v-if="k" class="text-muted" aria-hidden="true">/</span>
              <a v-if="dictByWord.get(w)" :href="`#dict/${hex(dictByWord.get(w)!.address)}`" class="data text-lamp hover:underline">{{ w }}</a>
              <span v-else class="data">{{ w }}</span>
            </template>
          </span>
        </h2>
        <ul class="mt-3 flex flex-col gap-1.5 text-sm">
          <li v-for="line in x.v.lines" :key="line.address" class="flex flex-wrap items-baseline gap-x-3">
            <span class="data">{{ grammarLineText(story, x.v.words[0] ?? '', line) }}</span>
            <span v-if="line.reverse" class="text-xs text-muted">(reversed)</span>
            <span class="text-muted" aria-hidden="true">→</span>
            <span class="sr-only">action</span>
            <template v-if="actionRoutine(line.action) !== undefined">
              <RefLink :story="story" :id="`routine:${hex(actionRoutine(line.action)!)}`" />
              <span class="data text-xs text-muted">action {{ line.action }}</span>
            </template>
            <span v-else class="data text-muted">action {{ line.action }}</span>
          </li>
        </ul>
      </li>
    </ol>
    <p v-if="!verbs.length" class="text-muted">No verb has a word containing “{{ filter }}”.</p>
    <UButton v-if="list.remaining.value" color="neutral" variant="outline" class="w-fit" @click="list.more">Show more ({{ list.remaining.value }} left)</UButton>
  </div>
  <NotFound v-else what="Inform grammar table" />
</template>
