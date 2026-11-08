<script setup lang="ts">
import type { NavView } from '@frotzinc/zcode-ui/utils/nav'

/** frotztrace's views, in the shared AppNav (a .vue file: Nuxt Icon bundles only icons it finds in .vue files). */
const props = defineProps<{ view: string }>()
const SECTION: Record<string, string> = { routine: 'code', object: 'objects', global: 'globals' }
const active = computed(() => SECTION[props.view] ?? props.view)
const session = useSession()
const views = computed<NavView[]>(() => {
  const l = session.live()
  return [
    { key: 'stack', label: 'Stack', icon: 'i-lucide-layers', count: l?.stack.length },
    { key: 'code', label: 'Code', icon: 'i-lucide-code' },
    { key: 'objects', label: 'Objects', icon: 'i-lucide-box' },
    { key: 'globals', label: 'Globals', icon: 'i-lucide-variable' },
    { key: 'memory', label: 'Memory', icon: 'i-lucide-binary' },
    { key: 'breakpoints', label: 'Breakpoints', icon: 'i-lucide-octagon-pause', count: l?.breakpoints.length },
    { key: 'trace', label: 'Trace', icon: 'i-lucide-list-tree' },
  ]
})
</script>

<template>
  <AppNav :views="views" :active="active" />
</template>
