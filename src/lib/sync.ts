import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProgressStore, WordProgress, WordStatus } from '../types'
import { emptyProgress } from './progress'
import {
  persistSyncCode,
  restoreSyncCode,
  wordCount,
} from './storage'

const SYNC_CODE_KEY = 'gre-vocab-sync-code-v1'

let client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

export function isSyncConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
}

function envDefaultSyncCode(): string | null {
  const raw = import.meta.env.VITE_DEFAULT_SYNC_CODE as string | undefined
  if (!raw?.trim()) return null
  return raw.trim().toUpperCase()
}

export function getSyncCode(): string | null {
  try {
    return localStorage.getItem(SYNC_CODE_KEY)
  } catch {
    return null
  }
}

export function setSyncCode(code: string): void {
  const normalized = code.trim().toUpperCase()
  try {
    localStorage.setItem(SYNC_CODE_KEY, normalized)
  } catch {
    /* ignore */
  }
  void persistSyncCode(normalized)
}

export function clearSyncCode(): void {
  try {
    localStorage.removeItem(SYNC_CODE_KEY)
  } catch {
    /* ignore */
  }
}

export function generateSyncCode(): string {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase()
  return `GRE-${part()}-${part()}`
}

/**
 * Resolve sync code without inventing a new one when storage was wiped.
 * Prefers: env default → localStorage → IndexedDB → (only then) generate.
 */
export async function resolveSyncCode(): Promise<string> {
  const fromEnv = envDefaultSyncCode()
  if (fromEnv) {
    setSyncCode(fromEnv)
    return fromEnv
  }

  const existing = getSyncCode() ?? (await restoreSyncCode())
  if (existing) {
    setSyncCode(existing)
    return existing
  }

  const code = generateSyncCode()
  setSyncCode(code)
  return code
}

/** @deprecated use resolveSyncCode — kept for sync call sites that need sync */
export function ensureSyncCode(): string {
  const fromEnv = envDefaultSyncCode()
  if (fromEnv) {
    setSyncCode(fromEnv)
    return fromEnv
  }
  const existing = getSyncCode()
  if (existing) return existing
  const code = generateSyncCode()
  setSyncCode(code)
  return code
}

const STATUS_RANK: Record<WordStatus, number> = {
  new: 0,
  learning: 1,
  known: 2,
  mastered: 3,
}

function mergeWord(a: WordProgress, b: WordProgress): WordProgress {
  const pickA = STATUS_RANK[a.status] >= STATUS_RANK[b.status]
  const base = pickA ? a : b
  const other = pickA ? b : a
  return {
    status: base.status,
    consecutiveCorrect:
      a.status === b.status
        ? Math.max(a.consecutiveCorrect, b.consecutiveCorrect)
        : base.consecutiveCorrect,
    everMissed: a.everMissed || b.everMissed,
    attempts: Math.max(a.attempts, b.attempts),
    missCount: Math.max(a.missCount ?? 0, b.missCount ?? 0, other.missCount ?? 0),
  }
}

export function mergeProgress(
  local: ProgressStore,
  remote: ProgressStore,
): ProgressStore {
  const ids = new Set([
    ...Object.keys(local.words),
    ...Object.keys(remote.words),
  ])
  const words: Record<string, WordProgress> = {}
  for (const id of ids) {
    const l = local.words[id]
    const r = remote.words[id]
    if (l && r) words[id] = mergeWord(l, r)
    else words[id] = (l ?? r)!
  }
  return { words }
}

export async function pullProgress(
  syncCode: string,
): Promise<ProgressStore | null> {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('sync_progress')
    .select('data')
    .eq('sync_code', syncCode)
    .maybeSingle()
  if (error) throw error
  if (!data?.data) return null
  const parsed = data.data as ProgressStore
  if (!parsed?.words || typeof parsed.words !== 'object') return emptyProgress()
  return parsed
}

export async function pushProgress(
  syncCode: string,
  store: ProgressStore,
): Promise<void> {
  const sb = getClient()
  if (!sb) return
  const { error } = await sb.from('sync_progress').upsert(
    {
      sync_code: syncCode,
      data: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sync_code' },
  )
  if (error) throw error
}

export interface SyncOptions {
  /** Allow uploading empty progress (only for explicit Clear). */
  allowEmptyPush?: boolean
}

/**
 * Pull remote, merge with local, push merged result.
 * Never overwrites a non-empty cloud save with empty local data
 * unless allowEmptyPush is true.
 */
export async function syncNow(
  local: ProgressStore,
  options: SyncOptions = {},
): Promise<ProgressStore> {
  const code = await resolveSyncCode()
  const remote = await pullProgress(code)
  const merged = remote ? mergeProgress(local, remote) : local

  const mergedEmpty = wordCount(merged) === 0
  const remoteHasData = remote != null && wordCount(remote) > 0

  if (mergedEmpty && remoteHasData && !options.allowEmptyPush) {
    // Keep cloud data; do not wipe
    return remote!
  }

  if (mergedEmpty && !options.allowEmptyPush && !remote) {
    // Nothing anywhere — skip creating an empty cloud row
    return merged
  }

  await pushProgress(code, merged)
  return merged
}
