<script setup lang="ts">
/** A view's title, what it shows, a way back up (for detail views), and "Copy as text". */
defineProps<{ title: string; eyebrow?: string; back?: { to: string; label: string }; copy?: () => string; copyLabel?: string }>()
</script>

<template>
  <header class="flex flex-col gap-3">
    <a v-if="back" :href="back.to" class="w-fit text-sm text-muted hover:underline">← {{ back.label }}</a>
    <p v-if="eyebrow" class="data text-sm text-lamp">{{ eyebrow }}</p>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="font-display text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">{{ title }}</h1>
      <CopyText v-if="copy" :text="copy" :label="copyLabel" />
    </div>
    <p v-if="$slots.default" class="max-w-3xl text-muted"><slot /></p>
  </header>
</template>
