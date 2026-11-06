<script setup lang="ts">
/** "Copy as text": the view's section in Ztools' format, made only when asked for. */
const props = defineProps<{ text: () => string; label?: string }>()
const status = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text())
    status.value = 'Copied'
  } catch {
    status.value = "Couldn't copy: the browser didn't allow it"
  }
  clearTimeout(timer)
  timer = setTimeout(() => (status.value = ''), 2500)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <UButton color="neutral" variant="outline" icon="i-lucide-copy" @click="copy">{{ label ?? 'Copy as text' }}</UButton>
    <span role="status" aria-live="polite" class="text-sm text-muted">{{ status }}</span>
  </div>
</template>
