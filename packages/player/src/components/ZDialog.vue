<script setup lang="ts">
/**
 * A modal dialog on the native <dialog> (statements I4, S4): named by its heading, focus inside
 * while open (the browser keeps it there), Escape and the Close button close it, and focus goes back
 * to the control that opened it. Native, so it works in a shadow root and needs no script tricks.
 */
import { nextTick, useTemplateRef, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; id: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null
/** Whether this opening has been closed already: the native `close` event comes a moment later. */
let closed = true

watch(
  () => props.open,
  async open => {
    await nextTick()
    const d = dialog.value
    if (!d) return
    if (open && !d.open) {
      opener = (d.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null
      closed = false
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  },
)

/**
 * Closed (the Close button, Escape, or the host): tell the parent at once, not when the native
 * `close` event arrives a moment later, so a shortcut pressed straight after isn't still held back.
 */
function onClose() {
  if (closed) return
  closed = true
  emit('close')
  const back = opener
  opener = null
  // After the dialog is gone, focus returns to whatever opened it.
  nextTick(() => back?.focus())
}
</script>

<template>
  <dialog ref="dialog" class="zp-dialog" :aria-labelledby="`${id}-title`" @cancel="onClose" @close="onClose">
    <h2 :id="`${id}-title`">{{ title }}</h2>
    <slot />
    <div class="zp-dialog__actions">
      <slot name="actions" />
      <button class="zp-button" type="button" @click="dialog?.close(); onClose()">Close</button>
    </div>
  </dialog>
</template>
