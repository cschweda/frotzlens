<script setup lang="ts">
/**
 * The source (design §6.3): the story's own Inform 6 file, with the line the machine is on marked,
 * and a gutter button on each line a statement starts on, to set a breakpoint there. Needs the
 * source and the debug file (the samples have both).
 */
const session = useSession()
const live = computed(() => session.live())
const sources = session.sources
const problem = ref('')

/** The debug file's own name for the story's source (sources[0], as Inform numbers them: the game's file). */
const file = computed(() => live.value?.symbols?.sources[0] ?? sources.value[0]?.name ?? '')
const text = computed(() => {
  const f = file.value.toLowerCase()
  return (sources.value.find(x => x.name.toLowerCase() === f || f.endsWith(x.name.toLowerCase())) ?? sources.value[0])?.text ?? ''
})
const lines = computed(() => text.value.split('\n'))
/** Lines a statement starts on, in that file. */
const statements = computed(() => new Set((live.value?.symbols?.lines ?? []).filter(p => p.location.file === 0).map(p => p.location.line)))
const current = computed(() => (live.value?.where && file.value.endsWith(live.value.where.file) ? live.value.where.line : undefined))
const breaks = computed(() => new Set(live.value?.breakpoints.filter(b => b.kind === 'line').map(b => (b as { line: number }).line) ?? []))
const scroller = useTemplateRef<HTMLElement>('scroller')
watch(current, n => nextTick(() => scroller.value?.querySelector(`#src-${n}`)?.scrollIntoView({ block: 'center' })), { immediate: true })
function toggle(n: number) {
  problem.value = session.toggleLineBreakpoint(file.value, n) ?? ''
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Source" :eyebrow="file">
      <template v-if="text">The game's own file. ▶ marks the line the machine is on; the gutter sets a breakpoint on a line a statement starts on.</template>
      <template v-else>The source wasn't given. Open the story with its <span class="data">.inf</span> file (and its debug file) to step through it here.</template>
    </ViewHeader>
    <p v-if="problem" role="alert" class="text-sm text-error">{{ problem }}</p>
    <div v-if="text" ref="scroller" class="data max-h-[70vh] overflow-auto rounded-xl border border-default bg-muted p-3 text-sm leading-6" role="region" aria-label="Source" tabindex="0">
      <div v-for="(l, i) in lines" :id="`src-${i + 1}`" :key="i" class="flex whitespace-pre" :class="current === i + 1 ? 'bg-elevated font-semibold' : ''">
        <span class="inline-flex w-14 shrink-0 items-center gap-1">
          <button
            v-if="statements.has(i + 1)"
            type="button"
            class="size-3.5 rounded-full border border-default"
            :class="breaks.has(i + 1) ? 'bg-[var(--frotz-lamp)]' : 'hover:bg-elevated'"
            :aria-pressed="breaks.has(i + 1)"
            :aria-label="`Breakpoint on line ${i + 1}`"
            @click="toggle(i + 1)"
          />
          <span v-if="current === i + 1" class="text-lamp" aria-hidden="true">▶</span><span v-if="current === i + 1" class="sr-only">the machine is on this line</span>
        </span>
        <span class="w-10 shrink-0 pr-3 text-right text-muted">{{ i + 1 }}</span><span>{{ l }}</span>
      </div>
    </div>
  </div>
</template>
