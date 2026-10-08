import type { PackProgressStore, PackStatus, SynonymPack } from '../types'

const KEY = 'gre-vocab-pack-progress-v1'

export function emptyPackProgress(): PackProgressStore {
  return { packs: {} }
}

export function loadPackProgress(): PackProgressStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyPackProgress()
    const parsed = JSON.parse(raw) as PackProgressStore
    if (!parsed?.packs || typeof parsed.packs !== 'object') return emptyPackProgress()
    return parsed
  } catch {
    return emptyPackProgress()
  }
}

export function savePackProgress(store: PackProgressStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getPackStatus(
  store: PackProgressStore,
  packId: string,
): PackStatus {
  return store.packs[packId] ?? 'new'
}

export function setPackStatus(
  store: PackProgressStore,
  packId: string,
  status: PackStatus,
): PackProgressStore {
  return {
    packs: {
      ...store.packs,
      [packId]: status,
    },
  }
}

export function countPacksByStatus(
  store: PackProgressStore,
  packs: SynonymPack[],
): { known: number; review: number; new: number; total: number } {
  let known = 0
  let review = 0
  let fresh = 0
  for (const pack of packs) {
    const s = getPackStatus(store, pack.id)
    if (s === 'known') known += 1
    else if (s === 'review') review += 1
    else fresh += 1
  }
  return { known, review, new: fresh, total: packs.length }
}
