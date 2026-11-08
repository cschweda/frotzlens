<script setup lang="ts">
/** The call stack, innermost first (design §6.3): each frame named, where it is, its source line, its locals. */
const session = useSession()
const live = computed(() => session.live())
const frames = computed(() => {
  const l = live.value
  if (!l) return []
  return [...l.stack].reverse().map((f, i) => {
    const names = f.routine !== undefined ? l.symbols?.routines[f.routine]?.locals ?? [] : []
    return {
      i,
      routine: f.routine,
      name: f.routine !== undefined ? l.name(f.routine) : 'the main routine',
      pc: f.pc,
      line: l.debugger.sourceLine(f.pc),
      locals: f.locals.map((v, j) => ({ name: names[j] || `L${String(j).padStart(2, '0')}`, value: v })),
    }
  })
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Stack" eyebrow="Innermost first">Who called whom, and every local's value now. A routine's name opens its code.</ViewHeader>
    <ol class="flex flex-col gap-2">
      <li v-for="f in frames" :key="f.i" class="rounded-xl border border-default bg-muted px-4 py-3" :class="f.i === 0 ? 'border-[var(--frotz-lamp)]' : ''">
        <div class="flex flex-wrap items-baseline gap-x-3">
          <span class="data text-muted">#{{ f.i }}</span>
          <a v-if="f.routine !== undefined" :href="`#routine/${hex(f.routine)}`" class="font-semibold text-lamp hover:underline">{{ f.name }}</a>
          <span v-else class="font-semibold">{{ f.name }}</span>
          <span class="data text-sm text-muted">at {{ hex(f.pc) }}<template v-if="f.line"> · {{ f.line.file }}:{{ f.line.line }}</template></span>
          <span v-if="f.i === 0" class="text-xs text-lamp">current</span>
        </div>
        <dl v-if="f.locals.length" class="data mt-2 grid grid-cols-[max-content_1fr] gap-x-4 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
          <template v-for="v in f.locals" :key="v.name"><dt class="text-muted">{{ v.name }}</dt><dd>{{ v.value }}</dd></template>
        </dl>
      </li>
    </ol>
  </div>
</template>
