/**
 * "Debug this story" (frotztrace design §5.5, Phase 5): open frotztrace in a new tab and hand it the
 * story (and the debug file, if one is loaded) by postMessage, after it says it's ready. Nothing is
 * uploaded: the bytes go from this tab to that one. The message goes only to frotztrace's origin.
 */
export function frotztraceUrl(host = location.host): string {
  if (/^staging--/.test(host)) return 'https://staging--frotztrace.netlify.app/'
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return 'http://localhost:3002/'
  return 'https://frotztrace.frotzinc.com/'
}

export function debugInFrotztrace(name: string, bytes: Uint8Array, dbg?: string): void {
  const url = new URL(frotztraceUrl())
  url.searchParams.set('from', 'frotzlens')
  const tab = window.open(url.href, '_blank')
  if (!tab) return
  const origin = url.origin
  const onMessage = (e: MessageEvent) => {
    if (e.source !== tab || e.origin !== origin || (e.data as { type?: string })?.type !== 'frotztrace:ready') return
    window.removeEventListener('message', onMessage)
    tab.postMessage({ type: 'frotztrace:open', name, bytes, ...(dbg ? { dbg } : {}) }, origin)
  }
  window.addEventListener('message', onMessage)
  // A tab that never says it's ready (blocked, closed): stop listening after a while.
  setTimeout(() => window.removeEventListener('message', onMessage), 60_000)
}
