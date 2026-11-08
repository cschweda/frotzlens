/**
 * The About menu's dialogs, open from anywhere (the header's menu, the footer's Changelog link):
 * which one is showing, and for a report, which kind.
 */
export type AboutDialog = 'about' | 'changelog' | 'problem' | 'idea'

const open = ref<AboutDialog | null>(null)

/**
 * The app's own "Check for updates", when it has one (frotzsmith's goes through its service worker,
 * and its desktop build has no web manifest to ask). Unset, the About menu asks the site's Nuxt
 * build manifest, which is right for a static site with no service worker.
 */
const updateCheck = shallowRef<(() => void | Promise<void>) | null>(null)

export function useAbout() {
  return {
    dialog: open,
    show: (d: AboutDialog) => (open.value = d),
    close: () => (open.value = null),
    /** The About menu's "Check for updates" calls this instead of its own check. */
    setUpdateCheck: (fn: (() => void | Promise<void>) | null) => (updateCheck.value = fn),
    updateCheck,
  }
}

/**
 * The technical details a report can carry: the app's version and build, its packages, and the
 * browser. Never the story file or anything from it.
 */
export function technicalDetails(): string {
  const { name } = useProduct()
  const a = useRuntimeConfig().public.about as { version: string; commit: string; date: string; packages: Record<string, string> }
  const lines = [
    `${name} ${a.version}${a.commit ? ` (${a.commit}${a.date ? `, ${a.date}` : ''})` : ''}`,
    ...Object.entries(a.packages).map(([n, v]) => `${n} ${v}`),
    `Browser: ${navigator.userAgent}`,
    `Screen: ${screen.width}×${screen.height}, window ${innerWidth}×${innerHeight}`,
  ]
  return lines.join('\n')
}
