<script setup lang="ts">
/**
 * The player's dev page (docs/13 §1): the player on its own, for the Playwright suite and Chris's
 * NVDA run. ?story=<file> picks a story from /stories/; ?seed=N fixes the seed.
 */
import { onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import ZPlayer from '../src/components/ZPlayer.vue'

const STORIES = [
  { file: 'dark-cellar.z5', title: 'The Dark Cellar' },
  { file: 'locked-chest.z5', title: 'The Locked Chest' },
  { file: 'hermit.z5', title: 'The Hermit' },
  { file: 'magic-8-ball.z5', title: 'Magic 8-Ball' },
  { file: 'puny-dark-cellar.z3', title: 'The Dark Cellar (v3)' },
  { file: 'mingus-1.z5', title: 'Mingus I' },
  { file: 'timed.z5', title: 'Timed (test)' },
  { file: 'upper.z5', title: 'Upper window (test)' },
]

const params = new URLSearchParams(location.search)
const file = ref(params.get('story') ?? STORIES[0]!.file)
const seed = params.has('seed') ? Number(params.get('seed')) : undefined
const autosave = params.get('autosave') !== 'off'
const story = shallowRef<Uint8Array | null>(null)
const title = ref('')
const failed = ref('')
const player = useTemplateRef<InstanceType<typeof ZPlayer>>('player')

async function load() {
  const entry = STORIES.find(s => s.file === file.value) ?? { file: file.value, title: file.value }
  story.value = null
  failed.value = ''
  try {
    const res = await fetch(`/stories/${entry.file}`)
    if (!res.ok) throw new Error(`${res.status}`)
    story.value = new Uint8Array(await res.arrayBuffer())
    title.value = entry.title
    document.title = `${entry.title} — frotzplay`
  } catch {
    failed.value = `Couldn’t load ${entry.file}. Pick another story.`
  }
}

function choose(e: Event) {
  file.value = (e.target as HTMLSelectElement).value
  const u = new URL(location.href)
  u.searchParams.set('story', file.value)
  history.replaceState(null, '', u)
  load()
}

onMounted(load)
</script>

<template>
  <a class="skip" href="#zp-command-input" @click.prevent="player?.focusCommand()">Skip to the command line</a>
  <div class="dev">
    <header>
      <h1>frotzplay player</h1>
      <label>Story
        <select :value="file" @change="choose">
          <option v-for="s in STORIES" :key="s.file" :value="s.file">{{ s.title }}</option>
        </select>
      </label>
    </header>
    <main>
      <p v-if="failed" role="alert">{{ failed }}</p>
      <ZPlayer v-if="story" :key="file" ref="player" :story="story" :title="title" :seed="seed" :autosave="autosave" font-base="/fonts/" />
    </main>
  </div>
</template>
