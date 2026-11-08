<script setup lang="ts">
import { routineView } from '@frotzinc/zcode/format'

/**
 * A routine's code (design §6.3): the shared disassembly with the PC marked and a gutter to set
 * breakpoints. Without an address, the routine the machine is in.
 */
const props = defineProps<{ id?: string }>()
const session = useSession()
const live = computed(() => session.live())
const address = computed(() => {
  const l = live.value
  if (!l) return undefined
  if (props.id && /^[0-9a-f]+$/i.test(props.id)) return parseInt(props.id, 16)
  const pc = l.view.pc
  return l.story.code.routines.find(r => pc >= r.address && pc < r.end)?.address
})
const view = computed(() => {
  const l = live.value
  return l && address.value !== undefined ? routineView(l.story, address.value, l.symbols ? { symbols: l.symbols } : {}) : undefined
})
const breakpoints = computed(() => new Set(live.value?.breakpoints.filter(b => b.kind === 'address').map(b => (b as { address: number }).address) ?? []))
const here = computed(() => {
  const l = live.value
  return !!l && address.value !== undefined && l.story.code.routines.find(r => r.address === address.value)!.end > l.view.pc && l.view.pc >= address.value
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader :title="view ? `Routine ${view.name}` : 'Code'" :eyebrow="address !== undefined ? hex(address) : ''">
      <template v-if="view">The gutter sets a breakpoint on a line.<template v-if="here"> ▶ marks the next instruction to run.</template></template>
      <template v-else>The machine isn't in a routine the disassembler knows.</template>
    </ViewHeader>
    <p v-if="address !== undefined && !here && live" class="text-sm"><a href="#code" class="text-lamp underline">Back to where the machine is</a></p>
    <Disassembly v-if="view && address !== undefined" :view="view" :address="address" :live="here ? live!.view : undefined" :breakpoints="breakpoints" @toggle-breakpoint="a => session.toggleAddressBreakpoint(a)" />
  </div>
</template>
