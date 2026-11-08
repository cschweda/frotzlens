<script setup lang="ts">
/** Where the machine is, in one line (design §6.1): "stopped at ScoreTimer · turn 7 · 48,211 instructions · breakpoint action Take". */
const session = useSession()
const s = session.state
const line = computed(() => {
  const l = session.live()
  if (!l) return ''
  if (s.running) return 'Running…'
  const st = s.stop
  const top = l.stack.at(-1)
  const where = top?.routine !== undefined ? l.name(top.routine) : 'the main routine'
  const counts = `turn ${l.debugger.machine.state.counters.turns} · ${l.debugger.machine.state.counters.instructions.toLocaleString('en-US')} instructions`
  const src = l.where ? ` · ${l.where.file}:${l.where.line}` : ''
  // What it's waiting for, asked of the machine (after going back in time, the last stop was the jump).
  const pending = l.debugger.machine.state.input.pending?.kind
  const why =
    st?.kind !== 'breakpoint' && pending === 'line' ? ' · waiting for a command'
    : st?.kind !== 'breakpoint' && pending === 'char' ? ' · waiting for a key'
    : st?.kind === 'breakpoint' ? ` · breakpoint ${session.describe(st.breakpoint)}${st.detail ? `: ${st.detail}` : ''}`
    : st?.kind === 'input-line' ? ' · waiting for a command'
    : st?.kind === 'input-char' ? ' · waiting for a key'
    : st?.kind === 'quit' ? ' · the story has ended'
    : st?.kind === 'fault' ? ` · the story faulted: ${st.fault.message}`
    : st?.kind === 'paused' ? ' · paused'
    : ''
  return `At ${where}${src} · ${counts}${why}`
})
const inform = computed(() => {
  const i = session.live()?.inform
  if (!i?.action) return ''
  return [`action ${i.action.name ?? i.action.value}`, i.noun ? `noun ${i.noun.name}` : '', i.second && i.second.value ? `second ${i.second.name}` : ''].filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="flex flex-col gap-0.5 text-sm">
    <p role="status" aria-live="polite" class="data">{{ line }}</p>
    <p v-if="inform" class="data text-muted">{{ inform }}</p>
  </div>
</template>
