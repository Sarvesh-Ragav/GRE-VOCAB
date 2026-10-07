export type WordStatus = 'new' | 'learning' | 'known' | 'mastered'

export interface VocabWord {
  id: number
  word: string
  meaning: string
  clue?: string
  example?: string
  mnemonic?: string
  pos?: string
  /** manhattan = PDF; focus = extra sheet; book = GRE_Verbal_Vocabulary xlsx */
  set?: 'manhattan' | 'focus' | 'book'
}

export interface WordProgress {
  status: WordStatus
  consecutiveCorrect: number
  /** True after any miss / don't know / options help */
  everMissed: boolean
  attempts: number
  /** Times marked miss / don't know / used options */
  missCount: number
}

export interface ProgressStore {
  words: Record<string, WordProgress>
}

export interface WordGroup {
  id: string
  label: string
  letterRange: string
  wordIds: number[]
  kind?: 'standard' | 'master-revision' | 'focus' | 'book'
}

export const MASTER_REVISION_ID = 'master-revision'
export const FOCUS_GROUP_ID = 'focus-list'
/** Miss / don't know more than twice → master revision pool */
export const HARD_MISS_THRESHOLD = 2

export type StudyMode = 'learn' | 'revise'
