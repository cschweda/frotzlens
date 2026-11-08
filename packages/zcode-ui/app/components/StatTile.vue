<script setup lang="ts">
defineProps<{ value: string | number; label: string; to?: string }>()
</script>

<template>
  <component
    :is="to ? 'a' : 'div'"
    :href="to"
    class="flex flex-col gap-1 rounded-xl border border-default bg-muted px-5 py-4 transition-colors"
    :class="to ? 'hover:border-[var(--frotz-lamp)]' : ''"
  >
    <span class="data text-3xl font-semibold text-highlighted sm:text-4xl">{{ value }}</span>
    <span class="text-sm text-muted">{{ label }}</span>
  </component>
</template>
