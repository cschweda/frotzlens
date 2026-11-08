<script setup lang="ts">
/**
 * frotzlens's own buttons in the family header (AppHeader's #actions slot, from @frotzinc/nuxt-base):
 * Go to… (the search palette), Names (with a debug file), Debug (in frotztrace) and Open another file.
 * Only with a story open.
 */
defineProps<{ loaded: boolean }>()
const emit = defineEmits<{ search: []; close: [] }>()
const { symbols, names, symbolsText } = useSymbols()
const { story, fileName } = useStory()
/** Debug this story: open it in frotztrace, with its debug file if one is loaded (frotztrace Phase 5). */
function debug() {
  if (story.value) debugInFrotztrace(fileName.value, story.value.bytes, symbols.value ? symbolsText.value : undefined)
}
const shortcut = ref('Ctrl+K')
onMounted(() => (shortcut.value = modShortcutLabel('k')))
</script>

<template>
  <template v-if="loaded">
    <UButton color="neutral" variant="outline" icon="i-lucide-search" :aria-label="`Go to… ${shortcut}`" @click="emit('search')">
      <span class="hidden sm:inline">Go to…</span>
      <UKbd class="hidden sm:inline-flex">{{ shortcut }}</UKbd>
    </UButton>
    <!-- With a debug file: names from the source, or the numbers txd shows. A toggle button. -->
    <UButton
      v-if="symbols"
      color="neutral"
      :variant="names ? 'soft' : 'outline'"
      icon="i-lucide-tag"
      aria-label="Names"
      :aria-pressed="names"
      :title="names ? 'Showing names from the debug file' : 'Showing numbers, as txd does'"
      @click="names = !names"
    >
      <span class="hidden sm:inline">Names</span>
    </UButton>
    <UButton color="neutral" variant="outline" icon="i-lucide-bug-play" title="Run it under frotztrace, the debugger, in a new tab" @click="debug">
      <span class="hidden sm:inline">Debug</span><span class="sr-only sm:hidden">Debug this story in frotztrace</span>
    </UButton>
    <UButton color="neutral" variant="ghost" icon="i-lucide-file-plus" aria-label="Open another file" @click="emit('close')" />
  </template>
</template>
