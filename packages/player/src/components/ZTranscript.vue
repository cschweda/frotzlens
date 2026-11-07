<script setup lang="ts">
/**
 * The story (statement O1): a labelled region, one block per turn (the command, then the output),
 * browsable in a screen reader's browse mode. Not a live region: the announcer speaks (O2). It
 * scrolls on its own, focusable so the keyboard can scroll it, and keeps the newest turn in view.
 */
import { nextTick, useTemplateRef, watch } from 'vue'
import type { TurnBlock } from '../composables/useMachine.js'
import ZRuns from './ZRuns.vue'

const props = defineProps<{ turns: TurnBlock[] }>()
const el = useTemplateRef<HTMLElement>('el')

watch(
  () => props.turns.length,
  () => nextTick(() => el.value && (el.value.scrollTop = el.value.scrollHeight)),
)
</script>

<template>
  <section ref="el" class="zp-story" aria-label="Story" tabindex="0">
    <div class="zp-story__inner">
      <div v-for="t in turns" :key="t.id" class="zp-turn">
        <p v-if="t.command !== null" class="zp-echo"><span aria-hidden="true">&gt; </span><span class="zp-sr">{{ t.kind === 'key' ? 'You pressed' : 'You typed' }}: </span>{{ t.command }}</p>
        <p v-else-if="t.kind === 'timer'" class="zp-echo zp-muted">(time passes)</p>
        <div class="zp-out"><ZRuns :runs="t.runs" /></div>
      </div>
    </div>
  </section>
</template>
