<script setup lang="ts">
import type { RoutineView } from '@frotzinc/zcode/format'
import type { MachineView } from '../utils/live'

/**
 * One routine's disassembly, as txd lays it out: every routine, string, object and dictionary word
 * it uses is a link, and a branch or jump target moves focus to its line. `live` is unused until
 * frotztrace's Phase 4, when it marks the program counter.
 */
const props = defineProps<{ view: RoutineView; address: number; live?: MachineView }>()

// Labels: a branch or jump target scrolls to its line and focuses it (the route stays the routine).
function jump(target: number) {
  const el = document.getElementById(`at-${hex(target)}`)
  el?.scrollIntoView({ block: 'center' })
  el?.focus()
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-default bg-muted" role="region" aria-label="Disassembly" tabindex="0">
    <div class="data min-w-max p-4 text-sm leading-6">
      <div class="whitespace-pre text-highlighted">{{ props.view.header }}</div>
      <div v-for="(n, i) in props.view.notes" :key="i" class="whitespace-pre text-muted">{{ n }}</div>
      <div aria-hidden="true">&nbsp;</div>
      <div
        v-for="l in props.view.lines"
        :id="`at-${hex(l.address)}`"
        :key="l.address"
        tabindex="-1"
        class="whitespace-pre rounded focus:bg-elevated"
      ><span class="text-muted">{{ `${hex(l.address).padStart(5)}  ` }}</span><span class="text-lamp">{{ (l.label ? `${l.label}:` : '').padEnd(7) }}</span><template v-for="(p, j) in l.pieces" :key="j"><a v-if="p.id" :href="idRoute(p.id)" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid">{{ p.text }}</a><a v-else-if="p.target !== undefined" :href="`#routine/${hex(address)}`" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid" :aria-label="`${p.text}, the instruction at ${hex(p.target)}`" @click.prevent="jump(p.target)">{{ p.text }}</a><span v-else>{{ p.text }}</span></template></div>
    </div>
  </div>
</template>
