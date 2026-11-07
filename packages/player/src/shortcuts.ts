/**
 * Keyboard shortcuts (docs/13 §5, statement I6): every one listed, changeable, and switchable off;
 * none a single character key (2.1.4). Matched by `code` (the physical key), so a Mac's
 * Option+Shift+U, which types a character, still works, and the character is suppressed.
 */
export type Action = 'readUpper' | 'repeatStatus' | 'undo' | 'save' | 'restore' | 'settings' | 'shortcuts'

export interface Binding {
  /** KeyboardEvent.code, e.g. 'KeyU'; null when the shortcut is off. */
  code: string | null
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

export const ACTIONS: { action: Action; label: string }[] = [
  { action: 'readUpper', label: 'Read the upper window' },
  { action: 'repeatStatus', label: 'Repeat the status line' },
  { action: 'undo', label: 'Undo the last turn' },
  { action: 'save', label: 'Save' },
  { action: 'restore', label: 'Restore' },
  { action: 'settings', label: 'Settings' },
  { action: 'shortcuts', label: 'Keyboard shortcuts' },
]

const altShift = (code: string): Binding => ({ code, alt: true, shift: true, ctrl: false, meta: false })

export const DEFAULT_BINDINGS: Record<Action, Binding> = {
  readUpper: altShift('KeyU'),
  repeatStatus: altShift('KeyL'),
  undo: altShift('KeyZ'),
  save: altShift('KeyS'),
  restore: altShift('KeyR'),
  settings: altShift('KeyO'),
  shortcuts: altShift('KeyK'),
}

export function matches(b: Binding, e: KeyboardEvent): boolean {
  return b.code !== null && e.code === b.code && e.altKey === b.alt && e.shiftKey === b.shift && e.ctrlKey === b.ctrl && e.metaKey === b.meta
}

/** A key event as a binding, if it can be one: it needs Alt, Ctrl or Meta (2.1.4: no single keys). */
export function bindingFrom(e: KeyboardEvent): Binding | null {
  if (/^(Alt|Shift|Control|Meta)/.test(e.code) || !e.code) return null
  if (!e.altKey && !e.ctrlKey && !e.metaKey) return null
  return { code: e.code, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey }
}

/** How a binding reads: "Alt+Shift+U". */
export function describe(b: Binding, mac = false): string {
  if (!b.code) return 'Off'
  const key = b.code.replace(/^Key/, '').replace(/^Digit/, '')
  return [b.ctrl && 'Ctrl', b.alt && (mac ? 'Option' : 'Alt'), b.shift && 'Shift', b.meta && (mac ? 'Cmd' : 'Meta'), key].filter(Boolean).join('+')
}

const KEY = 'frotzplay:shortcuts'

export function loadBindings(storage: { getItem(k: string): string | null } | undefined): Record<Action, Binding> {
  try {
    const raw = storage?.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<Record<Action, Binding>>) : {}
    return { ...DEFAULT_BINDINGS, ...saved }
  } catch {
    return { ...DEFAULT_BINDINGS }
  }
}

export function saveBindings(storage: { setItem(k: string, v: string): void } | undefined, b: Record<Action, Binding>): void {
  try {
    storage?.setItem(KEY, JSON.stringify(b))
  } catch {
    // Not saved: they still apply for this visit.
  }
}
