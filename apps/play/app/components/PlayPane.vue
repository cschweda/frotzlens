<script setup lang="ts">
/**
 * A story playing (docs/14 §1): its cover when the Blorb has one, then the player filling the page.
 * The page and the player share one theme (v-model:theme).
 */
import { ZPlayer, type Theme } from '@frotzinc/player'
import type { LoadedStory } from '~/composables/useStorySource'

const props = defineProps<{ story: LoadedStory }>()
const theme = defineModel<Theme>('theme', { required: true })
const player = useTemplateRef<InstanceType<typeof ZPlayer>>('player')
const seed = (() => {
  const s = new URLSearchParams(location.search).get('seed')
  return s !== null && /^-?\d+$/.test(s) ? Number(s) : undefined
})()

useHead({ title: () => `${props.story.title} — frotzplay` })

defineExpose({ focusCommand: () => player.value?.focusCommand() })
</script>

<template>
  <div class="play-frame mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3">
    <div v-if="story.cover || story.author" class="flex items-center gap-4">
      <img v-if="story.cover" :src="story.cover" :alt="`Cover of ${story.title}`" class="h-20 w-auto rounded-md">
      <p v-if="story.author" class="text-quiet">{{ story.title }}, by {{ story.author }}</p>
    </div>
    <div class="min-h-0 flex-1">
      <ZPlayer ref="player" v-model:theme="theme" :story="story.bytes" :title="story.title" :seed="seed" font-base="/fonts/" />
    </div>
  </div>
</template>
