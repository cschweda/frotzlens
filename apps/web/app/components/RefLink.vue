<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** A link to anything with a model Id, labelled as txd would name it. */
const props = defineProps<{ story: StoryFile; id: string; label?: string }>()
const text = computed(() => props.label ?? idLabel(props.story, props.id))
// Globals have no view yet: shown, not linked.
const linked = computed(() => !props.id.startsWith('global:'))
</script>

<template>
  <a v-if="linked" :href="idRoute(id)" class="text-lamp underline-offset-2 hover:underline">{{ text }}</a>
  <span v-else>{{ text }}</span>
</template>
