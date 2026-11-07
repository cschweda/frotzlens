<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatDictionary } from '@frotzinc/zcode/format'

/** The dictionary: every word, its flags (Inform's), its bytes, its grammar and what refers to it. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

const address = computed(() => (props.id && /^[0-9a-f]+$/i.test(props.id) ? parseInt(props.id, 16) : undefined))
const word = computed(() => (address.value === undefined ? undefined : props.story.dictionary.entries.find(e => e.address === address.value)))

type Entry = StoryFile['dictionary']['entries'][number]
const flags = (e: Entry) => (e.inform ? Object.entries(e.inform).filter(([, on]) => on).map(([k]) => k) : [])

/** The verbs (by index in the grammar) whose words include this one. */
const verbs = computed(() => {
  const g = props.story.grammar ?? props.story.zilGrammar
  const w = word.value
  if (!g || !w) return []
  return g.verbs.map((v, i) => ({ v, i })).filter(x => x.v.words.includes(w.word))
})

const filter = ref('')
const rows = computed(() => {
  const s = props.story
  const q = filter.value.trim().toLowerCase()
  return s.dictionary.entries
    .map(e => ({ e, refs: s.xrefs[e.id]?.from.length ?? 0 }))
    .filter(r => !q || r.e.word.toLowerCase().includes(q) || hex(r.e.address) === q)
})
const list = useLimit(() => rows.value)
watch(filter, () => list.reset())
const sep = computed(() => props.story.dictionary.separators.map(c => (c === ' ' ? 'space' : c)).join('  '))
</script>

<template>
  <div v-if="id === undefined" class="flex flex-col gap-6">
    <ViewHeader title="Dictionary" :eyebrow="fileName" :copy="() => formatDictionary(story, { fileName })" copy-label="Copy the dictionary (infodump)">
      The words the parser knows, in stored order: {{ story.dictionary.entries.length }} entries of
      {{ story.dictionary.entryLength }} bytes at {{ hex(story.dictionary.address) }}.
      <template v-if="sep">Word separators: <span class="data">{{ sep }}</span>.</template>
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Find a word" aria-label="Find a dictionary word" class="max-w-md" />
    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="w-full text-sm">
        <caption class="sr-only">Dictionary words</caption>
        <thead class="bg-muted text-left text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 text-right font-semibold">#</th>
            <th scope="col" class="px-4 py-2 font-semibold">Word</th>
            <th scope="col" class="px-4 py-2 font-semibold">Address</th>
            <th scope="col" class="px-4 py-2 font-semibold">Flags</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Referred to</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in list.shown.value" :key="r.e.address" class="border-t border-default">
            <td class="data px-4 py-1.5 text-right text-muted">{{ r.e.index }}</td>
            <td class="data px-4 py-1.5"><a :href="`#dict/${hex(r.e.address)}`" class="text-lamp hover:underline">{{ r.e.word }}</a></td>
            <td class="data px-4 py-1.5 text-muted">{{ hex(r.e.address) }}</td>
            <td class="px-4 py-1.5">{{ flags(r.e).join(', ') }}</td>
            <td class="data px-4 py-1.5 text-right">{{ r.refs }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="text-muted">{{ filter.trim() ? `No word contains “${filter}”.` : 'The dictionary is empty.' }}</p>
    <UButton v-if="list.remaining.value" color="neutral" variant="outline" class="w-fit" @click="list.more">Show more ({{ list.remaining.value }} left)</UButton>
  </div>

  <div v-else-if="word" class="flex flex-col gap-6">
    <ViewHeader :title="`“${word.word}”`" :eyebrow="`Entry ${word.index} · ${hex(word.address)}`" :back="{ to: '#dictionary', label: 'Dictionary' }" />
    <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
      <dt class="text-muted">Flags</dt>
      <dd>{{ word.inform ? flags(word).join(', ') || 'none' : 'not an Inform dictionary' }}</dd>
      <dt class="text-muted">Data bytes</dt>
      <dd class="data">{{ word.data.map(b => hex(b, 2)).join(' ') || '—' }}</dd>
      <template v-if="verbs.length">
        <dt class="text-muted">Grammar</dt>
        <dd class="flex flex-wrap gap-x-3">
          <a v-for="x in verbs" :key="x.i" :href="`#grammar/${x.i}`" class="text-lamp hover:underline">verb {{ x.v.number }}: {{ x.v.words.join(' / ') }}</a>
        </dd>
      </template>
    </dl>
    <Referrers :story="story" :id="word.id" />
  </div>

  <NotFound v-else :what="`dictionary word at ${id}`" back="#dictionary" back-label="Dictionary" />
</template>
