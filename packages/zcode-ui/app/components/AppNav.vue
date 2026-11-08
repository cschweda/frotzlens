<script setup lang="ts">
import type { NavView } from '../utils/nav'

/**
 * The views, left of the content on wide screens and a scrolling row above it on narrow ones. Each
 * app supplies its own list; `active` is the key of the view being shown.
 */
const props = defineProps<{ views: NavView[]; active: string }>()

// On a narrow screen the nav is a scrolling row: keep the current view in sight.
const nav = useTemplateRef<HTMLElement>('nav')
watch(() => props.active, () => nextTick(() => nav.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })), { immediate: true })
</script>

<template>
  <nav ref="nav" aria-label="Views" class="lg:sticky lg:top-20 lg:self-start">
    <ul class="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:w-52 lg:flex-col lg:overflow-visible">
      <li v-for="v in views" :key="v.key">
        <a
          :href="`#${v.key}`"
          :aria-current="active === v.key ? 'page' : undefined"
          class="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-elevated"
          :class="active === v.key ? 'bg-elevated font-semibold text-highlighted' : 'text-muted'"
        >
          <UIcon :name="v.icon" class="size-4 shrink-0" :class="active === v.key ? 'text-lamp' : ''" aria-hidden="true" />
          {{ v.label }}
          <span v-if="v.count !== undefined" class="data ml-auto pl-2 text-xs text-muted">{{ v.count }}</span>
          <span v-else-if="v.tag" class="ml-auto rounded-full border border-default px-1.5 text-xs text-muted">{{ v.tag }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
