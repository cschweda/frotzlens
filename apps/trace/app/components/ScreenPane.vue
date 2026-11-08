<script setup lang="ts">
import { ZCommandLine, ZRuns, ZStatusBar, ZTranscript, ZUpperWindow } from '@frotzinc/player'

/**
 * The game (docs/21 §2): @frotzinc/player's components drawing the screen the session records, so it
 * reads and behaves as frotzplay does. Stopped mid-turn (a breakpoint, a step), the turn so far is
 * shown below the transcript. A sample's walkthrough can type the next command.
 */
const session = useSession()
const s = session.state
const screen = session.screen

const sc = computed(() => {
  void s.tick
  return screen.value?.state ?? null
})
const pending = computed(() => {
  void s.tick
  return s.running || !sc.value || sc.value.phase === 'line' || sc.value.phase === 'char' ? [] : screen.value!.pending()
})
const mode = computed(() => {
  const p = sc.value?.phase
  return s.running ? 'busy' : p === 'line' ? 'line' : p === 'char' ? 'char' : p === 'quit' || p === 'fault' ? 'ended' : 'busy'
})
const maxLength = computed(() => (sc.value?.waiting?.kind === 'input-line' ? sc.value.waiting.maxLength : undefined))
const next = computed(() => {
  void s.tick
  return mode.value === 'line' ? session.nextWalkthroughCommand() : undefined
})
async function typeNext() {
  const c = next.value
  if (c === undefined) return
  s.nextCommand++
  await session.submitLine(c)
}
/** The player's theme follows the site's colour mode (frotzplay's palette, dark first). */
const colorMode = useColorMode()
const theme = computed(() => (colorMode.value === 'light' ? 'light' : 'dark'))
const hasUpper = computed(() => (sc.value?.version ?? 0) > 3 && (sc.value?.upper.length ?? 0) > 1)
</script>

<template>
  <section v-if="sc" aria-label="The game" class="zp flex min-h-0 flex-col gap-3 rounded-xl border border-default p-4" :data-theme="theme">
    <ZStatusBar v-if="sc.version === 3 || sc.status.left" :left="sc.status.left" :right="sc.status.right" />
    <ZUpperWindow v-if="hasUpper" :rows="sc.upper.slice(1)" />
    <div class="max-h-[60vh] overflow-y-auto" role="region" aria-label="The story so far" tabindex="0">
      <ZTranscript :turns="sc.turns" />
      <div v-if="pending.length" class="mt-2 rounded-md border border-dashed border-default p-2">
        <p class="text-xs text-muted">This turn so far (stopped in the middle of it)</p>
        <ZRuns :runs="pending" />
      </div>
    </div>
    <ZCommandLine :mode="mode" :max-length="maxLength" @line="line => session.submitLine(line)" @key="(code, label) => session.pressKey(code, label)" />
    <div v-if="next !== undefined" class="flex items-center gap-2 text-sm">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-footprints" @click="typeNext">Type the next command</UButton>
      <span class="data text-muted">&gt; {{ next }}</span>
    </div>
  </section>
</template>
