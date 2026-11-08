<script setup lang="ts">
/**
 * frotztrace's page, for now: the family shell around what frotztrace will be. The debugger itself
 * arrives in Phase 4 (docs/frotztrace-design.md §10); this page holds the site, its domain and its
 * Netlify settings in place until then.
 */
import changelog from '../CHANGELOG.md?raw'
import { site } from '~~/site.config'

const main = useTemplateRef<HTMLElement>('main')
function skip(e: MouseEvent) {
  e.preventDefault()
  main.value?.focus()
}

const LINK = 'underline decoration-dotted underline-offset-4 hover:decoration-solid'
const features = [
  { icon: 'i-lucide-play', title: 'Run it under observation', text: 'Play the story while the object tree, globals, memory and disassembly change in front of you, with what just changed lit.' },
  { icon: 'i-lucide-octagon-pause', title: 'Breakpoints', text: 'On a routine, an address, a source line, an Inform action, printed text, or a change to an object’s property or attribute.' },
  { icon: 'i-lucide-layers', title: 'A call stack with names', text: 'Who called whom, with every local’s value; Inform names from the story’s debug file.' },
  { icon: 'i-lucide-undo-2', title: 'Step backwards', text: 'Step into, over, out, and back: every run is deterministic, so any earlier instruction can be replayed exactly.' },
]
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh flex-col">
      <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded focus:bg-elevated focus:px-3 focus:py-2" @click="skip">Skip to content</a>
      <AppHeader />
      <main id="main" ref="main" tabindex="-1" class="flex-1 focus:outline-none">
        <div class="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-8">
          <div class="flex flex-col gap-3">
            <p class="data text-sm text-lamp">Coming soon</p>
            <h1 class="font-display text-3xl font-bold text-highlighted sm:text-4xl">A debugger for Z-machine stories</h1>
            <p class="max-w-2xl text-lg">
              Open a story file, press Run, and watch it work. frotztrace runs any version 3, 4, 5 or 8 story in your
              browser, with breakpoints, watches and a live view of everything inside it. With Inform’s debug file and
              source, it’s a source-level debugger for Inform 6. Nothing is uploaded.
            </p>
          </div>

          <section aria-labelledby="what-title" class="flex flex-col gap-4">
            <h2 id="what-title" class="font-display text-2xl font-semibold text-highlighted">What it will do</h2>
            <ul class="grid gap-3 sm:grid-cols-2">
              <li v-for="f in features" :key="f.title" class="flex flex-col gap-2 rounded-xl border border-default bg-muted px-5 py-4">
                <span class="flex items-center gap-2 font-semibold text-highlighted">
                  <UIcon :name="f.icon" class="size-5 shrink-0 text-lamp" aria-hidden="true" />{{ f.title }}
                </span>
                <span class="text-sm text-muted">{{ f.text }}</span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="now-title" class="flex flex-col gap-3">
            <h2 id="now-title" class="font-display text-2xl font-semibold text-highlighted">Until then</h2>
            <p class="max-w-2xl">
              <a href="https://frotzlens.frotzinc.com" :class="LINK">frotzlens</a> shows everything inside a story file at rest,
              <a href="https://frotzplay.frotzinc.com" :class="LINK">frotzplay</a> plays it, and
              <a href="https://frotzsmith.com" :class="LINK">frotzsmith</a> writes it. frotztrace is built on the same
              code, and is being made in the open: read <a :href="site.designUrl" :class="LINK">its design</a>.
            </p>
          </section>
        </div>
      </main>
      <AppFooter />
      <AboutDialogs :changelog="changelog" />
    </div>
  </UApp>
</template>
