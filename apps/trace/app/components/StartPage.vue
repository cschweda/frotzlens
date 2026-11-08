<script setup lang="ts">
import { blorbStory, isBlorb, readBlorb } from '@frotzinc/zcode'
import { site } from '~~/site.config'
import type { Opened } from '~/composables/useSession'

/**
 * The start page (docs/21 §3): frotzsmith's samples, each with its debug file and source, and a drop
 * zone with three slots (story, debug file, sources). A file dropped anywhere is sorted by its kind.
 */
const props = defineProps<{ error: string; loading: string }>()
const emit = defineEmits<{ open: [o: Opened]; sample: [id: string] }>()

const story = shallowRef<{ name: string; bytes: Uint8Array } | null>(null)
const dbg = shallowRef<{ name: string; text: string } | null>(null)
const sourceFiles = shallowRef<{ name: string; text: string }[]>([])
const problem = ref('')
const dragging = ref(false)

const isStory = (n: string) => /\.(z[3458]|zblorb|zlb|blorb|blb)$/i.test(n)
const isDebug = (n: string) => /\.dbg$/i.test(n)
const isSource = (n: string) => /\.(inf|h)$/i.test(n)

async function take(files: FileList | File[]) {
  problem.value = ''
  for (const f of Array.from(files)) {
    if (isStory(f.name)) {
      let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer())
      if (isBlorb(bytes)) {
        const inner = blorbStory(bytes, readBlorb(bytes))
        if (!inner) {
          problem.value = `${f.name} is a Blorb file without a Z-code story in it.`
          continue
        }
        bytes = inner
      }
      story.value = { name: f.name, bytes }
    } else if (isDebug(f.name)) dbg.value = { name: f.name, text: await f.text() }
    else if (isSource(f.name)) sourceFiles.value = [...sourceFiles.value.filter(s => s.name !== f.name), { name: f.name, text: await f.text() }]
    else problem.value = `${f.name} isn't a story (.z3, .z4, .z5, .z8, .zblorb), a debug file (.dbg) or Inform source (.inf, .h).`
  }
}

function start() {
  if (!story.value) return
  emit('open', { name: story.value.name, bytes: story.value.bytes, ...(dbg.value ? { dbg: dbg.value.text } : {}), sources: sourceFiles.value })
}

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files.length) void take(e.dataTransfer.files)
}
const pick = (e: Event) => {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void take(input.files)
  input.value = ''
}
defineExpose({ take })
void props
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
    <div class="flex flex-col gap-3">
      <h1 class="font-display text-3xl font-bold text-highlighted sm:text-4xl">Debug a Z-machine story</h1>
      <p class="max-w-2xl text-lg">
        Run a story under observation: breakpoints on routines, actions and source lines, a live view of everything
        inside it, and stepping backwards. Nothing is uploaded.
      </p>
    </div>

    <section aria-labelledby="samples-title" class="flex flex-col gap-3">
      <h2 id="samples-title" class="font-display text-2xl font-semibold text-highlighted">Try a sample</h2>
      <p class="text-muted">Games from <a href="https://frotzsmith.frotzinc.com" class="underline decoration-dotted underline-offset-4">frotzsmith</a>, each with its debug file and source, so every feature works at once.</p>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="(s, i) in site.samples" :key="s.id">
          <button
            type="button"
            class="flex w-full flex-col gap-1 rounded-xl border border-default bg-muted px-5 py-4 text-left transition-colors hover:border-[var(--frotz-lamp)]"
            :disabled="!!loading"
            @click="emit('sample', s.id)"
          >
            <span class="font-semibold text-highlighted">{{ s.title }}<span v-if="i === 0" class="text-lamp"> · start here</span></span>
            <span class="text-sm text-muted">{{ s.blurb }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section aria-labelledby="own-title" class="flex flex-col gap-3">
      <h2 id="own-title" class="font-display text-2xl font-semibold text-highlighted">Or your own</h2>
      <div
        class="flex flex-col gap-4 rounded-xl border-2 border-dashed p-6"
        :class="dragging ? 'border-[var(--frotz-lamp)] bg-elevated' : 'border-default'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <p>Drop the files here, or choose them. Only the story is needed; the debug file (Inform's <span class="data">gameinfo.dbg</span>, from compiling with <span class="data">-k</span>) adds names and source lines, and the source adds the Source view.</p>
        <ul class="grid gap-2 text-sm sm:grid-cols-3">
          <li class="rounded-lg border border-default p-3"><span class="font-semibold">Story</span> (required)<br><span class="text-muted">{{ story?.name ?? 'none yet' }}</span></li>
          <li class="rounded-lg border border-default p-3"><span class="font-semibold">Debug file</span><br><span class="text-muted">{{ dbg?.name ?? 'none' }}</span></li>
          <li class="rounded-lg border border-default p-3"><span class="font-semibold">Source</span><br><span class="text-muted">{{ sourceFiles.length ? sourceFiles.map(s => s.name).join(', ') : 'none' }}</span></li>
        </ul>
        <div class="flex flex-wrap items-center gap-3">
          <label class="cursor-pointer">
            <span class="sr-only">Choose files</span>
            <input type="file" multiple class="text-sm" accept=".z3,.z4,.z5,.z8,.zblorb,.zlb,.blorb,.blb,.dbg,.inf,.h" @change="pick">
          </label>
          <UButton icon="i-lucide-bug-play" :disabled="!story || !!loading" @click="start">Debug it</UButton>
        </div>
      </div>
    </section>

    <p v-if="loading" role="status" class="text-muted">{{ loading }}</p>
    <p v-if="problem || error" role="alert" class="rounded-lg border border-default border-l-4 border-l-[var(--frotz-lamp)] bg-elevated p-4">{{ problem || error }}</p>
  </div>
</template>
