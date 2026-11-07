/**
 * The player's settings (docs/13 §2): kept per viewer in localStorage (never sent anywhere), applied
 * as data attributes and custom properties on the player's root.
 */
import type { Verbosity } from './announce.js'

export type Theme = 'dark' | 'light' | 'high-contrast'
export type Font = 'default' | 'dyslexic' | 'mono'

export interface Settings {
  theme: Theme
  font: Font
  /** Percent of the base size. */
  size: number
  /** Characters per line; 0 for the full width. */
  lineLength: number
  lineSpacing: number
  /** Em. */
  letterSpacing: number
  verbosity: Verbosity
  /** 'system' follows prefers-reduced-motion; 'reduce' always reduces. */
  motion: 'system' | 'reduce'
  timedInput: 'on' | 'off'
}

export const DEFAULTS: Settings = {
  theme: 'dark',
  font: 'default',
  size: 100,
  lineLength: 70,
  lineSpacing: 1.6,
  letterSpacing: 0,
  verbosity: 'standard',
  motion: 'system',
  timedInput: 'on',
}

const KEY = 'frotzplay:settings'

export interface Storage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

/** The stored settings over the defaults; anything unreadable is ignored (a private window, blocked storage). */
export function loadSettings(storage: Storage | undefined): Settings {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const s = JSON.parse(raw) as Partial<Settings>
    const out = { ...DEFAULTS }
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) if (typeof s[k] === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = s[k]
    return out
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(storage: Storage | undefined, s: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage full or denied: the settings still apply for this visit.
  }
}
