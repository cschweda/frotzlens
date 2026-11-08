<script setup lang="ts">
import type { TraceKind } from '@frotzinc/zmachine'

/** The trace (design §6.3): calls and returns as they happened, by depth; writes and prints when asked. Newest last. */
const session = useSession()
const live = computed(() => session.live())
const choice = ref<'calls' | 'writes' | 'prints' | 'all'>('calls')
const KINDS: Record<string, TraceKind[]> = { calls: ['call', 'return'], writes: ['write'], prints: ['print'], all: ['call', 'return', 'write', 'print', 'input'] }
watch(choice, c => {
  const d = live.value?.debugger
  if (d) d.trace.kinds = new Set(KINDS[c])
}, { immediate: true })
const rows = computed(() => {
  const l = live.value
  if (!l) return []
  return l.debugger.trace.events().filter(e => KINDS[choice.value]!.includes(e.kind)).slice(-400).map(e => {
    switch (e.kind) {
      case 'call': return { at: e.at, depth: e.depth, text: `→ ${l.name(e.routine)}(${e.args.join(', ')})` }
      case 'return': return { at: e.at, depth: e.depth, text: `← ${e.routine !== undefined ? `${l.name(e.routine)} ` : ''}${e.value}` }
      case 'write': return { at: e.at, depth: 0, text: `write ${hex(e.address)} = ${e.value}` }
      case 'print': return { at: e.at, depth: 0, text: `print ${JSON.stringify(e.text)}` }
      case 'input': return { at: e.at, depth: 0, text: `input ${JSON.stringify(e.value)}` }
      default: return { at: e.at, depth: 0, text: e.kind }
    }
  })
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Trace" :copy="() => rows.map(r => `${r.at}\t${'  '.repeat(r.depth)}${r.text}`).join('\n') + '\n'" copy-label="Copy the trace">
      What the story did, newest last: the last 400 of the kind chosen. A kind is recorded from when it's chosen.
    </ViewHeader>
    <fieldset class="flex flex-wrap gap-4 text-sm">
      <legend class="sr-only">Show</legend>
      <label v-for="k in ['calls', 'writes', 'prints', 'all']" :key="k" class="flex items-center gap-1.5"><input v-model="choice" type="radio" name="trace-kind" :value="k"> {{ k }}</label>
    </fieldset>
    <p v-if="!rows.length" class="text-muted">Nothing yet: run or step, and it's recorded here.</p>
    <ol v-else tabindex="0" aria-label="Trace events" class="data max-h-[60vh] overflow-y-auto rounded-xl border border-default bg-muted p-3 text-sm leading-6">
      <li v-for="(r, i) in rows" :key="i" class="whitespace-pre"><span class="text-muted">{{ String(r.at).padStart(8) }}  </span>{{ '  '.repeat(Math.min(r.depth, 20)) }}{{ r.text }}</li>
    </ol>
  </div>
</template>
