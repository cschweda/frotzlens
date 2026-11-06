<script setup lang="ts">
import { site } from '~~/site.config'
</script>

<template>
  <footer class="border-t border-default">
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <a :href="site.familyUrl" class="flex items-center gap-2 hover:text-default">
        <img src="/frotzinc-mark.svg" alt="" width="24" height="24" class="size-6">
        <span>From Frotz, Inc.</span>
      </a>
      <nav aria-label="Elsewhere" class="flex gap-4">
        <a :href="site.repoUrl" class="hover:text-default">GitHub</a>
        <a :href="site.npmUrl" class="hover:text-default">npm</a>
      </nav>
      <p class="max-w-md text-xs">
        Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
      </p>
    </div>
  </footer>
</template>
