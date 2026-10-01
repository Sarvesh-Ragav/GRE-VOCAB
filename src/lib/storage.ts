import type { ProgressStore } from '../types'
import { emptyProgress } from './progress'

const PROGRESS_KEY = 'gre-vocab-progress-v1'
const SYNC_KEY = 'gre-vocab-sync-code-v1'
const DB_NAME = 'gre-vocab-db'
const DB_STORE = 'kv'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => resolve(null)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
    } catch {
      resolve(null)
    }
  })
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const req = store.get(key)
      req.onsuccess = () => {
        const v = req.result
        resolve(typeof v === 'string' ? v : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export function wordCount(store: ProgressStore): number {
  return Object.keys(store.words ?? {}).length
}

export async function persistProgress(store: ProgressStore): Promise<void> {
  const raw = JSON.stringify(store)
  try {
    localStorage.setItem(PROGRESS_KEY, raw)
  } catch {
    /* quota / private mode */
  }
  await idbSet(PROGRESS_KEY, raw)
}

export async function restoreProgress(): Promise<ProgressStore> {
  // Prefer localStorage, fall back to IndexedDB (survives some mobile clears)
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressStore
      if (parsed?.words && typeof parsed.words === 'object') {
        await idbSet(PROGRESS_KEY, raw) // keep IDB warm
        return parsed
      }
    }
  } catch {
    /* ignore */
  }

  const idbRaw = await idbGet(PROGRESS_KEY)
  if (idbRaw) {
    try {
      const parsed = JSON.parse(idbRaw) as ProgressStore
      if (parsed?.words && typeof parsed.words === 'object') {
        try {
          localStorage.setItem(PROGRESS_KEY, idbRaw)
        } catch {
          /* ignore */
        }
        return parsed
      }
    } catch {
      /* ignore */
    }
  }

  return emptyProgress()
}

export async function persistSyncCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase()
  try {
    localStorage.setItem(SYNC_KEY, normalized)
  } catch {
    /* ignore */
  }
  await idbSet(SYNC_KEY, normalized)
}

export async function restoreSyncCode(): Promise<string | null> {
  try {
    const ls = localStorage.getItem(SYNC_KEY)
    if (ls) {
      await idbSet(SYNC_KEY, ls)
      return ls
    }
  } catch {
    /* ignore */
  }
  const idb = await idbGet(SYNC_KEY)
  if (idb) {
    try {
      localStorage.setItem(SYNC_KEY, idb)
    } catch {
      /* ignore */
    }
    return idb
  }
  return null
}
