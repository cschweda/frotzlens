<script setup lang="ts">
/**
 * The upper window beyond a status line (statement O5): menus, maps, quote boxes. Its rows as lines
 * of text, labelled, scrolling sideways inside itself; "Read upper window" announces it on demand.
 */
defineProps<{ rows: string[] }>()
</script>

<template>
  <pre class="zp-upper" role="region" aria-label="Upper window" tabindex="0">{{ rows.join('\n') }}</pre>
</template>
