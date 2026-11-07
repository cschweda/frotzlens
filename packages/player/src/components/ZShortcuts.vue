<script setup lang="ts">
/**
 * Keyboard shortcuts (statement I6, WCAG 2.1.4): every binding listed, each changeable (press the
 * new keys; it must include Alt, Ctrl or Cmd) or off, and the defaults back.
 */
import { ref } from 'vue'
import { ACTIONS, DEFAULT_BINDINGS, bindingFrom, describe, type Action, type Binding } from '../shortcuts.js'
import ZDialog from './ZDialog.vue'

defineProps<{ open: boolean; mac: boolean }>()
const emit = defineEmits<{ close: [] }>()
const model = defineModel<Record<Action, Binding>>({ required: true })
const recording = ref<Action | null>(null)
const note = ref('')

function onClose() {
  recording.value = null
  emit('close')
}

function startRecording(e: MouseEvent, action: Action) {
  recording.value = action
  note.value = 'Press the new keys, or Escape to keep these.'
  // Safari doesn't focus a button on click; the keys must reach the table.
  ;(e.currentTarget as HTMLElement).focus()
}

function onRecordKey(e: KeyboardEvent) {
  const action = recording.value
  if (!action) return
  if (e.key === 'Escape') {
    // Escape cancels the recording, not the dialog.
    e.preventDefault()
    e.stopPropagation()
    recording.value = null
    note.value = 'Unchanged.'
    return
  }
  if (e.key === 'Tab') return
  e.preventDefault()
  e.stopPropagation()
  const b = bindingFrom(e)
  if (!b) {
    note.value = 'A shortcut needs Alt, Ctrl or Cmd with a key. Try again, or press Escape.'
    return
  }
  model.value = { ...model.value, [action]: b }
  recording.value = null
  note.value = `Set to ${describe(b)}.`
}
</script>

<template>
  <ZDialog id="zp-shortcuts" :open="open" title="Keyboard shortcuts" @close="onClose">
    <p class="zp-muted">They work while focus is in the player. To change one, choose Change and press the new keys.</p>
    <table @keydown="onRecordKey">
      <thead><tr><th scope="col">Action</th><th scope="col">Keys</th><th scope="col"><span class="zp-sr">Change</span></th></tr></thead>
      <tbody>
        <tr v-for="a in ACTIONS" :key="a.action">
          <th scope="row">{{ a.label }}</th>
          <td class="zp-kbd">{{ describe(model[a.action], mac) }}</td>
          <td>
            <button class="zp-button" type="button" :aria-pressed="recording === a.action" @click="startRecording($event, a.action)">{{ recording === a.action ? 'Press keys…' : 'Change' }}<span class="zp-sr"> {{ a.label }}</span></button>
            <button class="zp-button" type="button" :disabled="!model[a.action].code" @click="model = { ...model, [a.action]: { ...model[a.action], code: null } }">Turn off<span class="zp-sr"> {{ a.label }}</span></button>
          </td>
        </tr>
      </tbody>
    </table>
    <p role="status" class="zp-muted">{{ note }}</p>
    <template #actions>
      <button class="zp-button" type="button" @click="model = { ...DEFAULT_BINDINGS }; note = 'The defaults are back.'">Restore defaults</button>
    </template>
  </ZDialog>
</template>
