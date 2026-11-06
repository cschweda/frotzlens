<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatStrings } from '@frotzinc/zcode/format'

/** The strings after the code, searchable, each with what refers to it. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

const address = computed(() => (props.id && /^[0-9a-f]+$/i.test(props.id) ? parseInt(props.id, 16) : undefined))
const string = computed(() => (address.value === undefined ? undefined : props.story.strings.find(s => s.address === address.value)))

const filter = ref('')
const rows = computed(() => {
  const s = props.story
  const q = filter.value.trim().toLowerCase()
  return s.strings
    .map(x => ({ x, name: stringName(s, x.address), refs: s.xrefs[x.id]?.from.length ?? 0 }))
    .filter(r => !q || r.x.text.toLowerCase().includes(q) || r.name.toLowerCase() === q || hex(r.x.address).includes(q))
})
const list = useLimit(() => rows.value)
watch(filter, () => list.reset())
</script>

<template>
  <div v-if="id === undefined" class="flex flex-col gap-6">
    <ViewHeader title="Strings" :eyebrow="fileName" :copy="() => formatStrings(story)" copy-label="Copy the strings (txd)">
      The text stored after the code, in address order, numbered as txd numbers it. Text printed inline
      by an instruction is in its routine instead.
    </ViewHeader>
    <UInput v-model="filter" icon="i-lucide-search" placeholder="Search the text, or an address" aria-label="Search strings" class="max-w-md" />
    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="w-full text-sm">
        <caption class="sr-only">Strings</caption>
        <thead class="bg-muted text-left text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-semibold">String</th>
            <th scope="col" class="px-4 py-2 font-semibold">Address</th>
            <th scope="col" class="px-4 py-2 font-semibold">Text</th>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Referred to</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in list.shown.value" :key="r.x.address" class="border-t border-default align-top">
            <td class="data px-4 py-1.5"><a :href="`#string/${hex(r.x.address)}`" class="text-lamp hover:underline">{{ r.name }}</a></td>
            <td class="data px-4 py-1.5 text-muted">{{ hex(r.x.address) }}</td>
            <td class="px-4 py-1.5">{{ clip(r.x.text, 120) }}</td>
            <td class="data px-4 py-1.5 text-right">{{ r.refs }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="text-muted">No string contains “{{ filter }}”.</p>
    <UButton v-if="list.remaining.value" color="neutral" variant="outline" class="w-fit" @click="list.more">Show more ({{ list.remaining.value }} left)</UButton>
  </div>

  <div v-else-if="string" class="flex flex-col gap-6">
    <ViewHeader
      :title="`String ${stringName(story, string.address)}`"
      :eyebrow="`${hex(string.address)} · ${string.length} bytes`"
      :back="{ to: '#strings', label: 'All strings' }"
      :copy="() => string!.text"
      copy-label="Copy the text"
    />
    <p class="whitespace-pre-wrap rounded-xl border border-default bg-muted p-5 text-lg">{{ string.text }}</p>
    <Referrers :story="story" :id="string.id" />
  </div>

  <NotFound v-else :what="`string at ${id}`" back="#strings" back-label="All strings" />
</template>
