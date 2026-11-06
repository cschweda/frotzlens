<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

const props = defineProps<{ story: StoryFile; fileName: string }>()

/** What the file says about itself — and only that: nothing here is guessed. */
const facts = computed(() => {
  const { header: h, grammar } = props.story
  const rows: [string, string][] = [
    ['Z-machine version', String(h.version)],
    ['Release / serial', `${h.release} / ${h.serial}`],
    ['Compiler', h.inform ? `Inform ${h.inform.compilerVersion}` : 'Not recorded'],
  ]
  if (grammar) {
    rows.push(['Grammar', `Inform grammar version ${grammar.version}${grammar.version === 3 ? ' (as PunyInform writes it)' : ''}`])
  }
  rows.push(['Checksum', h.checksumOk ? `${h.checksum.toString(16).padStart(4, '0')}, correct` : `${h.checksum.toString(16).padStart(4, '0')}, does not match`])
  rows.push(['Debug symbols', 'Not loaded'])
  return rows
})
</script>

<template>
  <section aria-labelledby="facts-title" class="flex flex-col gap-4">
    <h2 id="facts-title" class="font-display text-2xl font-semibold text-highlighted sm:text-[1.6rem]">What is this file</h2>
    <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
      <template v-for="[k, v] in facts" :key="k">
        <dt class="text-muted">{{ k }}</dt>
        <dd class="text-default">{{ v }}</dd>
      </template>
    </dl>
  </section>
</template>
