<script setup lang="ts">
/**
 * The debugger's controls (design §6.1, §6.4): a toolbar (one tab stop, arrow keys between buttons),
 * each with its key. F5 run, F6 pause, F10 step over, F11 step into, Shift+F11 step out,
 * Shift+F10 step back.
 */
const session = useSession()
const s = session.state
const buttons = computed(() => [
  { key: 'run', label: 'Run', hint: 'F5', icon: 'i-lucide-play', act: session.run, off: s.running },
  { key: 'pause', label: 'Pause', hint: 'F6', icon: 'i-lucide-pause', act: session.pause, off: !s.running },
  { key: 'into', label: 'Step into', hint: 'F11', icon: 'i-lucide-arrow-down-to-dot', act: session.stepInto, off: s.running },
  { key: 'over', label: 'Step over', hint: 'F10', icon: 'i-lucide-redo-dot', act: session.stepOver, off: s.running },
  { key: 'out', label: 'Step out', hint: 'Shift+F11', icon: 'i-lucide-arrow-up-from-dot', act: session.stepOut, off: s.running },
  { key: 'back', label: 'Step back', hint: 'Shift+F10', icon: 'i-lucide-undo-dot', act: session.stepBack, off: s.running },
])
const active = ref(0)
const bar = useTemplateRef<HTMLElement>('bar')
function onArrow(e: KeyboardEvent) {
  const n = buttons.value.length
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowRight' ? 1 : n - 1)) % n
    nextTick(() => bar.value?.querySelectorAll<HTMLElement>('button')[active.value]?.focus())
  }
}
function onKey(e: KeyboardEvent) {
  if (!s.open) return
  const map: Record<string, () => void> = { F5: session.run, F6: session.pause, F10: e.shiftKey ? session.stepBack : session.stepOver, F11: e.shiftKey ? session.stepOut : session.stepInto }
  const act = map[e.key]
  if (act) {
    e.preventDefault()
    act()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div ref="bar" role="toolbar" aria-label="Debugger" class="flex flex-wrap items-center gap-1" @keydown="onArrow">
    <UButton
      v-for="(b, i) in buttons"
      :key="b.key"
      color="neutral"
      variant="outline"
      size="sm"
      :icon="b.icon"
      :disabled="b.off"
      :tabindex="i === active ? 0 : -1"
      :aria-keyshortcuts="b.hint"
      :title="`${b.label} (${b.hint})`"
      @click="b.act()"
      @focus="active = i"
    >
      <span class="hidden xl:inline">{{ b.label }}</span><span class="sr-only xl:hidden">{{ b.label }}</span>
    </UButton>
  </div>
</template>
