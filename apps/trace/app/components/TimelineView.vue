<script setup lang="ts">
/**
 * The timeline (design §6.3, docs/19): every turn so far, with what was typed, to go back to; and
 * a scrubber over every instruction to the furthest point reached. Going forward again replays what
 * happened; typing something new in the past starts a new timeline.
 */
const session = useSession()
const live = computed(() => session.live())
const t = computed(() => live.value?.timeline)
const scrub = ref(0)
watch(() => t.value?.current, c => (scrub.value = c ?? 0), { immediate: true })
function go() {
  session.goToInstruction(Number(scrub.value))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Timeline">Time runs both ways: go back to any turn or instruction, and look. Going forward replays what happened; typing something new there starts a new timeline.</ViewHeader>
    <div v-if="t" class="flex flex-col gap-2">
      <label for="scrubber" class="text-sm">Instruction <span class="data">{{ Number(scrub).toLocaleString('en-US') }}</span> of <span class="data">{{ t.head.toLocaleString('en-US') }}</span></label>
      <input id="scrubber" v-model="scrub" type="range" min="0" :max="t.head" step="1" class="w-full accent-[var(--frotz-lamp)]" @change="go">
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-undo-dot" @click="session.stepBack()">Step back</UButton>
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-skip-forward" :disabled="t.current === t.head" @click="session.goToInstruction(t.head)">To the furthest point</UButton>
      </div>
    </div>
    <ol v-if="t" class="flex flex-col gap-1">
      <li v-for="turn in t.turns" :key="turn.instruction" class="flex flex-wrap items-center gap-3 rounded-lg border border-default px-3 py-2" :class="t.current >= turn.instruction && (t.turns[turn.turn + 1]?.instruction ?? Infinity) > t.current ? 'border-[var(--frotz-lamp)]' : ''">
        <span class="data w-16 text-muted">turn {{ turn.turn }}</span>
        <span class="data flex-1">{{ turn.line !== undefined ? `> ${turn.line}` : '(waiting for a command)' }}</span>
        <span class="data text-xs text-muted">{{ turn.instruction.toLocaleString('en-US') }}</span>
        <UButton color="neutral" variant="ghost" size="sm" @click="session.goToTurn(turn.turn)">Go here<span class="sr-only"> (turn {{ turn.turn }})</span></UButton>
      </li>
    </ol>
  </div>
</template>
