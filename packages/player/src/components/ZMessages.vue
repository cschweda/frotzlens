<script setup lang="ts">
/**
 * Messages (statements S2, S3): saved, restored, autosaved, exported in a role="status" region;
 * errors in a role="alert" region, in words, saying what to do, with buttons for it.
 */
export interface Message {
  id: number
  text: string
  error?: boolean
  actions?: { label: string; run: () => void }[]
}
defineProps<{ info: Message | null; error: Message | null }>()
</script>

<template>
  <div class="zp-messages">
    <div role="status" data-testid="status-message">
      <p v-if="info" class="zp-message">
        <span>{{ info.text }}</span>
        <button v-for="a in info.actions ?? []" :key="a.label" class="zp-button" type="button" @click="a.run">{{ a.label }}</button>
      </p>
    </div>
    <div role="alert" data-testid="error-message">
      <p v-if="error" class="zp-message zp-message--error">
        <span>{{ error.text }}</span>
        <button v-for="a in error.actions ?? []" :key="a.label" class="zp-button" type="button" @click="a.run">{{ a.label }}</button>
      </p>
    </div>
  </div>
</template>
