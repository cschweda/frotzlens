<script setup lang="ts">
import { site } from '~~/site.config'

const { openFile, openUrl, status, failure } = useStory()
const dragging = ref(false)
const input = ref<HTMLInputElement>()

const busy = computed(() => status.value === 'loading')

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && !busy.value) openFile(file)
}
function onPick(e: Event) {
  const picker = e.target as HTMLInputElement
  const file = picker.files?.[0]
  picker.value = '' // so choosing the same file again (a retry) fires change
  if (file) openFile(file)
}
const trySample = () => openUrl(site.sample.file, `/samples/${site.sample.file}`)
</script>

<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-12 sm:py-20" aria-labelledby="drop-title">
    <h1 id="drop-title" class="font-display text-center text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">
      See inside a story file
    </h1>
    <div
      class="frotz-grid flex w-full flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors sm:py-20"
      :class="dragging ? 'border-[var(--frotz-lamp)] bg-elevated' : 'border-default bg-muted'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent.stop="onDrop"
    >
      <UIcon name="i-lucide-file-search" class="size-14 text-lamp" aria-hidden="true" />
      <p class="max-w-xl text-lg text-default">
        Drop a Z-machine story file to see what's inside.
      </p>
      <p class="text-sm text-muted">.z3, .z4, .z5 or .z8 — read here, in your browser. Nothing is uploaded.</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <UButton size="lg" icon="i-lucide-folder-open" :disabled="busy" @click="input?.click()">Choose a file</UButton>
        <UButton size="lg" color="neutral" variant="outline" icon="i-lucide-sparkles" :disabled="busy" @click="trySample">
          Try a sample
        </UButton>
      </div>
      <input ref="input" type="file" class="sr-only" accept=".z3,.z4,.z5,.z8" tabindex="-1" aria-hidden="true" @change="onPick">
      <p v-if="status === 'loading'" class="text-sm text-muted" role="status">Reading…</p>
      <p v-else-if="status === 'failed'" class="text-sm text-error" role="alert">{{ failure }}</p>
    </div>
  </section>
</template>
