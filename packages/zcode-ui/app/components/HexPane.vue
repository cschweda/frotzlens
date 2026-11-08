<script setup lang="ts">
import type { MachineView } from '../utils/live'

/**
 * A hex view of bytes, a page of rows at a time so a large file stays quick, with "Go to address"
 * and paging. `top` (v-model) is the first row's address. `notes` labels what begins in a row;
 * `inRange` dims the bytes outside the part being shown. `live` (frotztrace) lights the bytes the
 * running machine changed since it last stopped; pass the live memory as `bytes`.
 */
const props = defineProps<{
  bytes: Uint8Array
  notes?: (from: number, to: number) => string[]
  inRange?: (address: number) => boolean
  live?: MachineView
}>()
const top = defineModel<number>('top', { default: 0 })

const ROWS = 32
const size = computed(() => props.bytes.length)

/** Jump to a row-aligned address. */
const goTo = (a: number) => (top.value = Math.max(0, Math.min(Math.floor(a / 16) * 16, Math.max(0, size.value - 1) & ~15)))

const rows = computed(() => {
  const b = props.bytes
  const out: { at: number; bytes: number[]; text: string; notes: string[] }[] = []
  for (let r = 0; r < ROWS; r++) {
    const at = top.value + r * 16
    if (at >= b.length) break
    const bytes = [...b.subarray(at, Math.min(at + 16, b.length))]
    out.push({
      at,
      bytes,
      text: bytes.map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join(''),
      notes: props.notes?.(at, at + 16) ?? [],
    })
  }
  return out
})
const inPart = (a: number) => props.inRange?.(a) ?? true
/** Live: how many of the row's bytes changed (the text equivalent of their highlight). */
const changedIn = (at: number) => { let n = 0; for (let i = 0; i < 16; i++) if (props.live?.changed.addresses.has(at + i)) n++; return n }

const jump = ref('')
const jumpError = ref('')
function onJump() {
  const text = jump.value.trim().replace(/^(0x|\$)/i, '')
  const a = /^[0-9a-f]+$/i.test(text) ? parseInt(text, 16) : NaN
  if (!size.value) jumpError.value = 'The file is empty: there are no addresses.'
  else if (Number.isNaN(a)) jumpError.value = `“${jump.value}” isn't a hex address.`
  else if (a >= size.value) jumpError.value = `${hex(a)} is past the end of the file (${hex(size.value - 1)}).`
  else {
    jumpError.value = ''
    goTo(a)
  }
}
</script>

<template>
  <section aria-labelledby="hex-title" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h2 id="hex-title" class="font-display text-2xl font-semibold text-highlighted">Bytes</h2>
      <form class="flex items-center gap-2" @submit.prevent="onJump">
        <label for="hex-jump" class="text-sm text-muted">Go to address</label>
        <UInput id="hex-jump" v-model="jump" placeholder="1c97" class="data w-28" :aria-invalid="!!jumpError || undefined" />
        <UButton type="submit" color="neutral" variant="outline">Go</UButton>
      </form>
    </div>
    <p v-if="jumpError" role="alert" class="text-sm text-error">{{ jumpError }}</p>
    <div v-if="!size">
      <p class="text-muted">The file is empty.</p>
    </div>
    <div v-if="size" class="flex flex-wrap items-center gap-2">
      <UButton color="neutral" variant="outline" icon="i-lucide-chevrons-up" :disabled="top === 0" aria-label="Previous page of bytes" @click="goTo(top - ROWS * 16)" />
      <UButton color="neutral" variant="outline" icon="i-lucide-chevrons-down" :disabled="top + ROWS * 16 >= size" aria-label="Next page of bytes" @click="goTo(top + ROWS * 16)" />
      <span class="data text-sm text-muted">{{ hex(top) }}–{{ hex(Math.min(top + ROWS * 16, size) - 1) }} of {{ hex(size - 1) }}</span>
    </div>
    <div v-if="size" class="overflow-x-auto rounded-xl border border-default bg-muted" role="region" aria-label="Bytes" tabindex="0">
      <table class="data min-w-max text-sm leading-6">
        <caption class="sr-only">Bytes from {{ hex(top) }}, 16 to a row</caption>
        <thead class="sr-only">
          <tr><th scope="col">Address</th><th scope="col">Bytes</th><th scope="col">As text</th><th scope="col">Starts here</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.at">
            <th scope="row" class="px-4 text-left font-normal text-muted">{{ hex(r.at, 5) }}</th>
            <td class="whitespace-pre px-2"><template v-for="(b, i) in r.bytes" :key="i"><span :class="live?.changed.addresses.has(r.at + i) ? 'rounded bg-[var(--frotz-lamp)] text-[var(--frotz-ground)]' : inPart(r.at + i) ? 'text-highlighted' : 'text-muted'">{{ hex(b, 2) }}</span>{{ i === 7 ? '  ' : i < 15 ? ' ' : '' }}</template></td>
            <td class="whitespace-pre px-4 text-muted">{{ r.text }}</td>
            <td class="whitespace-nowrap px-4 font-sans text-xs text-lamp">{{ [...r.notes, ...(changedIn(r.at) ? [`${changedIn(r.at)} changed`] : [])].join(' · ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
