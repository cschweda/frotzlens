<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/**
 * Play the story, in Parchment (the interpreter Frotzsmith uses), beside the disassembly. The player
 * runs in a sandboxed iframe with an opaque origin (public/play/play.js): the story is anyone's file,
 * so the game gets no access to Frotzlens or its storage. The bytes are posted to the frame when it
 * says it's ready; a Blorb's story is the unwrapped one.
 */
const props = defineProps<{ story: StoryFile; fileName: string }>()
const colorMode = useColorMode()

const playable = computed(() => [3, 4, 5, 8].includes(props.story.header.version) && !props.story.errors.some(e => e.severity === 'error'))
const running = ref(false)
const nonce = ref(0)
const frame = useTemplateRef<HTMLIFrameElement>('frame')
const box = useTemplateRef<HTMLElement>('box')
const src = computed(() => `/play/index.html?theme=${colorMode.value === 'dark' ? 'dark' : 'light'}&n=${nonce.value}`)

function start() {
  nonce.value++
  running.value = true
}
// The frame asks for the story; only that frame's window is answered, and only with a copy.
function onMessage(e: MessageEvent) {
  const win = frame.value?.contentWindow
  if (!win || e.source !== win) return
  const d = e.data as { source?: string; type?: string } | null
  if (d?.source !== 'frotzlens-play' || d.type !== 'ready') return
  const bytes = props.story.bytes.slice().buffer
  // '*': the sandboxed frame's origin is opaque ("null"), so there's no origin to name. The message
  // goes to that one window only, and it's the user's own file.
  win.postMessage({ source: 'frotzlens', type: 'story', version: props.story.header.version, bytes }, '*', [bytes])
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
// A new story stops the old game.
watch(() => props.story, () => (running.value = false))
// Changing the theme restarts the frame in the new colours (the game restarts too).
watch(() => colorMode.value, () => running.value && nonce.value++)

const fullscreen = ref(false)
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void box.value?.requestFullscreen?.()?.catch(() => {})
}
const onFs = () => (fullscreen.value = document.fullscreenElement === box.value)
onMounted(() => document.addEventListener('fullscreenchange', onFs))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFs))
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader title="Play" :eyebrow="fileName">
      Play the story itself, in <a href="https://github.com/curiousdannii/parchment" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid">Parchment</a>,
      the interpreter Frotzsmith uses. It runs here in your browser, walled off from the rest of Frotzlens.
      Nothing is uploaded, and nothing is saved when you leave.
    </ViewHeader>

    <p v-if="!playable" class="text-muted">
      This file can’t be played here: Parchment plays Z-machine versions 3, 4, 5 and 8, and the file has to read cleanly.
    </p>
    <div v-else-if="!running" class="flex flex-col items-start gap-3 rounded-xl border border-default bg-muted p-6">
      <p>Start the game from the beginning. Switching views keeps nothing: coming back starts it again.</p>
      <UButton size="lg" icon="i-lucide-play" @click="start">Play {{ fileName }}</UButton>
    </div>
    <div v-else ref="box" class="flex flex-col gap-2 bg-default">
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="nonce++">Restart</UButton>
        <UButton color="neutral" variant="outline" :icon="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" @click="toggleFullscreen">
          {{ fullscreen ? 'Exit full screen' : 'Full screen' }}
        </UButton>
      </div>
      <iframe
        ref="frame"
        :key="nonce"
        :src="src"
        :title="`${fileName}, playing in Parchment`"
        sandbox="allow-scripts"
        class="w-full rounded-xl border border-default"
        :class="fullscreen ? 'flex-1' : 'h-[70vh] min-h-96'"
      />
    </div>
  </div>
</template>
