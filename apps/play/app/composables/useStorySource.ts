/**
 * Where a story comes from (docs/14 §2): a dropped or chosen file, a sample, a `?story=` URL, or a
 * `postMessage` from the window that opened this one. Every story is read in the browser; nothing
 * is uploaded. Every failure is a message in words that says what to do.
 */
import { blorbStory, isBlorb, readBlorb } from '@frotzinc/zcode'
import { site } from '~~/site.config'

export interface LoadedStory {
  /** The Z-code (unwrapped from a Blorb). */
  bytes: Uint8Array
  /** Its file name, or the URL's last part. */
  name: string
  /** The iFiction title, the sample's, or the file name without its extension. */
  title: string
  author?: string
  /** The Blorb's cover picture, as an object URL. */
  cover?: string
  /** Set when it came from `?story=`: what "Open in Parchment" hands over. */
  url?: string
  /** Set when it's one of the samples. */
  sample?: string
}

/** Where a story may be posted from (the frotzlens Play view), besides this page's own origin. */
const POST_ORIGINS = ['https://frotzlens.frotzinc.com']

const PARCHMENT = 'For Glulx, TADS, Hugo and other formats, use Parchment (iplayif.com).'

const stem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Story'

/** The Z-code in `data`, or the reason it isn't playable here, in words. */
export function unwrap(data: Uint8Array, name: string): Omit<LoadedStory, 'url' | 'sample'> | { error: string } {
  let bytes = data
  let title = stem(name)
  let author: string | undefined
  let cover: string | undefined
  if (isBlorb(data)) {
    const blorb = readBlorb(data)
    const story = blorbStory(data, blorb)
    if (!story) {
      const glulx = blorb.chunks.some(c => c.type === 'GLUL')
      return { error: glulx ? `“${name}” is a Glulx story, which frotzplay doesn’t play. ${PARCHMENT}` : `“${name}” is a Blorb file with no Z-machine story in it.` }
    }
    bytes = story
    if (blorb.title) title = blorb.title
    if (blorb.author) author = blorb.author
    cover = coverOf(data, blorb)
  } else if (String.fromCharCode(...data.subarray(0, 4)) === 'Glul') {
    return { error: `“${name}” is a Glulx story, which frotzplay doesn’t play. ${PARCHMENT}` }
  }
  const v = bytes[0] ?? 0
  if (bytes.length < 64) return { error: `“${name}” is too short to be a story file. Check that it downloaded completely.` }
  if (v === 6) return { error: `“${name}” is a version 6 story (with graphics), which frotzplay doesn’t play yet. ${PARCHMENT}` }
  if (![3, 4, 5, 8].includes(v)) return { error: `“${name}” isn’t a Z-machine story frotzplay can play (it plays versions 3, 4, 5 and 8). ${PARCHMENT}` }
  return { bytes, name, title, author, cover }
}

function coverOf(data: Uint8Array, blorb: ReturnType<typeof readBlorb>): string | undefined {
  if (blorb.frontispiece === undefined || typeof URL.createObjectURL !== 'function') return undefined
  const res = blorb.resources.find(r => r.usage === 'Pict' && r.number === blorb.frontispiece)
  const chunk = res && blorb.chunks.find(c => c.offset === res.offset)
  if (!chunk || !['PNG ', 'JPEG'].includes(chunk.type)) return undefined
  const bytes = data.slice(chunk.offset + 8, chunk.offset + 8 + chunk.length)
  return URL.createObjectURL(new Blob([bytes], { type: chunk.type === 'PNG ' ? 'image/png' : 'image/jpeg' }))
}

