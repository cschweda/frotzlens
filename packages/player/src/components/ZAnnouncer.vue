<script setup lang="ts">
/**
 * What the screen reader hears (statements O2, O4): two visually hidden live regions. The log gets
 * one appended block per turn; the status region is replaced only when the status line changes.
 * Only the last few log entries are kept in the page; additions are what's announced.
 */
import { nextTick, ref } from 'vue'

const log = ref<{ id: number; text: string }[]>([])
const status = ref('')
let n = 0

function announce(text: string) {
  if (!text.trim()) return
  log.value.push({ id: ++n, text })
  if (log.value.length > 5) log.value.splice(0, log.value.length - 5)
}

/** Say the status; `force` says it even when unchanged (the "repeat" shortcut). */
async function announceStatus(text: string, force = false) {
  if (!force && text === status.value) return
  status.value = ''
  await nextTick()
  status.value = text
}

defineExpose({ announce, announceStatus })
</script>

<template>
  <div class="zp-sr" role="log" aria-live="polite" aria-relevant="additions" aria-label="Story announcements" data-testid="announcer">
    <p v-for="m in log" :key="m.id">{{ m.text }}</p>
  </div>
  <div class="zp-sr" aria-live="polite" aria-atomic="true" data-testid="status-announcer">{{ status }}</div>
</template>
