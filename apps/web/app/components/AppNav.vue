<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** The views, left of the content on wide screens and a scrolling row above it on narrow ones. */
const props = defineProps<{ story: StoryFile; view: string }>()

/** A detail route belongs to its list's entry. */
const SECTION: Record<string, string> = { object: 'objects', dict: 'dictionary', routine: 'routines', string: 'strings', global: 'globals' }
const active = computed(() => SECTION[props.view] ?? props.view)

// On a narrow screen the nav is a scrolling row: keep the current view in sight.
const nav = useTemplateRef<HTMLElement>('nav')
watch(active, () => nextTick(() => nav.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })), { immediate: true })

const { symbols } = useSymbols()
const views = computed(() => {
  const s = props.story
  const inform = s.fingerprint?.compiler === 'inform6'
  const list: { key: string; label: string; icon: string; count?: number; tag?: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
    { key: 'play', label: 'Play', icon: 'i-lucide-gamepad-2' },
    { key: 'memory', label: 'Memory', icon: 'i-lucide-binary' },
    { key: 'objects', label: 'Objects', icon: 'i-lucide-box', count: s.objects.objects.length },
    { key: 'dictionary', label: 'Dictionary', icon: 'i-lucide-book-a', count: s.dictionary.entries.length },
    ...(s.grammar || s.zilGrammar ? [{ key: 'grammar', label: 'Grammar', icon: 'i-lucide-git-fork', count: (s.grammar ?? s.zilGrammar)!.verbs.length }] : []),
    { key: 'routines', label: 'Routines', icon: 'i-lucide-code', count: s.code.routines.length },
    { key: 'strings', label: 'Strings', icon: 'i-lucide-quote', count: s.strings.length },
    { key: 'globals', label: 'Globals', icon: 'i-lucide-variable', count: s.globals.length },
    ...(s.abbreviations.length ? [{ key: 'abbreviations', label: 'Abbreviations', icon: 'i-lucide-text-cursor-input', count: s.abbreviations.length }] : []),
    // Symbols: for an Inform story, or once loaded; the map needs them.
    ...(inform || symbols.value ? [{ key: 'symbols', label: 'Symbols', icon: 'i-lucide-tag' }] : []),
    ...(symbols.value ? [{ key: 'map', label: 'Map', icon: 'i-lucide-map' }] : []),
    // Source: an Inform story decompiled to Inform 6 (Phase 6).
    ...(inform ? [{ key: 'source', label: 'Source', icon: 'i-lucide-file-code' }] : []),
  ]
  return list
})
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
