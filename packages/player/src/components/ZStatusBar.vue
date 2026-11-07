<script setup lang="ts">
/** The status line, drawn (v3; v4+ the upper window's first row). Announced separately (O4); this is for the eye and for browse mode. */
defineProps<{ left: string; right: string }>()
</script>

<template>
  <div class="zp-statusbar" role="group" aria-label="Status line">
    <span>{{ left }}</span>
    <span v-if="right" class="zp-statusbar__right">{{ right }}</span>
  </div>
</template>
