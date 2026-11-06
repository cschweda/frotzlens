<script setup lang="ts">
import { site } from '~~/site.config'

defineProps<{ loaded: boolean; fileName: string }>()
const emit = defineEmits<{ search: []; close: [] }>()
const shortcut = ref('Ctrl+K')
onMounted(() => (shortcut.value = modShortcutLabel('k')))
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
      <a href="#overview" class="flex items-center gap-3" :aria-label="`${site.name} — home`">
        <img src="/favicon.svg" alt="" width="36" height="36" class="size-9">
        <span class="font-display text-xl font-bold text-highlighted">{{ site.name }}</span>
      </a>
      <span v-if="loaded" class="data hidden truncate text-sm text-muted sm:inline">/ {{ fileName }}</span>
      <div class="ml-auto flex items-center gap-2">
        <UButton v-if="loaded" color="neutral" variant="outline" icon="i-lucide-search" :aria-label="`Go to… ${shortcut}`" @click="emit('search')">
          <span class="hidden sm:inline">Go to…</span>
          <UKbd class="hidden sm:inline-flex">{{ shortcut }}</UKbd>
        </UButton>
        <UButton v-if="loaded" color="neutral" variant="ghost" icon="i-lucide-file-plus" aria-label="Open another file" @click="emit('close')" />
        <UColorModeButton />
      </div>
    </div>
  </header>
</template>
