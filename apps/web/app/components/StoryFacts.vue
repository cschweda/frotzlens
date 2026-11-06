<script setup lang="ts">
import type { StoryFile } from '@frotzinc/zcode'

const props = defineProps<{ story: StoryFile; fileName: string }>()
const { symbols, symbolsFile } = useSymbols()

/**
 * What the file says about itself, and what its code shows: the compiler's mark in the header, the
 * library's banner, Inform's veneer routines. Nothing here is guessed.
 */
const facts = computed(() => {
  const { header: h, grammar, fingerprint: fp, blorb } = props.story
  type Row = [string, string, string?] // label, text, link
  const rows: Row[] = [
    ['Z-machine version', String(h.version)],
    ['Release / serial', `${h.release} / ${h.serial}`],
    ['Compiler', fp?.compiler === 'zilf' ? `ZILF ${fp.compilerVersion ?? ''}`.trim() : h.inform ? `Inform ${h.inform.compilerVersion}` : 'Not recorded'],
  ]
  if (fp?.library) rows.push(['Library', `${fp.library.name}${fp.library.version ? ` ${fp.library.version}` : ''}`])
  if (fp?.compiler === 'inform6') {
    const n = Object.keys(fp.veneer).length
    rows.push(["Inform's veneer", `${n} routine${n === 1 ? '' : 's'} recognised`])
  }
  if (grammar) {
    rows.push(['Grammar', `Inform grammar version ${grammar.version}${grammar.version === 3 ? ' (as PunyInform writes it)' : ''}`])
  }
  if (blorb) {
    const pictures = blorb.resources.filter(r => r.usage === 'Pict').length
    const sounds = blorb.resources.filter(r => r.usage === 'Snd ').length
    rows.push(['Container', `Blorb: the story, ${pictures} picture${pictures === 1 ? '' : 's'}, ${sounds} sound${sounds === 1 ? '' : 's'}${blorb.frontispiece !== undefined ? ' (picture ' + blorb.frontispiece + ' is the cover)' : ''}`])
    if (blorb.title) rows.push(['Title', blorb.title])
    if (blorb.author) rows.push(['Author', blorb.author])
  }
  // A truncated file is never summed: say so rather than "does not match".
  const sum = h.checksum.toString(16).padStart(4, '0')
  const mismatch = props.story.errors.some(e => e.code === 'checksum')
  rows.push(['Checksum', h.checksumOk ? `${sum}, correct` : mismatch ? `${sum}, does not match` : `${sum}, not checked`])
  rows.push(symbols.value ? ['Debug symbols', `Loaded from ${symbolsFile.value}`, '#symbols'] : ['Debug symbols', fp?.compiler === 'inform6' ? 'Not loaded: load gameinfo.dbg' : 'Not loaded', fp?.compiler === 'inform6' ? '#symbols' : undefined])
  return rows
})
</script>

<template>
  <section aria-labelledby="facts-title" class="flex flex-col gap-4">
    <h2 id="facts-title" class="font-display text-2xl font-semibold text-highlighted sm:text-[1.6rem]">What is this file</h2>
    <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border border-default bg-muted p-5">
      <template v-for="[k, v, to] in facts" :key="k">
        <dt class="text-muted">{{ k }}</dt>
        <dd class="text-default"><a v-if="to" :href="to" class="text-lamp hover:underline">{{ v }}</a><template v-else>{{ v }}</template></dd>
      </template>
    </dl>
  </section>
</template>
