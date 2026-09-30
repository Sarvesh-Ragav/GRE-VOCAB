import type { ProgressStore, WordProgress, VocabWord } from '../types'
import { HARD_MISS_THRESHOLD } from '../types'
import { getWordProgress, setWordProgress } from './progress'

export type GradeOutcome = 'correct' | 'miss'

export interface GradeContext {
  /** User used "see options" before answering */
  usedHelp: boolean
  /** Session is revise-mastered mode */
  reviseMode: boolean
}

/**
 * Apply self-grade after reveal.
 * - First-time typed correct (no help, never missed) → known
 * - known + correct again → mastered
 * - miss / help → learning, streak reset; need 2 consecutive correct to known→mastered path
 * - learning: 2 consecutive correct → mastered (they've been drilled)
 * - missCount > 2 → included in Master revision pool
 */
export function applyGrade(
  store: ProgressStore,
  wordId: number,
  outcome: GradeOutcome,
  ctx: GradeContext,
): ProgressStore {
  const prev = getWordProgress(store, wordId)
  const next = gradeWord(prev, outcome, ctx)
  return setWordProgress(store, wordId, next)
}

function gradeWord(
  prev: WordProgress,
  outcome: GradeOutcome,
  ctx: GradeContext,
): WordProgress {
  const attempts = prev.attempts + 1
  const missCount = prev.missCount ?? 0

  if (outcome === 'miss' || ctx.usedHelp) {
    return {
      status: 'learning',
      consecutiveCorrect: 0,
      everMissed: true,
      attempts,
      missCount: missCount + 1,
    }
  }

  // Correct typed answer without help — keep missCount history
  const consecutiveCorrect = prev.consecutiveCorrect + 1

  if (prev.status === 'mastered' && ctx.reviseMode) {
    return {
      ...prev,
      consecutiveCorrect,
      attempts,
      status: 'mastered',
      missCount,
    }
  }

  if (prev.status === 'known') {
    return {
      status: 'mastered',
      consecutiveCorrect,
      everMissed: prev.everMissed,
      attempts,
      missCount,
    }
  }

  if (prev.status === 'learning' || prev.everMissed) {
    if (consecutiveCorrect >= 2) {
      return {
        status: 'mastered',
        consecutiveCorrect,
        everMissed: true,
        attempts,
        missCount,
      }
    }
    return {
      status: 'learning',
      consecutiveCorrect,
      everMissed: true,
      attempts,
      missCount,
    }
  }

  if (prev.status === 'new' && !prev.everMissed && attempts === 1) {
    return {
      status: 'known',
      consecutiveCorrect: 1,
      everMissed: false,
      attempts,
      missCount,
    }
  }

  if (consecutiveCorrect >= 2) {
    return {
      status: 'mastered',
      consecutiveCorrect,
      everMissed: prev.everMissed,
      attempts,
      missCount,
    }
  }

  return {
    status: 'known',
    consecutiveCorrect,
    everMissed: prev.everMissed,
    attempts,
    missCount,
  }
}

/** Demote mastered (or any) word back to learning / needs revise. */
export function demoteToLearning(
  store: ProgressStore,
  wordId: number,
): ProgressStore {
  const prev = getWordProgress(store, wordId)
  return setWordProgress(store, wordId, {
    status: 'learning',
    consecutiveCorrect: 0,
    everMissed: true,
    attempts: prev.attempts,
    // Ensure it lands in Master revision
    missCount: Math.max((prev.missCount ?? 0) + 1, HARD_MISS_THRESHOLD + 1),
  })
}

export function isHardWord(progress: WordProgress): boolean {
  return (progress.missCount ?? 0) > HARD_MISS_THRESHOLD
}

/**
 * Build session queue for a group.
 * Learn mode: non-mastered words. Prefer learning, then new, then known.
 * Revise mode: mastered words only.
 */
export function buildSessionQueue(
  wordIds: number[],
  store: ProgressStore,
  mode: 'learn' | 'revise',
): number[] {
  const learning: number[] = []
  const fresh: number[] = []
  const known: number[] = []
  const mastered: number[] = []

  for (const id of wordIds) {
    const s = getWordProgress(store, id).status
    if (s === 'learning') learning.push(id)
    else if (s === 'new') fresh.push(id)
    else if (s === 'known') known.push(id)
    else mastered.push(id)
  }

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  if (mode === 'revise') return shuffle(mastered)

  // New + learning first; confirmation (known) only after a real gap
  const primary = shuffle([...learning, ...fresh])
  const confirm = shuffle(known)
  if (confirm.length === 0) return primary
  if (primary.length === 0) return confirm

  const out = [...primary]
  // Insert known words starting after ≥7 cards, spaced 7–10 apart
  let pos = Math.min(CONFIRM_GAP_MIN, out.length)
  for (const id of confirm) {
    pos = Math.min(Math.max(pos, 0), out.length)
    out.splice(pos, 0, id)
    pos += randomGap(CONFIRM_GAP_MIN, CONFIRM_GAP_MAX) + 1
  }
  return out
}

const CONFIRM_GAP_MIN = 7
const CONFIRM_GAP_MAX = 10

function randomGap(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** After grading, decide where to re-insert the word in the remaining queue. */
export function requeueAfterGrade(
  queue: number[],
  wordId: number,
  store: ProgressStore,
): number[] {
  const rest = queue.filter((id) => id !== wordId)
  const progress = getWordProgress(store, wordId)
  const { status, consecutiveCorrect } = progress

  if (status === 'mastered') return rest

  // Confirmation asks (known, or learning one-away from mastered): 7–10 words later
  const needsConfirmGap =
    status === 'known' || (status === 'learning' && consecutiveCorrect >= 1)

  let delay: number
  if (needsConfirmGap) {
    // Prefer 7–10; if fewer remain, put at the end (not next)
    const preferred = randomGap(CONFIRM_GAP_MIN, CONFIRM_GAP_MAX)
    delay = rest.length === 0 ? 0 : Math.min(preferred, rest.length)
  } else {
    // After a miss: sooner, but still not immediate (3–5)
    const preferred = randomGap(3, 5)
    delay = rest.length === 0 ? 0 : Math.min(preferred, rest.length)
  }

  const next = [...rest]
  next.splice(delay, 0, wordId)
  return next
}

export function pickMeaningOptions(
  correct: VocabWord,
  pool: VocabWord[],
  count = 4,
): string[] {
  const others = pool
    .filter((w) => w.id !== correct.id)
    .map((w) => w.meaning)
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const distractors = shuffle(others).slice(0, count - 1)
  return shuffle([correct.meaning, ...distractors])
}
