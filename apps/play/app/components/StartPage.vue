<script setup lang="ts">
/**
 * The start page (docs/14 §1): what frotzplay is, the drop zone (or Choose a file), and the sample
 * stories, so a first visit can play at once. Errors and progress are announced (S2, S3).
 */
import { site } from '~~/site.config'

defineProps<{ error: string | null; loading: string | null }>()
const emit = defineEmits<{ file: [file: File]; sample: [id: string] }>()
const picker = useTemplateRef<HTMLInputElement>('picker')
const dragging = ref(false)

function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) emit('file', f)
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) emit('file', f)
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
    <div class="flex flex-col gap-3">
      <h1 class="font-display text-3xl font-bold text-highlighted sm:text-4xl">Play a Z-machine story</h1>
      <p class="max-w-2xl text-lg">
        Interactive fiction in your browser, built for screen readers and keyboards, dark by default. Stories made with Inform (versions 3, 4, 5 and 8, and Blorb files) play here; nothing is uploaded.
      </p>
    </div>

    <div
      class="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
      :class="dragging ? 'border-[var(--frotz-lamp)] bg-elevated' : 'border-default'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <p class="text-lg">Drop a story file here (<span class="data">.z3 .z4 .z5 .z8 .zblorb</span>), or</p>
      <UButton size="xl" icon="i-lucide-folder-open" @click="picker?.click()">Choose a file</UButton>
      <input ref="picker" class="sr-only" type="file" accept=".z3,.z4,.z5,.z8,.zblorb,.zlb,.blorb,.blb" aria-label="Choose a story file" tabindex="-1" @change="onPick">
    </div>

    <!-- Always in the page (so they're announced when they fill), taking no room when empty. -->
    <div class="-my-4 flex flex-col gap-2">
      <div role="status">
        <p v-if="loading" class="text-quiet">{{ loading }}</p>
      </div>
      <div role="alert">
        <p v-if="error" class="rounded-lg border border-default border-l-4 border-l-[var(--frotz-lamp)] bg-elevated p-4">{{ error }}</p>
      </div>
    </div>

    <section aria-labelledby="samples-title" class="flex flex-col gap-3">
      <h2 id="samples-title" class="font-display text-2xl font-semibold text-highlighted">Try a sample</h2>
      <p class="text-quiet">Short games from <a href="https://frotzsmith.com" class="underline decoration-dotted underline-offset-4">frotzsmith</a>, to see how frotzplay works.</p>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="(s, i) in site.samples" :key="s.id">
          <button
            type="button"
            class="flex w-full flex-col items-start gap-1 rounded-lg border border-default bg-elevated p-4 text-left hover:border-[var(--frotz-lamp)]"
            @click="emit('sample', s.id)"
          >
            <span class="font-semibold text-highlighted">{{ s.title }}<span v-if="i === 0" class="text-lamp"> · start here</span></span>
            <span class="text-quiet">{{ s.blurb }}</span>
          </button>
        </li>
      </ul>
    </section>

    <p class="text-quiet">
      frotzplay plays Z-code only. For Glulx, TADS, Hugo and everything else, use
      <a :href="site.parchmentUrl" class="underline decoration-dotted underline-offset-4">Parchment</a>, the web player for interactive fiction.
    </p>
  </div>
</template>
