<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/** ⌘K / Ctrl+K: jump to any routine, object, string, dictionary word or global, by name or address. */
const props = defineProps<{ story: StoryFile }>()
const open = defineModel<boolean>('open', { default: false })
const { goToId } = useHashRoute()
const hex4 = (n: number) => n.toString(16).padStart(4, '0')
const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 70)}…` : s).replace(/\s+/g, ' ')

const groups = computed(() => {
  const s = props.story
  const pick = (id: string) => () => {
    open.value = false
    goToId(id)
  }
  return [
    {
      id: 'objects',
      label: 'Objects',
      items: s.objects.objects.map(o => ({ label: o.shortName.text || `(object ${o.number})`, suffix: `#${o.number}`, icon: 'i-lucide-box', onSelect: pick(o.id) })),
    },
    {
      id: 'routines',
      label: 'Routines',
      // With names on, a routine is found by its source name, and by its R-number too.
      items: s.code.routines.map((r, i) => {
        const txd = `R${String(i + 1).padStart(4, '0')}`
        const name = routineName(s, r.address)
        return { label: name, ...(name !== txd ? { text: txd } : {}), suffix: hex4(r.address), icon: 'i-lucide-code', onSelect: pick(r.id) }
      }),
    },
    {
      id: 'dictionary',
      label: 'Dictionary',
      items: s.dictionary.entries.map(e => ({ label: e.word, suffix: hex4(e.address), icon: 'i-lucide-book-a', onSelect: pick(e.id) })),
    },
    {
      id: 'globals',
      label: 'Globals',
      items: s.globals.map(g => ({ label: globalName(g.number), text: `G${g.number.toString(16).padStart(2, '0')}`, suffix: hex4(g.address), icon: 'i-lucide-variable', onSelect: pick(g.id) })),
    },
    {
      id: 'strings',
      label: 'Strings',
      // Shown clipped, searched whole: `text` is a search key, not displayed.
      items: s.strings.map(x => ({ label: clip(x.text), text: x.text, suffix: hex4(x.address), icon: 'i-lucide-quote', onSelect: pick(x.id) })),
    },
  ]
})
</script>

<template>
  <UModal v-model:open="open" title="Go to" description="Find a routine, object, string, dictionary word or global by name or address.">
    <template #content>
      <UCommandPalette :groups="groups" placeholder="Search by name or address…" class="h-96" :fuse="{ resultLimit: 40, fuseOptions: { keys: ['label', 'suffix', 'text'] } }" @update:open="open = $event" />
    </template>
  </UModal>
</template>