export function useStorySource() {
  const story = shallowRef<LoadedStory | null>(null)
  const error = ref<string | null>(null)
  const loading = ref<string | null>(null)

  function open(data: Uint8Array, name: string, extra: Partial<LoadedStory> = {}): boolean {
    const r = unwrap(data, name)
    if ('error' in r) {
      error.value = r.error
      return false
    }
    error.value = null
    story.value = { ...r, ...extra, title: extra.title ?? r.title }
    return true
  }

  async function fromFile(file: File) {
    loading.value = `Opening ${file.name}…`
    try {
      if (open(new Uint8Array(await file.arrayBuffer()), file.name)) setQuery(null)
    } catch {
      error.value = `“${file.name}” couldn’t be read. Try choosing it again.`
    } finally {
      loading.value = null
    }
  }

  async function fromSample(id: string) {
    const s = site.samples.find(x => x.id === id)
    if (!s) {
      error.value = `There’s no sample called “${id}”. Choose one of the samples below.`
      return
    }
    loading.value = `Opening ${s.title}…`
    try {
      const res = await fetch(`/samples/${s.file}`)
      if (!res.ok) throw new Error(String(res.status))
      if (open(new Uint8Array(await res.arrayBuffer()), s.file, { title: s.title, sample: s.id })) setQuery({ sample: s.id })
    } catch {
      error.value = `${s.title} couldn’t be loaded. Check your connection and try again.`
    } finally {
      loading.value = null
    }
  }

  async function fromUrl(raw: string) {
    let url: URL
    try {
      url = new URL(raw, location.href)
    } catch {
      error.value = `“${raw}” isn’t a web address frotzplay can open.`
      return
    }
    if (url.protocol === 'http:' && url.origin !== location.origin) {
      error.value = `frotzplay can only open stories from secure (https) addresses, and “${url.href}” isn’t one. Download the story and drop it here instead.`
      return
    }
    const name = decodeURIComponent(url.pathname.split('/').pop() || 'story')
    loading.value = `Opening ${name}…`
    try {
      let res: Response
      try {
        res = await fetch(url.href, { mode: 'cors' })
      } catch {
        error.value = `frotzplay couldn’t read ${url.host}’s file. That server may not allow other sites to read its files (CORS), or it may be unreachable. Download the story and drop it here instead.`
        return
      }
      if (!res.ok) {
        error.value = `${url.host} answered “${res.status}${res.statusText ? ` ${res.statusText}` : ''}” for that story. Check the link, or download the story and drop it here.`
        return
      }
      open(new Uint8Array(await res.arrayBuffer()), name, { url: url.href })
    } finally {
      loading.value = null
    }
  }

  /**
   * A story handed over by the window that opened this one (the frotzlens Play view): say we're
   * ready, then take one story, from that window only, from an allowed origin.
   */
  function listenForOpener() {
    const opener = window.opener as Window | null
    if (!opener) return
    const allowed = new Set([...POST_ORIGINS, location.origin])
    const onMessage = (e: MessageEvent) => {
      if (e.source !== opener || !allowed.has(e.origin)) return
      const d = e.data as { source?: string; type?: string; bytes?: ArrayBuffer | Uint8Array; name?: string } | null
      if (!d || d.source !== 'frotzlens' || d.type !== 'story' || !d.bytes) return
      window.removeEventListener('message', onMessage)
      const bytes = d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(d.bytes)
      if (open(bytes, typeof d.name === 'string' ? d.name : 'story.z5')) setQuery(null)
    }
    window.addEventListener('message', onMessage)
    // '*' is safe here: the message says only that this page is ready, and carries nothing.
    opener.postMessage({ source: 'frotzplay', type: 'ready' }, '*')
  }

  function close() {
    if (story.value?.cover) URL.revokeObjectURL(story.value.cover)
    story.value = null
    error.value = null
    setQuery(null)
  }

  return { story, error, loading, fromFile, fromSample, fromUrl, listenForOpener, close }
}

/** Keep the address bar honest: ?sample=<id> for a sample, nothing for a file (?story= is left as the link was). */
function setQuery(q: { sample: string } | null) {
  const u = new URL(location.href)
  u.searchParams.delete('sample')
  if (!q) u.searchParams.delete('story')
  else u.searchParams.set('sample', q.sample)
  history.replaceState(history.state, '', u)
}
