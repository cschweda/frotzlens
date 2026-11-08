<script setup lang="ts">
/**
 * Breakpoints (design §6.3): the list with hit counts, on or off, removed; added as text, as the CLI
 * takes them (action:Take, line:story.inf:42, text:"Taken.", a routine, 0x27f8), with a condition.
 */
const session = useSession()
const live = computed(() => session.live())
const what = ref('')
const condition = ref('')
const problem = ref('')
function add() {
  problem.value = session.addBreakpoint(what.value, condition.value) ?? ''
  if (!problem.value) {
    what.value = ''
    condition.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Breakpoints">Where the machine stops. Run (F5) goes on to the next.</ViewHeader>
    <form class="flex flex-col gap-3 rounded-xl border border-default p-4" @submit.prevent="add">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Stop at" name="what" help="action:Take · line:story.inf:42 · text:Taken. · a routine · 0x27f8">
          <UInput v-model="what" class="data w-full" placeholder="action:Take" />
        </UFormField>
        <UFormField label="Only when (optional)" name="condition" help="noun == lantern · score > 10 && lantern has light">
          <UInput v-model="condition" class="data w-full" />
        </UFormField>
      </div>
      <div><UButton type="submit" icon="i-lucide-plus" :disabled="!what.trim()">Add breakpoint</UButton></div>
      <p v-if="problem" role="alert" class="text-sm text-error">{{ problem }}</p>
    </form>
    <p v-if="!live?.breakpoints.length" class="text-muted">No breakpoints yet. Add one above, or press a line's gutter in Code.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="b in live.breakpoints" :key="b.id" class="flex flex-wrap items-center gap-3 rounded-xl border border-default bg-muted px-4 py-2">
        <UCheckbox :model-value="b.enabled" :label="session.describe(b)" @update:model-value="v => session.setBreakpointEnabled(b.id, !!v)" />
        <span v-if="b.condition" class="data text-sm text-muted">if {{ b.condition }}</span>
        <span class="data ml-auto text-sm">{{ b.hits }} {{ b.hits === 1 ? 'hit' : 'hits' }}</span>
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="`Remove the breakpoint ${session.describe(b)}`" @click="session.removeBreakpoint(b.id)" />
        <p v-if="b.error || b.conditionError" class="basis-full text-sm text-error">{{ b.error ?? `The condition couldn't be evaluated: ${b.conditionError}` }}</p>
      </li>
    </ul>
  </div>
</template>
