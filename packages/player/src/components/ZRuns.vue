<script setup lang="ts">
/**
 * A turn's styled runs (statement O6): bold as <b>, italic as <i>, reverse and fixed-pitch as
 * classed spans, game colours mapped to the theme's readable versions (backgrounds ignored, so
 * contrast holds). Fixed-pitch text that spans lines (a map, a box) is its own block that scrolls
 * sideways inside itself (O7), focusable so a keyboard can scroll it.
 */
import type { StyledRun } from '@frotzinc/zmachine'
import { computed } from 'vue'

const props = defineProps<{ runs: StyledRun[] }>()

interface Segment {
  fixedBlock: boolean
  runs: StyledRun[]
}

const segments = computed<Segment[]>(() => {
  const out: Segment[] = []
  for (const r of props.runs) {
    const fixed = (r.style & 8) !== 0 || r.font === 4
    const block = fixed && r.text.includes('\n') && r.text.trim().length > 0
    const last = out.at(-1)
    if (last && last.fixedBlock === block) last.runs.push(r)
    else out.push({ fixedBlock: block, runs: [r] })
  }
  return out
})

const classes = (r: StyledRun) => [
  r.style & 1 ? 'zp-run--reverse' : '',
  (r.style & 8 || r.font === 4) ? 'zp-run--fixed' : '',
  r.fg >= 2 && r.fg <= 9 ? `zp-c${r.fg}` : '',
]
</script>

<template>
  <template v-for="(seg, i) in segments" :key="i">
    <pre v-if="seg.fixedBlock" class="zp-fixedblock" tabindex="0" aria-label="Fixed-width text"><template v-for="(r, j) in seg.runs" :key="j"><span :class="classes(r)"><b v-if="r.style & 2"><i v-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></b><i v-else-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></span></template></pre>
    <template v-else><template v-for="(r, j) in seg.runs" :key="j"><span v-if="classes(r).some(Boolean)" :class="classes(r)"><b v-if="r.style & 2"><i v-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></b><i v-else-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></span><b v-else-if="r.style & 2"><i v-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></b><i v-else-if="r.style & 4">{{ r.text }}</i><template v-else>{{ r.text }}</template></template></template>
  </template>
</template>
