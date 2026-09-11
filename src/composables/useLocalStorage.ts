import { ref, watch, type Ref } from 'vue'
import { APP } from '@/config/app'

/**
 * Versioned, corruption-tolerant localStorage.
 *
 * webOS clears app storage on some updates and a half-written value must never
 * take the app down, so every read is guarded and falls back to the default.
 */

export const storageKey = (name: string) => `${APP.storagePrefix}${name}`

let available: boolean | null = null

function hasStorage(): boolean {
  if (available !== null) return available
  try {
    const probe = `${APP.storagePrefix}__probe`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    available = true
  } catch {
    available = false
  }
  return available
}

export function readStorage<T>(name: string, fallback: T): T {
  if (!hasStorage()) return fallback
  const key = storageKey(name)
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return fallback
  }
}

/** Returns false when the write did not happen (quota, disabled). */
export function writeStorage(name: string, value: unknown): boolean {
  if (!hasStorage()) return false
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStorage(name: string): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(storageKey(name))
  } catch {
    /* ignore */
  }
}

/** Drop every key this app owns. */
export function clearStorage(): void {
  if (!hasStorage()) return
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(APP.storagePrefix)) doomed.push(k)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

/** A ref that persists itself. */
export function useStoredRef<T>(name: string, fallback: T): Ref<T> {
  const r = ref(readStorage<T>(name, fallback)) as Ref<T>
  watch(r, (v) => writeStorage(name, v), { deep: true })
  return r
}

export const KEYS = {
  credentials: 'credentials',
  account: 'account',
  favorites: 'favorites',
  recents: 'recents',
  resume: 'resume',
  streamFormat: 'streamFormat',
  lastTab: 'lastTab',
  catalog: 'catalog',
} as const
