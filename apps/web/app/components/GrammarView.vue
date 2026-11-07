<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatGrammar, grammarLineText, zilLineText, zilVerbWord } from '@frotzinc/zcode/format'

/**
 * The grammar: each verb, its words, its lines in the order they're tried, and each line's action
 * routine. Inform's grammar table, or ZIL's syntax tables (ZILF's, or Infocom's), shown the same way.
 */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

interface Line { key: number; text: string; reverse?: boolean; action: number; routine?: number; preaction?: number }
interface Verb { number: number; words: string[]; lines: Line[] }

const verbsAll = computed<Verb[]>(() => {
  const s = props.story
  if (s.grammar) {
    const g = s.grammar
    return g.verbs.map(v => ({
      number: v.number,
      words: v.words,
      lines: v.lines.map(l => ({ key: l.address, text: grammarLineText(s, v.words[0] ?? '', l), reverse: l.reverse, action: l.action, routine: g.actions[l.action] })),
    }))
  }
  const z = s.zilGrammar
  if (!z) return []
  return z.verbs.map(v => ({
    number: v.number,
    words: v.words,
    lines: v.lines.map(l => ({
      key: l.address,
      text: zilLineText(z, zilVerbWord(v), l),
      action: l.action,
      routine: z.actions[l.action],
      ...(z.preactions[l.action] ? { preaction: z.preactions[l.action] } : {}),
    })),
  }))
})
const kind = computed(() => (props.story.grammar ? 'inform' : props.story.zilGrammar ? 'zil' : undefined))

const dictByWord = computed(() => new Map(props.story.dictionary.entries.map(e => [e.word, e])))

const filter = ref('')
const verbs = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return verbsAll.value.map((v, i) => ({ v, i })).filter(x => !q || x.v.words.some(w => w.toLowerCase().includes(q)))
})
const list = useLimit(() => verbs.value, 60)
watch(filter, () => list.reset())

/** "action 12", or with a debug file "##Take (12)". */
const actionLabel = (action: number) => (actionName(action) ? `##${actionName(action)} (${action})` : `action ${action}`)
const VERSIONS: Record<number, string> = { 1: 'version 1 (old Inform)', 2: 'version 2 (the Standard Library)', 3: 'version 3 (PunyInform)' }

// #grammar/12: show (and focus) verb 12, even when it's past the first page.
const selected = computed(() => (props.id && /^\d+$/.test(props.id) ? Number(props.id) : undefined))
watch(selected, async (i) => {
  if (i === undefined) return
  filter.value = ''
  await nextTick() // the filter's watcher resets the list; page out to the verb after that
  while (list.shown.value.length <= i && list.remaining.value) list.more()
  await nextTick()
  const el = document.getElementById(`verb-${i}`)
  el?.scrollIntoView({ block: 'start' })
  el?.focus()
}, { immediate: true })
</script>

<template>
  <div v-if="kind" class="flex flex-col gap-6">
    <ViewHeader title="Grammar" :eyebrow="fileName" :copy="() => formatGrammar(story, { fileName })" :copy-label="kind === 'inform' ? 'Copy the grammar (infodump)' : 'Copy the syntax tables'">
      How the parser reads a command: each verb's words, then its grammar lines in the order they're tried,
      each ending in the action routine that carries it out.
      <template v-if="kind === 'inform'"> Inform grammar {{ VERSIONS[story.grammar!.version] }}.</template>
      <template v-else>
        ZIL syntax tables, as {{ story.fingerprint?.compiler === 'zilf' ? 'ZILF' : 'Infocom’s compiler' }} writes them: each line as its
        <code class="data">SYNTAX</code> form reads, with FIND flags as attribute numbers and search options named by
        {{ story.fingerprint?.compiler === 'zilf' ? 'zillib' : 'Infocom’s parser' }}.
      </template>
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Find a verb" aria-label="Find a verb" class="max-w-md" />
    <ol class="flex flex-col gap-4">
      <li v-for="x in list.shown.value" :id="`verb-${x.i}`" :key="x.i" tabindex="-1" class="rounded-xl border border-default p-4" :class="selected === x.i ? 'border-[var(--frotz-lamp-text)]' : ''">
        <h2 class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="data text-sm text-muted">verb {{ x.v.number }}</span>
          <span class="flex flex-wrap gap-x-2 text-lg font-semibold">
            <template v-for="(w, k) in x.v.words" :key="w">
              <span v-if="k" class="text-muted" aria-hidden="true">/</span>
              <a v-if="dictByWord.get(w)" :href="`#dict/${hex(dictByWord.get(w)!.address)}`" class="data text-lamp hover:underline">{{ w }}</a>
              <span v-else class="data">{{ w }}</span>
            </template>
            <span v-if="!x.v.words.length" class="data text-muted">(no word)</span>
          </span>
        </h2>
        <ul class="mt-3 flex flex-col gap-1.5 text-sm">
          <li v-for="line in x.v.lines" :key="line.key" class="flex flex-wrap items-baseline gap-x-3">
            <span class="data">{{ line.text }}</span>
            <span v-if="line.reverse" class="text-xs text-muted">(reversed)</span>
            <span class="text-muted" aria-hidden="true">→</span>
            <span class="sr-only">action</span>
            <template v-if="line.routine !== undefined">
              <RefLink :story="story" :id="`routine:${hex(line.routine)}`" />
              <span class="data text-xs text-muted">{{ actionLabel(line.action) }}</span>
            </template>
            <span v-else class="data text-muted">{{ actionLabel(line.action) }}</span>
            <template v-if="line.preaction !== undefined">
              <span class="text-xs text-muted">pre-action</span>
              <RefLink :story="story" :id="`routine:${hex(line.preaction)}`" />
            </template>
          </li>
        </ul>
      </li>
    </ol>
    <p v-if="!verbs.length" class="text-muted">No verb has a word containing “{{ filter }}”.</p>
    <UButton v-if="list.remaining.value" color="neutral" variant="outline" class="w-fit" @click="list.more">Show more ({{ list.remaining.value }} left)</UButton>
  </div>
  <NotFound v-else what="grammar table" />
</template>
