<script setup lang="ts">
/** Watches (design §6.3): expressions re-evaluated at every stop; what changed since the last one is marked. */
const session = useSession()
const live = computed(() => session.live())
const expression = ref('')
const problem = ref('')
function add() {
  problem.value = session.addWatch(expression.value) ?? ''
  if (!problem.value) expression.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Watches">Expressions, re-evaluated at every stop: <span class="data">score</span>, <span class="data">lantern in player</span>, <span class="data">location == Cellar</span>, <span class="data">lantern has light</span>.</ViewHeader>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="add">
      <UFormField label="Watch" name="watch" class="min-w-64 flex-1"><UInput v-model="expression" class="data w-full" placeholder="lantern in player" /></UFormField>
      <UButton type="submit" icon="i-lucide-eye" :disabled="!expression.trim()">Add watch</UButton>
    </form>
    <p v-if="problem" role="alert" class="text-sm text-error">{{ problem }}</p>
    <p v-if="!live?.watches.length" class="text-muted">No watches yet.</p>
    <table v-else class="w-full text-sm">
      <caption class="sr-only">Watches</caption>
      <thead class="text-left text-muted"><tr><th scope="col" class="py-1">Expression</th><th scope="col" class="py-1">Value</th><th scope="col" class="py-1"><span class="sr-only">Remove</span></th></tr></thead>
      <tbody>
        <tr v-for="w in live.watches" :key="w.id" class="border-t border-default" :class="w.changed ? 'bg-elevated' : ''">
          <td class="data py-1.5">{{ w.expression }}</td>
          <td class="data py-1.5" :class="w.changed ? 'font-semibold text-lamp' : ''">
            <template v-if="w.value !== undefined">{{ w.value }}</template><span v-else class="font-sans text-error">{{ w.error }}</span>
            <span v-if="w.changed" class="ml-2 rounded-full border border-default px-1.5 font-sans text-xs text-lamp">changed</span>
          </td>
          <td class="py-1.5 text-right"><UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="`Remove the watch ${w.expression}`" @click="session.removeWatch(w.id)" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
