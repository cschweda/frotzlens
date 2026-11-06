/** True on Apple platforms, where the platform modifier is ⌘ (Ctrl elsewhere). */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** Label for Mod+`key` as the user's keyboard shows it: `⌘K` or `Ctrl+K`. */
export function modShortcutLabel(key: string): string {
  return isApplePlatform() ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`
}

/** Is this keydown Mod+`key` (no Shift/Alt)? */
export function isModShortcut(e: KeyboardEvent, key: string): boolean {
  const mod = isApplePlatform() ? e.metaKey : e.ctrlKey
  return mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === key.toLowerCase()
}
