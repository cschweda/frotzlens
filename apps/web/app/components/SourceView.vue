<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { DECOMPILER_DESIGN_URL } from '~/utils/decompiler'

/**
 * Source: the story as Inform 6 (Phase 6). Made in a worker the first time it's opened, and checked
 * there as the tests check it: compiled again with Inform 6.44, every routine compared with the
 * story's. #source/4f4 shows the routine at 4f4.
 */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()
const { symbols } = useSymbols()
const { result, status, progress, failure, make } = useSource()

onMounted(() => make(props.story, symbols.value ?? undefined))
watch([() => props.story, symbols], () => make(props.story, symbols.value ?? undefined))

const lines = computed(() => result.value?.source.replace(/\n$/, '').split('\n') ?? [])
const selected = computed(() => (props.id && /^[0-9a-f]+$/i.test(props.id) ? Number.parseInt(props.id, 16) : undefined))
const inRoutine = (k: number) => selected.value !== undefined && result.value?.lineRoutines[k] === selected.value

// #source/4f4: to the routine's first line, once the source is there.
watch([selected, status], async () => {
  if (selected.value === undefined || status.value !== 'ready') return
  await nextTick()
  const k = result.value!.lineRoutines.indexOf(selected.value)
  const el = k >= 0 ? document.getElementById(`line-${k + 1}`) : null
  el?.scrollIntoView({ block: 'start' })
  el?.focus()
})

const stem = computed(() => props.fileName.replace(/\.[^.]+$/, '') || 'story')
function download() {
  if (!result.value) return
  const url = URL.createObjectURL(new Blob([result.value.source], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${stem.value}.inf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const summary = computed(() => {
  const r = result.value
  if (!r) return ''
  if (!r.compiled) return 'The source didn’t compile again, so every routine is written as Inform assembly.'
  const all = r.idiomatic.length === r.of
  const one = r.of === 1
  const how = all
    ? `${one ? 'The game’s one routine is' : `All ${r.of} of the game’s routines are`} written with Inform’s control flow and syntax.`
    : `Of the game’s ${r.of} routines, ${r.idiomatic.length} are written with Inform’s control flow and syntax, ${r.statements.length - r.idiomatic.length} as plainer statements, and ${r.of - r.statements.length} as assembly.`
  const check = r.differing.length
    ? `${r.differing.length} still came back differently when compiled again.`
    : `Compiled again, ${one ? 'it comes' : 'every one comes'} back as the same instructions.`
  return `${how} ${check}`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Inform 6 source" :eyebrow="fileName" :copy="result ? () => result!.source : undefined" copy-label="Copy the source">
      The story turned back into Inform 6: one <code class="data">.inf</code>, the library left out as
      <code class="data">Include</code>s, and each routine checked by compiling the whole again here in the browser
      (Inform 6.44) and comparing it with the story’s.
    </ViewHeader>

    <p v-if="status === 'running'" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <UIcon name="i-lucide-loader" class="size-4 animate-spin" aria-hidden="true" />
      {{ progress }}
    </p>
    <p v-else-if="status === 'failed'" class="max-w-3xl text-sm" role="alert">
      It couldn’t be decompiled: {{ failure }}
    </p>

    <template v-else-if="status === 'ready' && result">
      <div class="flex flex-col gap-2 text-sm">
        <p class="max-w-3xl">{{ summary }}</p>
        <p v-if="result.names === 'made up'" class="max-w-3xl text-muted">
          There’s no debug file loaded, so the library was found by compiling it alone, and the game’s names
          are made up from what the story says. Load its <code class="data">gameinfo.dbg</code> on the
          <a href="#symbols" class="text-lamp underline">Symbols</a> view for the source’s own names.
        </p>
        <p v-else class="max-w-3xl text-muted">Names from the debug file.</p>
      </div>
      <p v-if="selected !== undefined && !result.lineRoutines.includes(selected)" class="max-w-3xl text-sm text-muted" role="status">
        The routine at {{ selected.toString(16) }} isn’t written out here: it’s the library’s (or Inform’s own), which the source
        <code class="data">Include</code>s.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton icon="i-lucide-download" color="neutral" variant="outline" @click="download">Download {{ stem }}.inf</UButton>
      </div>
      <div class="overflow-x-auto rounded-xl border border-default" role="region" aria-label="Inform 6 source" tabindex="0">
        <ol class="data py-3 text-sm leading-6">
          <li
            v-for="(l, k) in lines"
            :id="`line-${k + 1}`"
            :key="k"
            tabindex="-1"
            class="flex scroll-mt-24 whitespace-pre pr-4 focus:outline-none"
            :class="inRoutine(k) ? 'bg-elevated' : ''"
          ><span class="w-14 shrink-0 select-none pr-4 text-right text-muted" aria-hidden="true">{{ k + 1 }}</span><span :class="l.trimStart().startsWith('!') ? 'text-muted' : ''">{{ l || ' ' }}</span></li>
        </ol>
      </div>
      <p v-if="result.problems.length" class="max-w-3xl text-sm text-muted">
        {{ result.problems.join(' ') }}
      </p>
    </template>

    <p class="max-w-3xl text-sm text-muted">
      A decompiled game is still its author’s work. How it’s made and checked is in the
      <a :href="DECOMPILER_DESIGN_URL" target="_blank" rel="noopener" class="text-lamp underline">design</a>.
    </p>
  </div>
</template>
