<script setup lang="ts">
const { story, fileName, status, close } = useStory()
const { route } = useHashRoute()
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

// A new file starts at its overview.
watch(story, s => {
  if (s && location.hash && location.hash !== '#overview') return
  if (s) history.replaceState(null, '', '#overview')
})
</script>

<template>
  <UApp>
    <div class="flex min-h-screen flex-col">
      <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded focus:bg-elevated focus:px-3 focus:py-2">Skip to content</a>
      <AppHeader :loaded="!!story" :file-name="fileName" @search="searching = true" @close="close" />
      <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
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
