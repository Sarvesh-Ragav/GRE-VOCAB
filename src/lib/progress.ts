import type { ProgressStore, WordProgress, WordStatus } from '../types'

const KEY = 'gre-vocab-progress-v1'

const DEFAULT_PROGRESS: WordProgress = {
  status: 'new',
  consecutiveCorrect: 0,
  everMissed: false,
  attempts: 0,
  missCount: 0,
}

export function emptyProgress(): ProgressStore {
  return { words: {} }
}

export function loadProgress(): ProgressStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw) as ProgressStore
    if (!parsed?.words || typeof parsed.words !== 'object') return emptyProgress()
    return parsed
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(store: ProgressStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getWordProgress(
  store: ProgressStore,
  wordId: number,
): WordProgress {
  const raw = store.words[String(wordId)]
  if (!raw) return { ...DEFAULT_PROGRESS }
  return {
    ...DEFAULT_PROGRESS,
    ...raw,
    missCount: raw.missCount ?? 0,
  }
}

export function setWordProgress(
  store: ProgressStore,
  wordId: number,
  progress: WordProgress,
): ProgressStore {
  return {
    words: {
      ...store.words,
      [String(wordId)]: progress,
    },
  }
}

export function countByStatus(
  store: ProgressStore,
  wordIds: number[],
): Record<WordStatus | 'remaining', number> {
  const counts = {
    new: 0,
    learning: 0,
    known: 0,
    mastered: 0,
    remaining: 0,
  }
  for (const id of wordIds) {
    const s = getWordProgress(store, id).status
    counts[s]++
    if (s !== 'mastered') counts.remaining++
  }
  return counts
}
