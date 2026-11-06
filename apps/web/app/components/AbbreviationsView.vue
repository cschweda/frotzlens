<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatAbbreviations } from '@frotzinc/zcode/format'

/** The abbreviation table: the 96 pieces of text the compiler stores once and the story's text points to. */
const props = defineProps<{ story: StoryFile; fileName: string }>()
const used = computed(() => props.story.abbreviations.filter(a => a.text.length).length)
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Abbreviations" :eyebrow="fileName" :copy="() => formatAbbreviations(story, { fileName })" copy-label="Copy the abbreviations (infodump)">
      Text the compiler stores once, so the story’s strings can point to it instead of spelling it out.
      Inform only fills the table when asked to (economy mode, <code class="data">-e</code>); here
      {{ used }} of {{ story.abbreviations.length }} entries hold text.
    </ViewHeader>
    <p v-if="!story.abbreviations.length" class="text-muted">This file has no abbreviation table.</p>
    <div v-else class="overflow-x-auto rounded-xl border border-default">
      <table class="w-full text-sm">
        <caption class="sr-only">Abbreviations</caption>
        <thead class="bg-muted text-left text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 text-right font-semibold">Number</th>
            <th scope="col" class="px-4 py-2 font-semibold">Address</th>
            <th scope="col" class="px-4 py-2 font-semibold">Text</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, i) in story.abbreviations" :key="i" class="border-t border-default">
            <td class="data px-4 py-1.5 text-right">{{ i }}</td>
            <td class="data px-4 py-1.5 text-muted">{{ hex(a.address) }}</td>
            <td class="data px-4 py-1.5 whitespace-pre">“{{ a.text }}”</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
