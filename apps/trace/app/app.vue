<script setup lang="ts">
/**
 * frotztrace (docs/21): the family shell around the start page, or around a story being debugged.
 * `?sample=<id>` opens a sample.
 */
import changelog from '../CHANGELOG.md?raw'
import { site } from '~~/site.config'

const session = useSession()
const s = session.state
const loading = ref('')
const start = useTemplateRef<{ take: (files: FileList | File[]) => Promise<void> }>('start')
const main = useTemplateRef<HTMLElement>('main')

async function openSample(id: string) {
  const sample = site.samples.find(x => x.id === id)
  if (!sample) return
  loading.value = `Opening ${sample.title}…`
  try {
    const get = async (ext: string) => {
      const r = await fetch(`/samples/${id}.${ext}`)
      if (!r.ok) throw new Error(`/samples/${id}.${ext}: ${r.status}`)
      return r
    }
    const [story, dbg, inf, walk] = await Promise.all([get('z5'), get('dbg'), get('inf'), get('txt').catch(() => null)])
    const lines = walk ? (await walk.text()).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('!')).flatMap(l => l.split('.')).map(c => c.trim()).filter(Boolean) : []
    await session.open({ name: `${id}.z5`, bytes: new Uint8Array(await story.arrayBuffer()), dbg: await dbg.text(), sources: [{ name: 'story.inf', text: await inf.text() }], walkthrough: lines })
    if (!location.hash) history.replaceState(null, '', '#stack')
  } catch (e) {
    s.error = `The sample couldn't be opened: ${(e as Error).message}`
  } finally {
    loading.value = ''
  }
}

/**
 * A story handed over by frotzlens's "Debug this story" (?from=frotzlens): say ready to the tab that
 * opened this one, then take the story it sends, only from frotzlens's own origins. Nothing is
 * uploaded: the bytes come from that tab.
 */
const FROM_FROTZLENS = [/^https:\/\/frotzlens\.frotzinc\.com$/, /^https:\/\/(staging|deploy-preview-\d+)--frotzlens\.netlify\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
function trusted(origin: string) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(origin) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false
  return FROM_FROTZLENS.some(r => r.test(origin))
}
function onHandover(e: MessageEvent) {
  const d = e.data as { type?: string; name?: string; bytes?: Uint8Array; dbg?: string }
  if (!trusted(e.origin) || d?.type !== 'frotztrace:open' || !(d.bytes instanceof Uint8Array)) return
  window.removeEventListener('message', onHandover)
  void session.open({ name: String(d.name ?? 'story'), bytes: d.bytes, ...(typeof d.dbg === 'string' ? { dbg: d.dbg } : {}), sources: [] }).then(() => {
    if (!location.hash) history.replaceState(null, '', `${location.pathname}#stack`)
  })
}

onMounted(() => {
  const q = new URLSearchParams(location.search)
  if (q.get('from') === 'frotzlens') {
    window.addEventListener('message', onHandover)
    window.opener?.postMessage({ type: 'frotztrace:ready' }, '*')
  } else if (q.has('sample')) void openSample(q.get('sample') || site.samples[0]!.id)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onHandover)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onWindowDrop)
})
function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
}
// Files dropped anywhere on the start page go to its slots (never navigating away to the raw file).
function onWindowDrop(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  if (!s.open && e.dataTransfer.files.length) void start.value?.take(e.dataTransfer.files)
}
function closeStory() {
  session.close()
  history.replaceState(null, '', location.pathname)
  nextTick(() => main.value?.focus())
}
function skip(e: MouseEvent) {
  e.preventDefault()
  main.value?.focus()
}
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh flex-col">
      <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded focus:bg-elevated focus:px-3 focus:py-2" @click="skip">Skip to content</a>
      <AppHeader>
        <template #context>
          <span v-if="s.open" class="hidden truncate text-sm text-muted sm:inline">/ {{ s.name }}</span>
        </template>
        <template #actions>
          <UButton v-if="s.open" color="neutral" variant="outline" icon="i-lucide-file-plus" @click="closeStory">
            <span class="hidden sm:inline">Another story</span><span class="sr-only sm:hidden">Open another story</span>
          </UButton>
        </template>
      </AppHeader>
      <main id="main" ref="main" tabindex="-1" class="flex flex-1 flex-col focus:outline-none">
        <DebugLayout v-if="s.open" />
        <StartPage v-else ref="start" :error="s.error" :loading="loading" @open="o => session.open(o)" @sample="openSample" />
      </main>
      <AppFooter />
      <AboutDialogs :changelog="changelog" />
    </div>
  </UApp>
</template>
