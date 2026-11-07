<script setup lang="ts">
/**
 * Export (docs/15 §2): the story you're playing, as one HTML file that plays from a double-click,
 * or as a folder (.zip) for any static host. Made here, in the browser; nothing is uploaded.
 */
import { bundle, bundleFolder, slugOf, zip } from '@frotzinc/player'
import type { LoadedStory } from '~/composables/useStorySource'

const props = defineProps<{ story: LoadedStory }>()
const open = defineModel<boolean>('open', { required: true })
const message = ref('')
const busy = ref(false)

async function elementJs(): Promise<string> {
  const res = await fetch('/frotz-play.js')
  if (!res.ok) throw new Error(String(res.status))
  return res.text()
}

function save(data: BlobPart, name: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

async function run(kind: 'file' | 'folder') {
  busy.value = true
  message.value = ''
  try {
    const options = { title: props.story.title, storyName: props.story.name, elementJs: await elementJs(), siteUrl: location.origin }
    if (kind === 'file') {
      const { filename, html } = await bundle(props.story.bytes, options)
      save(html, filename, 'text/html')
      message.value = `Saved ${filename} to your downloads. Double-click it to play, or send it to anyone.`
    } else {
      const name = slugOf(props.story.title)
      save(zip(bundleFolder(props.story.bytes, options), name) as BlobPart, `${name}.zip`, 'application/zip')
      message.value = `Saved ${name}.zip to your downloads. Unzip it and open index.html, or upload the folder to any web host.`
    }
  } catch {
    message.value = 'The export couldn’t be made: the player’s script didn’t load. Check your connection and try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Export this story" :description="`${story.title}, ready to share. Made in your browser; nothing is uploaded.`">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <UButton icon="i-lucide-file-code" :loading="busy" class="self-start" @click="run('file')">Download one HTML file</UButton>
          <p class="text-quiet">The player and the story in a single file. It plays from a double-click, with no internet connection.</p>
        </div>
        <div class="flex flex-col gap-1">
          <UButton icon="i-lucide-folder-archive" color="neutral" variant="outline" :loading="busy" class="self-start" @click="run('folder')">Download a folder (.zip)</UButton>
          <p class="text-quiet">For a website or itch.io: <span class="data">index.html</span>, the player, the story file and a README.</p>
        </div>
        <p class="text-quiet">Both carry frotzplay’s accessibility features; the OpenDyslexic font stays on this site.</p>
        <p role="status">{{ message }}</p>
      </div>
    </template>
  </UModal>
</template>
