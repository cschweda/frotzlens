<script setup lang="ts">
const { story, fileName, status, close, openFile } = useStory()
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
  if (file && status.value !== 'loading') openFile(file)
}
onMounted(() => {
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
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
      <AppHeader :loaded="!!story" :file-name="fileName" @search="searching = true" @close="close" />
      <main id="main" ref="main" tabindex="-1" class="mx-auto focus:outline-none w-full max-w-6xl flex-1 px-4 py-8">
        <DropZone v-if="!story" />
        <template v-else>
          <OverviewView v-if="route.view === 'overview'" :story="story" :file-name="fileName" />
          <ItemView v-else :story="story" :view="route.view" :id="route.id" />
        </template>
      </main>
      <AppFooter />
      <SearchPalette v-if="story" v-model:open="searching" :story="story" />
    </div>
  </UApp>
</template>
