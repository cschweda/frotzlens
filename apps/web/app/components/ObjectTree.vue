<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

/**
 * The object tree, as an ARIA tree (WAI-ARIA APG "tree view"): one tab stop;
 * Up/Down move, Right opens or goes to the first child, Left closes or goes to
 * the parent, Home/End, Enter/Space opens the object, and typing a letter
 * jumps to the next object whose name starts with it. Rendered flat, with
 * aria-level, so only open branches are in the DOM.
 */
const props = defineProps<{ story: StoryFile; selected?: number }>()

const objects = computed(() => props.story.objects.objects)
const count = computed(() => objects.value.length)
const get = (n: number) => (n >= 1 && n <= count.value ? objects.value[n - 1] : undefined)

/** Children of each object, by following child then sibling; a cycle (a broken file) stops the walk. */
const children = computed(() => {
  const out = new Map<number, number[]>()
  for (const o of objects.value) {
    const list: number[] = []
    const seen = new Set<number>()
    for (let c = o.child; get(c) && !seen.has(c); c = get(c)!.sibling) {
      seen.add(c)
      list.push(c)
    }
    out.set(o.number, list)
  }
  return out
})
const roots = computed(() => objects.value.filter(o => !get(o.parent)).map(o => o.number))

const open = ref(new Set<number>())
// Rooms (the roots' children are their contents) start open; so does the path to the selected object.
watch(roots, r => (open.value = new Set(r.filter(n => (children.value.get(n)?.length ?? 0) > 0))), { immediate: true })
watch(() => props.selected, (n) => {
  const next = new Set(open.value)
  const seen = new Set<number>()
  for (let p = get(n ?? 0)?.parent ?? 0; get(p) && !seen.has(p); p = get(p)!.parent) {
    seen.add(p)
    next.add(p)
  }
  open.value = next
}, { immediate: true })

interface Row { n: number; level: number; setSize: number; posInSet: number; parent: number }
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (list: number[], level: number, parent: number, path: Set<number>) => {
    list.forEach((n, i) => {
      out.push({ n, level, setSize: list.length, posInSet: i + 1, parent })
      if (open.value.has(n) && !path.has(n)) walk(children.value.get(n) ?? [], level + 1, n, new Set(path).add(n))
    })
  }
  walk(roots.value, 1, 0, new Set())
  return out
})

const focused = ref(0)
watch(() => props.selected, (n) => {
  const i = rows.value.findIndex(r => r.n === n)
  if (i >= 0) focused.value = i
}, { immediate: true, flush: 'post' })

const tree = useTemplateRef<HTMLElement>('tree')
function focusRow(i: number) {
  focused.value = Math.max(0, Math.min(rows.value.length - 1, i))
  nextTick(() => tree.value?.querySelector<HTMLElement>(`[data-row="${focused.value}"]`)?.focus())
}
function toggle(n: number) {
  const next = new Set(open.value)
  if (next.has(n)) next.delete(n)
  else next.add(n)
  open.value = next
}
const hasChildren = (n: number) => (children.value.get(n)?.length ?? 0) > 0
const name = (n: number) => objectName(props.story, n)
const go = (n: number) => (location.hash = `object/${n}`)

function onKey(e: KeyboardEvent) {
  const r = rows.value[focused.value]
  if (!r) return
  switch (e.key) {
    case 'ArrowDown': focusRow(focused.value + 1); break
    case 'ArrowUp': focusRow(focused.value - 1); break
    case 'Home': focusRow(0); break
    case 'End': focusRow(rows.value.length - 1); break
    case 'ArrowRight':
      if (!hasChildren(r.n)) return
      if (!open.value.has(r.n)) toggle(r.n)
      else focusRow(focused.value + 1)
      break
    case 'ArrowLeft':
      if (open.value.has(r.n) && hasChildren(r.n)) toggle(r.n)
      else if (r.parent) focusRow(rows.value.findIndex(x => x.n === r.parent))
      else return
      break
    case 'Enter':
    case ' ':
      go(r.n)
      break
    default: {
      // Type-ahead: the next object (after this one) whose name starts with the letter.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      const len = rows.value.length
      for (let j = 1; j <= len; j++) {
        const i = (focused.value + j) % len
        if (name(rows.value[i]!.n).toLowerCase().startsWith(k)) {
          focusRow(i)
          break
        }
      }
    }
  }
  e.preventDefault()
}
</script>

<template>
  <ul ref="tree" role="tree" aria-label="Object tree" class="flex flex-col py-1 text-sm" @keydown="onKey">
    <li
      v-for="(r, i) in rows"
      :key="`${r.parent}-${r.n}`"
      role="treeitem"
      :data-row="i"
      :aria-level="r.level"
      :aria-setsize="r.setSize"
      :aria-posinset="r.posInSet"
      :aria-expanded="hasChildren(r.n) ? open.has(r.n) : undefined"
      :aria-selected="r.n === selected"
      :tabindex="i === focused ? 0 : -1"
      class="flex cursor-pointer items-center gap-1 rounded py-1 pr-2 outline-offset-[-2px] hover:bg-elevated"
      :class="r.n === selected ? 'bg-elevated font-semibold text-highlighted' : ''"
      :style="{ paddingLeft: `${(r.level - 1) * 1.1 + 0.25}rem` }"
      @click="focused = i; go(r.n)"
    >
      <span
        class="inline-flex size-5 shrink-0 items-center justify-center text-muted"
        aria-hidden="true"
        @click.stop="hasChildren(r.n) && toggle(r.n)"
      >
        <UIcon v-if="hasChildren(r.n)" :name="open.has(r.n) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
      </span>
      <span class="truncate">{{ name(r.n) }}</span>
      <span class="data ml-auto pl-2 text-xs text-muted">{{ r.n }}</span>
    </li>
  </ul>
</template>
