<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** Both directions of the cross-reference index for one Id: what refers to it, and what it refers to. */
const props = defineProps<{ story: StoryFile; id: string; fromTitle?: string; toTitle?: string }>()
const entry = computed(() => props.story.xrefs[props.id])
const from = useLimit(() => entry.value?.from ?? [], 100)
const to = useLimit(() => entry.value?.to ?? [], 100)
watch(() => props.id, () => {
  from.reset()
  to.reset()
})
</script>

<template>
  <div class="grid gap-6 md:grid-cols-2">
    <section :aria-label="fromTitle ?? 'Referred to from'" class="flex flex-col gap-2">
      <h2 class="font-display text-xl font-semibold text-highlighted">
        {{ fromTitle ?? 'Referred to from' }} <span class="data text-base text-muted">{{ entry?.from.length ?? 0 }}</span>
      </h2>
      <p v-if="!entry?.from.length" class="text-sm text-muted">Nothing in the file refers to this.</p>
      <ul v-else class="flex flex-col gap-1 text-sm">
        <li v-for="(s, i) in from.shown.value" :key="i" class="flex gap-2">
          <RefLink :story="story" :id="s.id" />
          <span class="data text-muted">at {{ hex(s.address) }}</span>
        </li>
      </ul>
      <UButton v-if="from.remaining.value" color="neutral" variant="link" class="w-fit px-0" @click="from.more">
        Show more ({{ from.remaining.value }} left)
      </UButton>
    </section>
    <section :aria-label="toTitle ?? 'Refers to'" class="flex flex-col gap-2">
      <h2 class="font-display text-xl font-semibold text-highlighted">
        {{ toTitle ?? 'Refers to' }} <span class="data text-base text-muted">{{ entry?.to.length ?? 0 }}</span>
      </h2>
      <p v-if="!entry?.to.length" class="text-sm text-muted">This refers to nothing the index tracks.</p>
      <ul v-else class="flex flex-col gap-1 text-sm">
        <li v-for="t in to.shown.value" :key="t"><RefLink :story="story" :id="t" /></li>
      </ul>
      <UButton v-if="to.remaining.value" color="neutral" variant="link" class="w-fit px-0" @click="to.more">
        Show more ({{ to.remaining.value }} left)
      </UButton>
    </section>
  </div>
</template>
