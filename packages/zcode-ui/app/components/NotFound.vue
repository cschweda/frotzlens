<script setup lang="ts">
defineProps<{ what: string; back?: string; backLabel?: string }>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <a :href="back ?? '#overview'" class="w-fit text-sm text-muted hover:underline">← {{ backLabel ?? 'Overview' }}</a>
    <h1 class="font-display text-3xl font-bold text-highlighted">Nothing here</h1>
    <p class="max-w-2xl text-muted">There's no {{ what }} in this file. ⌘K / Ctrl+K finds any routine, object, string or dictionary word by name or address.</p>
  </div>
</template>
