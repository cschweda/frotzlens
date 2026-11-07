/**
 * The About menu's dialogs, open from anywhere (the header's menu, the footer's Changelog link):
 * which one is showing, and for a report, which kind.
 */
export type AboutDialog = 'about' | 'changelog' | 'problem' | 'idea'

const open = ref<AboutDialog | null>(null)

export function useAbout() {
  return { dialog: open, show: (d: AboutDialog) => (open.value = d), close: () => (open.value = null) }
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
