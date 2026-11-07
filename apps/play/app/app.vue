<script setup lang="ts">
/**
 * frotzplay's page (docs/14 §1): the family shell around the start page, or around a story playing.
 */
import type { Theme } from '@frotzinc/player'
import changelog from '../CHANGELOG.md?raw'
import { site } from '~~/site.config'

const { story, error, loading, fromFile, fromSample, fromUrl, listenForOpener, close } = useStorySource()
const pane = useTemplateRef<{ focusCommand: () => void }>('pane')
const main = useTemplateRef<HTMLElement>('main')

// ── one theme for the page and the player ────────────────────────────────
// The header's switch is the family's colour mode (dark first); the player adds high contrast. The
// choice is remembered here, and a system that asks for more contrast starts in high contrast.
const colorMode = useColorMode()
const THEME_KEY = 'frotzplay:theme'
function initialTheme(): Theme {
  const saved = safeGetItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light' || saved === 'high-contrast') return saved
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches) return 'high-contrast'
  return colorMode.preference === 'light' ? 'light' : 'dark'
}
const theme = ref<Theme>(initialTheme())
watch(
  theme,
  t => {
    safeSetItem(THEME_KEY, t)
    document.documentElement.classList.toggle('high-contrast', t === 'high-contrast')
    const mode = t === 'light' ? 'light' : 'dark'
    if (colorMode.preference !== mode) colorMode.preference = mode
  },
  { immediate: true },
)
// The header's switch, the other way.
watch(
  () => colorMode.value,
  v => {
    const want: Theme = v === 'light' ? 'light' : theme.value === 'high-contrast' ? 'high-contrast' : 'dark'
    if (theme.value !== want) theme.value = want
  },
)

// ── where the story comes from ───────────────────────────────────────────
onMounted(() => {
  const q = new URLSearchParams(location.search)
  if (q.has('story')) fromUrl(q.get('story')!)
  else if (q.has('sample')) fromSample(q.get('sample') || site.samples[0]!.id)
  else listenForOpener()
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onWindowDrop)
})

// A story file dropped anywhere opens it, and never sends the browser off to the raw file.
function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
}
function onWindowDrop(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  const f = e.dataTransfer.files[0]
  if (f) fromFile(f)
}

const parchmentLink = computed(() => (story.value?.url ? `${site.parchmentUrl}/?story=${encodeURIComponent(story.value.url)}` : null))

function anotherStory() {
  close()
  nextTick(() => main.value?.focus())
}

// The skip link: to the command line while playing, to the page's content otherwise.
function skip(e: MouseEvent) {
  e.preventDefault()
  if (story.value) pane.value?.focusCommand()
  else main.value?.focus()
}
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh flex-col">
      <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded focus:bg-elevated focus:px-3 focus:py-2" @click="skip">{{ story ? 'Skip to the command line' : 'Skip to content' }}</a>
      <AppHeader>
        <template #context>
          <span v-if="story" class="hidden truncate text-sm text-quiet sm:inline">/ {{ story.title }}</span>
        </template>
        <template #actions>
          <UButton v-if="parchmentLink" color="neutral" variant="ghost" icon="i-lucide-external-link" :to="parchmentLink" target="_blank" rel="noopener">
            <span class="hidden sm:inline">Open in Parchment</span><span class="sr-only sm:hidden">Open in Parchment</span>
          </UButton>
          <UButton v-if="story" color="neutral" variant="outline" icon="i-lucide-file-plus" @click="anotherStory">
            <span class="hidden sm:inline">Another story</span><span class="sr-only sm:hidden">Open another story</span>
          </UButton>
        </template>
      </AppHeader>
      <main id="main" ref="main" tabindex="-1" class="flex-1 focus:outline-none">
        <PlayPane v-if="story" :key="story.name + story.bytes.length" ref="pane" v-model:theme="theme" :story="story" />
        <StartPage v-else :error="error" :loading="loading" @file="fromFile" @sample="fromSample" />
      </main>
      <AppFooter />
      <AboutDialogs :changelog="changelog" />
    </div>
  </UApp>
</template>
