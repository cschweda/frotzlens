/**
 * Names for the things in a story, as txd and infodump print them (R0001,
 * S001, an object's short name, a dictionary word), and the hash route for any
 * model Id. Worked out once per story and cached.
 */
import type { StoryFile } from '@frotzinc/zcode'

export const hex = (n: number, width = 4) => n.toString(16).padStart(width, '0')

/** The hash route for a model Id: `routine:27f8` → `#routine/27f8`. */
export const idRoute = (id: string) => `#${id.replace(':', '/')}`

interface Index {
  routineNumber: Map<number, number>
  stringNumber: Map<number, number>
  stringByAddress: Map<number, { text: string }>
  dictByAddress: Map<number, { word: string }>
}

const cache = new WeakMap<StoryFile, Index>()

export function storyIndex(story: StoryFile): Index {
  let i = cache.get(story)
  if (!i) {
    i = {
      routineNumber: new Map(story.code.routines.map((r, n) => [r.address, n + 1])),
      stringNumber: new Map(story.strings.map((s, n) => [s.address, n + 1])),
      stringByAddress: new Map(story.strings.map(s => [s.address, s])),
      dictByAddress: new Map(story.dictionary.entries.map(e => [e.address, e])),
    }
    cache.set(story, i)
  }
  return i
}

export const routineName = (story: StoryFile, address: number) => {
  const n = storyIndex(story).routineNumber.get(address)
  return n === undefined ? hex(address) : `R${String(n).padStart(4, '0')}`
}

export const stringName = (story: StoryFile, address: number) => {
  const n = storyIndex(story).stringNumber.get(address)
  return n === undefined ? hex(address) : `S${String(n).padStart(3, '0')}`
}

export const objectName = (story: StoryFile, n: number) =>
  story.objects.objects[n - 1]?.shortName.text || `object ${n}`

export const clip = (s: string, n = 60) => {
  const one = s.replace(/\s+/g, ' ')
  return one.length > n ? `${one.slice(0, n)}…` : one
}

/** A short, readable label for any model Id. */
export function idLabel(story: StoryFile, id: string): string {
  const [kind, rest = ''] = id.split(':')
  const n = parseInt(rest, kind === 'object' || kind === 'global' || kind === 'abbrev' ? 10 : 16)
  switch (kind) {
    case 'routine': return routineName(story, n)
    case 'string': {
      const s = storyIndex(story).stringByAddress.get(n)
      return s ? `${stringName(story, n)} “${clip(s.text, 40)}”` : stringName(story, n)
    }
    case 'object': return `${objectName(story, n)} (#${n})`
    case 'dict': {
      const e = storyIndex(story).dictByAddress.get(n)
      return e ? `“${e.word}”` : `word at ${hex(n)}`
    }
    case 'global': return `G${hex(n, 2)}`
    default: return id
  }
}

/** Show a long list a page at a time: `shown` is the first `limit`, `more()` adds a page. */
export function useLimit<T>(list: () => T[], step = 200) {
  const limit = ref(step)
  const shown = computed(() => list().slice(0, limit.value))
  const remaining = computed(() => Math.max(0, list().length - limit.value))
  const more = () => (limit.value += step * 2)
  return { shown, remaining, more, reset: () => (limit.value = step) }
}
