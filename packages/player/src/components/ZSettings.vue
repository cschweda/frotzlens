<script setup lang="ts">
/**
 * Settings (statements O3, O8, R2, R4–R6): theme, font, size, line length, spacing, verbosity,
 * motion and timed input. Every change applies at once and is remembered in this browser.
 */
import type { Settings } from '../settings.js'
import ZDialog from './ZDialog.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const model = defineModel<Settings>({ required: true })

const set = <K extends keyof Settings>(k: K, v: Settings[K]) => (model.value = { ...model.value, [k]: v })
</script>

<template>
  <ZDialog id="zp-settings" :open="open" title="Settings" @close="emit('close')">
    <fieldset>
      <legend>Theme</legend>
      <label v-for="t in [['dark', 'Dark'], ['light', 'Light'], ['high-contrast', 'High contrast']] as const" :key="t[0]">
        <input type="radio" name="zp-theme" :value="t[0]" :checked="model.theme === t[0]" @change="set('theme', t[0])"> {{ t[1] }}
      </label>
    </fieldset>
    <fieldset>
      <legend>Font</legend>
      <label v-for="f in [['default', 'Standard'], ['dyslexic', 'OpenDyslexic'], ['mono', 'Monospace']] as const" :key="f[0]">
        <input type="radio" name="zp-font" :value="f[0]" :checked="model.font === f[0]" @change="set('font', f[0])"> {{ f[1] }}
      </label>
    </fieldset>
    <fieldset>
      <legend>Text</legend>
      <label>Size
        <select :value="model.size" @change="set('size', Number(($event.target as HTMLSelectElement).value))">
          <option v-for="s in [90, 100, 115, 130, 150, 175, 200]" :key="s" :value="s">{{ s }}%</option>
        </select>
      </label>
      <label>Line length
        <select :value="model.lineLength" @change="set('lineLength', Number(($event.target as HTMLSelectElement).value))">
          <option :value="55">Narrow</option>
          <option :value="70">Medium</option>
          <option :value="90">Wide</option>
          <option :value="0">Full width</option>
        </select>
      </label>
      <label>Line spacing
        <select :value="model.lineSpacing" @change="set('lineSpacing', Number(($event.target as HTMLSelectElement).value))">
          <option v-for="s in [1.4, 1.6, 1.8, 2, 2.4]" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label>Letter spacing
        <select :value="model.letterSpacing" @change="set('letterSpacing', Number(($event.target as HTMLSelectElement).value))">
          <option :value="0">Normal</option>
          <option :value="0.05">Wider</option>
          <option :value="0.12">Widest</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>What the screen reader says each turn</legend>
      <label v-for="v in [['standard', 'The story’s reply'], ['full', 'Everything, with your command'], ['terse', 'The reply; status only when asked']] as const" :key="v[0]">
        <input type="radio" name="zp-verbosity" :value="v[0]" :checked="model.verbosity === v[0]" @change="set('verbosity', v[0])"> {{ v[1] }}
      </label>
    </fieldset>
    <fieldset>
      <legend>Motion and time</legend>
      <label><input type="checkbox" :checked="model.motion === 'reduce'" @change="set('motion', ($event.target as HTMLInputElement).checked ? 'reduce' : 'system')"> Reduce motion</label>
      <label><input type="checkbox" :checked="model.timedInput === 'off'" @change="set('timedInput', ($event.target as HTMLInputElement).checked ? 'off' : 'on')"> Turn off the story’s timers</label>
    </fieldset>
  </ZDialog>
</template>
