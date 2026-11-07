<script setup lang="ts">
/**
 * The command line (statements I1–I3, O8): a labelled input that keeps focus, history on ↑/↓, and,
 * when the story wants a key (@read_char), the same control takes the key. A timed read shows how
 * long is left, with a Pause button.
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { keyToZscii } from '../keys.js'

const props = defineProps<{
  mode: 'line' | 'char' | 'busy' | 'ended'
  maxLength?: number
  /** A timed read is counting down: the notice to show, and whether it's paused. */
  timed?: { notice: string; paused: boolean } | null
}>()
const emit = defineEmits<{ line: [text: string]; key: [code: number, label: string]; pause: [] }>()

const input = useTemplateRef<HTMLInputElement>('input')
const value = ref('')
const history: string[] = []
let back = -1

const label = computed(() => (props.mode === 'char' ? 'Press any key' : 'Command'))
const hint = computed(() =>
  props.mode === 'char' ? 'The story is waiting for a key: press any key.' : props.mode === 'ended' ? 'The story has ended.' : '',
)

function submit() {
  if (props.mode !== 'line') return
  const text = value.value
  if (text.trim()) {
    history.push(text)
    if (history.length > 100) history.shift()
  }
  back = -1
  value.value = ''
  emit('line', text)
}

function onKeydown(e: KeyboardEvent) {
  if (props.mode === 'char') {
    // Tab keeps moving focus (no keyboard trap, 2.1.2); modifier chords are for shortcuts.
    if (e.key === 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return
    const code = keyToZscii(e)
    if (code === null) return
    e.preventDefault()
    emit('key', code, e.key === ' ' ? 'Space' : e.key)
    return
  }
  if (e.key === 'ArrowUp' && history.length) {
    e.preventDefault()
    back = back < 0 ? history.length - 1 : Math.max(0, back - 1)
    value.value = history[back]!
  } else if (e.key === 'ArrowDown' && back >= 0) {
    e.preventDefault()
    back = back + 1 < history.length ? back + 1 : -1
    value.value = back < 0 ? '' : history[back]!
  }
}

/** Put focus in the command line (at start, and when the host asks: the skip link). */
function focus() {
  nextTick(() => input.value?.focus())
}

// When the story starts waiting for a key, the input's text is kept for later.
watch(
  () => props.mode,
  () => (back = -1),
)

defineExpose({ focus })
</script>

<template>
  <form class="zp-command" aria-label="Command line" @submit.prevent="submit">
    <div class="zp-command__row">
      <span class="zp-command__prompt" aria-hidden="true">&gt;</span>
      <label class="zp-sr" for="zp-command-input">{{ label }}</label>
      <input
        id="zp-command-input"
        ref="input"
        v-model="value"
        class="zp-command__input"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="send"
        :maxlength="maxLength && maxLength > 0 ? maxLength : undefined"
        :readonly="mode === 'char'"
        :aria-describedby="hint || timed ? 'zp-command-hint' : undefined"
        @keydown="onKeydown"
      >
      <button class="zp-button zp-button--primary" type="submit" :disabled="mode !== 'line'">Enter</button>
    </div>
    <p v-if="hint || timed" id="zp-command-hint" class="zp-command__hint">
      <span v-if="hint">{{ hint }} </span>
      <span v-if="timed">{{ timed.notice }}</span>
      <button v-if="timed" class="zp-button" type="button" :aria-pressed="timed.paused" @click="emit('pause')">{{ timed.paused ? 'Resume timer' : 'Pause timer' }}</button>
    </p>
  </form>
</template>
