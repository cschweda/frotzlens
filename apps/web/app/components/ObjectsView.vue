<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'
import { unpack } from '@frotzinc/zcode'
import { formatObjects, formatTree } from '@frotzinc/zcode/format'

/** The object tree, and one object's attributes, properties, links and referrers. */
const props = defineProps<{ story: StoryFile; fileName: string; id?: string }>()

const n = computed(() => (props.id && /^\d+$/.test(props.id) ? Number(props.id) : undefined))
const object = computed(() => (n.value ? props.story.objects.objects[n.value - 1] : undefined))
const v = computed(() => props.story.header.version)
const attributeCount = computed(() => (v.value <= 3 ? 32 : 48))

const copyAll = () => `${formatObjects(props.story, { fileName: props.fileName })}${formatTree(props.story, { fileName: props.fileName, continuation: true })}`

/**
 * What a property's bytes may mean: each word that is exactly a routine's or
 * string's packed address, or a dictionary word's address (Inform's `name`).
 * Only what resolves to something real is shown; the rest stays bytes.
 */
function meanings(data: number[]): string[] {
  const s = props.story
  const idx = storyIndex(s)
  const ver = s.header.version as Parameters<typeof unpack>[1]
  const out: string[] = []
  // Whole words only: an odd-sized property's last byte is left as a byte.
  for (let i = 0; i + 1 < data.length; i += 2) {
    const w = (data[i]! << 8) | data[i + 1]!
    if (!w) continue
    if (idx.dictByAddress.has(w)) out.push(`dict:${hex(w)}`)
    else if (ver !== 6 && ver !== 7) {
      const a = unpack(w, ver)
      if (idx.routineNumber.has(a)) out.push(`routine:${hex(a)}`)
      else if (idx.stringNumber.has(a)) out.push(`string:${hex(a)}`)
    }
  }
  return out
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ViewHeader
      :title="object ? objectName(story, object.number) : 'Objects'"
      :eyebrow="object ? `Object ${object.number}` : fileName"
      :back="object ? { to: '#objects', label: 'All objects' } : undefined"
      :copy="copyAll"
      copy-label="Copy objects and tree (infodump)"
    >
      <template v-if="!object">
        Every object, as the tree the game starts with: rooms at the top, what's in them below. Use the arrow
        keys to move through the tree, Enter to open an object.
      </template>
    </ViewHeader>

    <div class="grid gap-6 lg:grid-cols-[minmax(14rem,20rem)_1fr]">
      <div class="max-h-[70vh] overflow-auto rounded-xl border border-default bg-muted p-2 lg:sticky lg:top-20" :class="object ? 'order-2 lg:order-1' : ''">
        <ObjectTree :story="story" :selected="object?.number" />
      </div>

      <div v-if="object" class="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
        <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
          <dt class="text-muted">Parent</dt>
          <dd><RefLink v-if="object.parent" :story="story" :id="`object:${object.parent}`" /><span v-else>—</span></dd>
          <dt class="text-muted">First child</dt>
          <dd><RefLink v-if="object.child" :story="story" :id="`object:${object.child}`" /><span v-else>—</span></dd>
          <dt class="text-muted">Next sibling</dt>
          <dd><RefLink v-if="object.sibling" :story="story" :id="`object:${object.sibling}`" /><span v-else>—</span></dd>
          <dt class="text-muted">Property table</dt>
          <dd class="data">{{ hex(object.propertyTable) }}</dd>
        </dl>

        <section aria-labelledby="attr-title" class="flex flex-col gap-3">
          <h2 id="attr-title" class="font-display text-xl font-semibold text-highlighted">Attributes</h2>
          <p>{{ object.attributes.length ? `Set: ${object.attributes.join(', ')}` : 'None set.' }}</p>
          <!-- The flag row: a picture of the same list (every attribute, the set ones lit). -->
          <div class="flex flex-wrap gap-1" aria-hidden="true">
            <span
              v-for="a in attributeCount"
              :key="a"
              class="data inline-flex h-7 w-8 items-center justify-center rounded text-xs"
              :class="object.attributes.includes(a - 1) ? 'bg-[var(--frotz-lamp-text)] font-semibold text-[var(--frotz-ground)]' : 'border border-default text-muted'"
            >{{ a - 1 }}</span>
          </div>
        </section>

        <section aria-labelledby="prop-title" class="flex flex-col gap-3">
          <h2 id="prop-title" class="font-display text-xl font-semibold text-highlighted">Properties</h2>
          <p v-if="!object.properties.length" class="text-muted">None.</p>
          <div v-else class="overflow-x-auto rounded-xl border border-default">
            <table class="w-full text-sm">
              <caption class="sr-only">Properties of {{ objectName(story, object.number) }}</caption>
              <thead class="bg-muted text-left text-muted">
                <tr>
                  <th scope="col" class="px-4 py-2 text-right font-semibold">Property</th>
                  <th scope="col" class="px-4 py-2 text-right font-semibold">Size</th>
                  <th scope="col" class="px-4 py-2 font-semibold">Bytes</th>
                  <th scope="col" class="px-4 py-2 font-semibold">Points to</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in object.properties" :key="p.number" class="border-t border-default align-top">
                  <td class="data px-4 py-1.5 text-right">{{ p.number }}</td>
                  <td class="data px-4 py-1.5 text-right text-muted">{{ p.size }}</td>
                  <td class="data px-4 py-1.5">{{ p.data.map(b => hex(b, 2)).join(' ') }}</td>
                  <td class="px-4 py-1.5">
                    <span class="flex flex-wrap gap-x-3">
                      <RefLink v-for="(m, i) in meanings(p.data)" :key="i" :story="story" :id="m" class="inline-flex min-h-6 items-center" />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <Referrers :story="story" :id="object.id" />
      </div>
      <p v-else-if="id" class="text-muted">There's no object {{ id }} in this file.</p>
    </div>
  </div>
</template>
