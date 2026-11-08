<script setup lang="ts">
import changelog from '../../../CHANGELOG.md?raw'

const { story, fileName, status, close, openFile } = useStory()
const { loadSymbols, clearSymbols } = useSymbols()
const { route, replace } = useHashRoute()
const searching = ref(false)

// ⌘K / Ctrl+K opens the search once a file is open.
function onKey(e: KeyboardEvent) {
  if (story.value && isModShortcut(e, 'k')) {
    e.preventDefault()
    searching.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// A new file starts at its overview. The one exception is the first file of a
// visit opened from a link to a view (#routine/27f8): that view is kept.
let keepIncomingHash = !!location.hash && location.hash !== '#overview'
watch(story, s => {
  clearSymbols() // a debug file belongs to the story it was loaded over
  if (!s) return replace('overview') // closing a file leaves no stale view behind
  if (keepIncomingHash) keepIncomingHash = false
  else replace('overview')
})

// A file dropped anywhere on the page opens it (and never navigates the browser
// away to the raw file, losing the session). The drop zone handles its own drops.
function onWindowDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
}
function onWindowDrop(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (!file || status.value === 'loading') return
  // A debug file dropped over an open story is its names; anything else is a story to open.
  if (isDebugFile(file) && story.value) {
    loadSymbols(file, story.value)
    replace('symbols')
  } else openFile(file)
}
onMounted(() => {
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
})

// A new view starts at the top, and focus moves to it (so a screen reader announces it).
// The grammar view scrolls to its own verb (#grammar/12). A deep link opened with a file counts too.
watch(() => [story.value, route.value.view, route.value.id], () => {
  if (!story.value) return
  if (!(route.value.view === 'grammar' && route.value.id)) window.scrollTo({ top: 0 })
  nextTick(() => main.value?.focus({ preventScroll: true }))
})

// The skip link focuses <main> instead of following "#main": in a hash-routed
// app that would be a route ("There's no main in this file").
const main = useTemplateRef<HTMLElement>('main')
function skipToMain(e: MouseEvent) {
  e.preventDefault()
  main.value?.focus()
}
</script>

<template>
  <UApp>
    <div class="flex min-h-screen flex-col">
      <a href="#main" @click="skipToMain" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded focus:bg-elevated focus:px-3 focus:py-2">Skip to content</a>
      <AppHeader>
        <template #context>
          <span v-if="story" class="data hidden truncate text-sm text-muted sm:inline">/ {{ fileName }}</span>
        </template>
        <template #actions>
          <HeaderActions :loaded="!!story" @search="searching = true" @close="close" />
        </template>
      </AppHeader>
      <main v-if="!story" id="main" ref="main" tabindex="-1" class="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none">
        <DropZone />
      </main>
      <div v-else class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-10 lg:py-8">
        <LensNav :story="story" :view="route.view" />
        <main id="main" ref="main" tabindex="-1" class="min-w-0 flex-1 focus:outline-none">
          <OverviewView v-if="route.view === 'overview'" :story="story" :file-name="fileName" />
          <PlayView v-else-if="route.view === 'play'" :story="story" :file-name="fileName" />
          <MemoryView v-else-if="route.view === 'memory'" :story="story" :file-name="fileName" :id="route.id" />
          <ObjectsView v-else-if="route.view === 'objects' || route.view === 'object'" :story="story" :file-name="fileName" :id="route.view === 'object' ? (route.id ?? '') : undefined" />
          <DictionaryView v-else-if="route.view === 'dictionary' || route.view === 'dict'" :story="story" :file-name="fileName" :id="route.view === 'dict' ? (route.id ?? '') : undefined" />
          <GrammarView v-else-if="route.view === 'grammar'" :story="story" :file-name="fileName" :id="route.id" />
          <RoutinesView v-else-if="route.view === 'routines' || route.view === 'routine'" :story="story" :file-name="fileName" :id="route.view === 'routine' ? (route.id ?? '') : undefined" />
          <StringsView v-else-if="route.view === 'strings' || route.view === 'string'" :story="story" :file-name="fileName" :id="route.view === 'string' ? (route.id ?? '') : undefined" />
          <GlobalsView v-else-if="route.view === 'globals' || route.view === 'global'" :story="story" :file-name="fileName" :id="route.view === 'global' ? (route.id ?? '') : undefined" />
          <AbbreviationsView v-else-if="route.view === 'abbreviations'" :story="story" :file-name="fileName" />
          <SymbolsView v-else-if="route.view === 'symbols'" :story="story" :file-name="fileName" />
          <MapView v-else-if="route.view === 'map'" :story="story" :file-name="fileName" />
          <SourceView v-else-if="route.view === 'source' && story.fingerprint?.compiler === 'inform6'" :story="story" :file-name="fileName" :id="route.id" />
          <NotFound v-else :what="route.id ? `${route.view} “${route.id}”` : route.view" />
        </main>
      </div>
      <AppFooter />
      <SearchPalette v-if="story" v-model:open="searching" :story="story" />
      <AboutDialogs :changelog="changelog" />
    </div>
  </UApp>
</template>
