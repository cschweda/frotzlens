<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { DECOMPILER_DESIGN_URL, DECOMPILER_STEPS, STEP_LABEL, type StepState } from '~/utils/decompiler'

/**
 * Source: the story as Inform 6. Until the decompiler's routines read well (Phase 6, step 6c) it says
 * how far the work has got instead of showing half-finished source.
 */
defineProps<{ story: StoryFile; fileName: string }>()

const BADGE: Record<StepState, string> = {
  done: 'border-[var(--frotz-lamp-text)] text-lamp',
  working: 'border-[var(--frotz-lamp-text)] text-lamp',
  planned: 'border-default text-muted',
}
const ICON: Record<StepState, string> = { done: 'i-lucide-circle-check', working: 'i-lucide-loader', planned: 'i-lucide-circle-dashed' }
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Inform 6 source" :eyebrow="fileName">
      The story turned back into Inform 6: one <code class="data">.inf</code> that reads like Inform and compiles again to the
      same game, checked by compiling it here in the browser. It isn’t ready to show yet; this is how far it has got.
    </ViewHeader>
    <p class="flex w-fit items-center gap-2 rounded-full border border-[var(--frotz-lamp-text)] px-3 py-1 text-sm text-lamp">
      <UIcon name="i-lucide-hammer" class="size-4" aria-hidden="true" />
      In progress
    </p>
    <ol class="flex flex-col gap-3" aria-label="Steps">
      <li v-for="s in DECOMPILER_STEPS" :key="s.id" class="flex gap-4 rounded-xl border border-default p-4">
        <UIcon :name="ICON[s.state]" class="mt-0.5 size-5 shrink-0" :class="s.state === 'planned' ? 'text-muted' : 'text-lamp'" aria-hidden="true" />
        <div class="flex min-w-0 flex-col gap-1">
          <h2 class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="data text-sm text-muted">{{ s.id }}</span>
            <span class="font-semibold text-highlighted">{{ s.title }}</span>
            <span class="rounded-full border px-2 text-xs" :class="BADGE[s.state]">{{ STEP_LABEL[s.state] }}</span>
          </h2>
          <p class="text-sm text-muted">{{ s.detail }}</p>
        </div>
      </li>
    </ol>
    <p class="max-w-3xl text-sm text-muted">
      A decompiled game is still its author’s work. The plan, and how the result is checked, are in the
      <a :href="DECOMPILER_DESIGN_URL" target="_blank" rel="noopener" class="text-lamp underline">design</a>.
    </p>
  </div>
</template>
