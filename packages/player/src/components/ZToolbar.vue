<script setup lang="ts">
/** The player's controls: every one a labelled button, operable by keyboard (I4), at least 44 px (I7). */
defineProps<{ busy: boolean; hasUpper: boolean }>()
const emit = defineEmits<{ undo: []; save: []; restore: []; transcript: []; script: []; settings: []; shortcuts: []; readUpper: [] }>()
</script>

<template>
  <div class="zp-toolbar" role="group" aria-label="Story controls">
    <button class="zp-button" type="button" :disabled="busy" @click="emit('undo')">Undo</button>
    <button class="zp-button" type="button" :disabled="busy" @click="emit('save')">Save</button>
    <button class="zp-button" type="button" :disabled="busy" @click="emit('restore')">Restore</button>
    <button v-if="hasUpper" class="zp-button" type="button" @click="emit('readUpper')">Read upper window</button>
    <button class="zp-button" type="button" @click="emit('transcript')">Download transcript</button>
    <button class="zp-button" type="button" @click="emit('script')">Download commands</button>
    <button class="zp-button" type="button" @click="emit('settings')">Settings</button>
    <button class="zp-button" type="button" @click="emit('shortcuts')">Keyboard shortcuts</button>
  </div>
</template>
