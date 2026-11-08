<script setup lang="ts">
/**
 * The debugger (design §6.3): the game on the left, the views on the right with the shared nav; the
 * toolbar and status strip above. On a phone the columns stack, the game first.
 */
const { route } = useHashRoute()
const session = useSession()
const live = computed(() => session.live())
const top = ref(0)
const view = computed(() => route.value.view)
</script>

<template>
  <div class="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-4 px-4 py-4">
    <div class="flex flex-col gap-2 rounded-xl border border-default px-4 py-3">
      <DebugToolbar />
      <StatusStrip />
    </div>
    <div class="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ScreenPane />
      <div class="flex min-w-0 flex-col gap-6 lg:flex-row">
        <TraceNav :view="view" />
        <div id="views" class="min-w-0 flex-1">
          <CodeView v-if="view === 'code' || view === 'routine'" :id="view === 'routine' ? route.id : undefined" />
          <template v-else-if="live && (view === 'objects' || view === 'object')">
            <ViewHeader title="Objects" eyebrow="The tree as it is now">What changed since the last stop is marked.</ViewHeader>
            <div class="mt-4 rounded-xl border border-default p-2"><ObjectTree :story="live.liveStory" :live="live.view" /></div>
          </template>
          <GlobalsView v-else-if="live && (view === 'globals' || view === 'global')" :story="live.story" :file-name="session.state.name" :id="view === 'global' ? (route.id ?? '') : undefined" :live="live.view" />
          <template v-else-if="live && view === 'memory'">
            <ViewHeader title="Memory" eyebrow="Dynamic memory, live">The bytes the last stretch wrote are lit.</ViewHeader>
            <div class="mt-4"><HexPane v-model:top="top" :bytes="live.view.memory" :live="live.view" /></div>
          </template>
          <MapView v-else-if="live && view === 'map'" :story="live.liveStory" :file-name="session.state.name" :live="live.view" />
          <SourceCode v-else-if="view === 'source'" />
          <WatchesView v-else-if="view === 'watches'" />
          <TimelineView v-else-if="view === 'timeline'" />
          <BreakpointsView v-else-if="view === 'breakpoints'" />
          <TraceView v-else-if="view === 'trace'" />
          <StackView v-else />
        </div>
      </div>
    </div>
  </div>
</template>
