<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import type { NavView } from '@frotzinc/zcode-ui/utils/nav'

/**
 * frotzlens's views, in the shared AppNav: which ones this story has, with their counts. (A .vue
 * file, not a composable, on purpose: Nuxt Icon bundles only the icons it finds in .vue files, and
 * the CSP blocks fetching any it missed.)
 */
const props = defineProps<{ story: StoryFile; view: string }>()

/** A detail route belongs to its list's entry. */
const SECTION: Record<string, string> = { object: 'objects', dict: 'dictionary', routine: 'routines', string: 'strings', global: 'globals' }
const active = computed(() => SECTION[props.view] ?? props.view)

const { symbols } = useSymbols()
const views = computed<NavView[]>(() => {
  const s = props.story
  const inform = s.fingerprint?.compiler === 'inform6'
  return [
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
})
</script>

<template>
  <AppNav :views="views" :active="active" />
</template>
