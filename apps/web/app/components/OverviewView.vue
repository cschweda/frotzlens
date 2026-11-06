<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { formatHeader } from '@frotzinc/zcode/format'

const props = defineProps<{ story: StoryFile; fileName: string }>()
const kb = (n: number) => (n >= 10240 ? `${Math.round(n / 1024)} KB` : `${(n / 1024).toFixed(1)} KB`)
const errors = computed(() => props.story.errors)
</script>

<template>
  <div class="flex flex-col gap-10">
    <header class="flex flex-col gap-2">
      <p class="data text-sm text-lamp">{{ fileName }}</p>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <h1 class="font-display text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">Overview</h1>
        <CopyText :text="() => formatHeader(story, { fileName })" label="Copy the header (infodump)" />
      </div>
    </header>

    <section v-if="errors.length" aria-labelledby="errors-title" class="flex flex-col gap-2 rounded-xl border border-[var(--ui-error)] p-5" role="alert">
      <h2 id="errors-title" class="font-semibold text-error">
        {{ errors.length === 1 ? 'One problem' : `${errors.length} problems` }} reading this file
      </h2>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="(e, i) in errors" :key="i">
          <span class="font-semibold">{{ e.severity === 'error' ? 'Error' : 'Warning' }}:</span> {{ e.message }}
        </li>
      </ul>
    </section>

    <section aria-label="At a glance" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile :value="story.objects.objects.length" label="Objects" to="#objects" />
      <StatTile :value="story.code.routines.length" label="Routines" to="#routines" />
      <StatTile :value="story.strings.length" label="Strings" to="#strings" />
      <StatTile :value="story.dictionary.entries.length" label="Dictionary words" to="#dictionary" />
      <StatTile :value="kb(story.memory.size)" label="File size" />
      <StatTile :value="`v${story.header.version}`" label="Z-machine version" />
    </section>

    <MemoryMap :story="story" />
    <StoryFacts :story="story" :file-name="fileName" />
  </div>
</template>
