<script setup lang="ts">
/** The family footer: frotz, Inc., the changelog, the source and npm, and the version (About). */
const product = useProduct()
const { show } = useAbout()
const version = (useRuntimeConfig().public.about as { version: string }).version
</script>

<template>
  <footer class="border-t border-default">
    <div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <a :href="product.familyUrl" class="flex items-center gap-2 hover:text-default">
        <img src="/frotzinc-mark.svg" alt="" width="24" height="24" class="size-6">
        <span>From frotz, Inc.</span>
      </a>
      <nav aria-label="Elsewhere" class="flex gap-4">
        <button type="button" class="hover:text-default" @click="show('changelog')">Changelog</button>
        <a :href="product.repoUrl" class="hover:text-default">GitHub</a>
        <a :href="product.npmUrl" class="hover:text-default">npm</a>
        <button type="button" class="data hover:text-default" :aria-label="`About ${product.name}, v${version}`" @click="show('about')">v{{ version }}</button>
      </nav>
      <p class="max-w-md text-xs">
        frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
      </p>
    </div>
  </footer>
</template>
