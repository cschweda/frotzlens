<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** A link to anything with a model Id, labelled as txd would name it. */
const props = defineProps<{ story: StoryFile; id: string; label?: string }>()
const text = computed(() => props.label ?? idLabel(props.story, props.id))
</script>

<template>
  <a :href="idRoute(id)" class="text-lamp underline-offset-2 hover:underline">{{ text }}</a>
</template>
