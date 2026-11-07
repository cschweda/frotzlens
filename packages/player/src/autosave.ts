/**
 * Autosave (docs/13 §2): the machine's snapshot after every turn, in IndexedDB, one per story
 * (keyed by release, serial and checksum). Nothing leaves the browser. Every call fails soft:
 * without IndexedDB (a private window, a file:// page in some browsers) there is simply no autosave.
 */
import type { MachineSnapshot } from '@frotzinc/zmachine'

const DB = 'frotzplay'
const STORE = 'autosave'

export interface Autosaved {
  snapshot: MachineSnapshot
  /** When it was saved (ms since 1970). */
  at: number
  turns: number
}

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export function storyKey(story: Uint8Array): string {
  const b = story
  const serial = String.fromCharCode(...b.subarray(0x12, 0x18))
  return `${(b[2]! << 8) | b[3]!}/${serial}/${((b[0x1c]! << 8) | b[0x1d]!).toString(16)}`
}

export async function writeAutosave(key: string, value: Autosaved): Promise<boolean> {
  const db = await open()
  if (!db) return false
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export async function readAutosave(key: string): Promise<Autosaved | null> {
  const db = await open()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as Autosaved | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function clearAutosave(key: string): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
  } catch {
    // Nothing to clear.
  }
}
