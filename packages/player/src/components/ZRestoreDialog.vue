<script setup lang="ts">
/** Restore (statement S3): choose a save file (.qzl, Quetzal); or cancel, which the story hears as a failed restore. */
import { ref } from 'vue'
import ZDialog from './ZDialog.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ choose: [bytes: Uint8Array, name: string]; cancel: [] }>()
const chosen = ref(false)

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  chosen.value = true
  emit('choose', new Uint8Array(await file.arrayBuffer()), file.name)
}

function onClose() {
  if (!chosen.value) emit('cancel')
  chosen.value = false
}
</script>

<template>
  <ZDialog id="zp-restore" :open="open" title="Restore a saved game" @close="onClose">
    <p>Choose a save file (<span class="zp-kbd">.qzl</span>) for this story. Files saved by other Z-machine interpreters work too.</p>
    <label>Save file <input type="file" accept=".qzl,.sav,application/octet-stream" @change="onFile"></label>
  </ZDialog>
</template>
