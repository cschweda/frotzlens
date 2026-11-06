import { afterEach, describe, expect, it, vi } from 'vitest'
import { isModShortcut, modShortcutLabel } from './shortcut'

const key = (o: Partial<KeyboardEvent>) => ({ key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o }) as KeyboardEvent

describe('Mod shortcuts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is ⌘ on a Mac', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(modShortcutLabel('k')).toBe('⌘K')
    expect(isModShortcut(key({ metaKey: true }), 'k')).toBe(true)
    expect(isModShortcut(key({ ctrlKey: true }), 'k')).toBe(false)
  })

  it('is Ctrl elsewhere, case-insensitive, never with Shift/Alt', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(modShortcutLabel('b')).toBe('Ctrl+B')
    expect(isModShortcut(key({ ctrlKey: true }), 'k')).toBe(true)
    expect(isModShortcut(key({ ctrlKey: true, key: 'K' }), 'k')).toBe(true)
    expect(isModShortcut(key({ ctrlKey: true, shiftKey: true }), 'k')).toBe(false)
    expect(isModShortcut(key({ ctrlKey: true, altKey: true }), 'k')).toBe(false)
    expect(isModShortcut(key({ ctrlKey: true }), 'b')).toBe(false)
  })
})
