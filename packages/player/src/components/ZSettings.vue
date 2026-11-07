<script setup lang="ts">
/**
 * Settings (statements O3, O8, R2, R4–R6): theme, font, size, line length, spacing, verbosity,
 * motion and timed input. Every change applies at once and is remembered in this browser.
 */
import type { Settings } from '../settings.js'
import ZDialog from './ZDialog.vue'

withDefaults(defineProps<{ open: boolean; dyslexic?: boolean }>(), { dyslexic: true })
const emit = defineEmits<{ close: [] }>()
const model = defineModel<Settings>({ required: true })

const set = <K extends keyof Settings>(k: K, v: Settings[K]) => (model.value = { ...model.value, [k]: v })

type NumberKey = 'size' | 'lineLength' | 'lineSpacing' | 'letterSpacing'
const GROUPS: { key: NumberKey; legend: string; options: [number, string][] }[] = [
  { key: 'size', legend: 'Text size', options: [90, 100, 115, 130, 150, 175, 200].map(v => [v, `${v}%`]) },
  { key: 'lineLength', legend: 'Line length', options: [[55, 'Narrow'], [70, 'Medium'], [90, 'Wide'], [0, 'Full width']] },
  { key: 'lineSpacing', legend: 'Line spacing', options: [1.4, 1.6, 1.8, 2, 2.4].map(v => [v, String(v)]) },
  { key: 'letterSpacing', legend: 'Letter spacing', options: [[0, 'Normal'], [0.05, 'Wider'], [0.12, 'Widest']] },
]
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
      <label v-for="f in ([['default', 'Standard'], ['dyslexic', 'OpenDyslexic'], ['mono', 'Monospace']] as const).filter(x => dyslexic || x[0] !== 'dyslexic')" :key="f[0]">
        <input type="radio" name="zp-font" :value="f[0]" :checked="model.font === f[0]" @change="set('font', f[0])"> {{ f[1] }}
      </label>
    </fieldset>
    <!-- Radio groups, not <select>s: WebKit's own select markup trips a strict CSP (docs/15 §1). -->
    <fieldset v-for="g in GROUPS" :key="g.key">
      <legend>{{ g.legend }}</legend>
      <label v-for="o in g.options" :key="o[0]">
        <input type="radio" :name="`zp-${g.key}`" :value="o[0]" :checked="model[g.key] === o[0]" @change="set(g.key, o[0])"> {{ o[1] }}
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
