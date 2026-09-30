import type { ProgressStore, VocabWord, WordGroup } from '../types'
import { MASTER_REVISION_ID } from '../types'
import { getWordProgress } from './progress'
import { isHardWord } from './mastery'

const TARGET_SIZE = 50

/** Split alphabetically sorted words into groups of ~50. */
export function buildGroups(words: VocabWord[]): WordGroup[] {
  const sorted = [...words].sort((a, b) =>
    a.word.localeCompare(b.word, undefined, { sensitivity: 'base' }),
  )

  const groups: WordGroup[] = []
  for (let i = 0; i < sorted.length; i += TARGET_SIZE) {
    const chunk = sorted.slice(i, i + TARGET_SIZE)
    const first = chunk[0].word[0].toUpperCase()
    const last = chunk[chunk.length - 1].word[0].toUpperCase()
    const letterRange = first === last ? first : `${first}–${last}`
    const n = groups.length + 1
    groups.push({
      id: `g${n}`,
      label: `Group ${n}`,
      letterRange,
      wordIds: chunk.map((w) => w.id),
      kind: 'standard',
    })
  }
  return groups
}

/**
 * Cross-group pool: missed / don't-know more than twice, not yet mastered.
 * Used for Master revision.
 */
export function buildMasterRevisionGroup(
  words: VocabWord[],
  store: ProgressStore,
): WordGroup {
  const wordIds = words
    .filter((w) => {
      const p = getWordProgress(store, w.id)
      return isHardWord(p) && p.status !== 'mastered'
    })
    .map((w) => w.id)

  return {
    id: MASTER_REVISION_ID,
    label: 'Master revision',
    letterRange: 'Hard words',
    wordIds,
    kind: 'master-revision',
  }
}

export function wordsInGroup(
  words: VocabWord[],
  group: WordGroup,
): VocabWord[] {
  const set = new Set(group.wordIds)
  return words.filter((w) => set.has(w.id))
}
