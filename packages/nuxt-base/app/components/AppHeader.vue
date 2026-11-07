<script setup lang="ts">
/**
 * The family header: the logo and name (home), then the app's own parts in two slots, then the
 * About menu and the color-mode switch, which every app has.
 *   #context  beside the name: what's open (frotzlens: "/ story.z5"). Hidden on a phone is the app's call.
 *   #actions  before the About menu: the app's own buttons (frotzlens: Go to…, Names, Open another file).
 * The app supplies /logo.svg.
 */
const product = useProduct()
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
      <a :href="product.homeHref" class="flex items-center gap-3" :aria-label="`${product.name} — home`">
        <img src="/logo.svg" alt="" width="36" height="36" class="size-9">
        <!-- On a phone the logo stands for the name (the link is labelled), leaving room for the buttons. -->
        <span class="hidden font-display text-xl font-bold text-highlighted sm:inline">{{ product.name }}</span>
      </a>
      <slot name="context" />
      <div class="ml-auto flex items-center gap-2">
        <slot name="actions" />
        <AboutMenu />
        <UColorModeButton />
      </div>
    </div>
  </header>
</template>
