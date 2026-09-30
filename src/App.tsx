import { useEffect, useMemo, useState } from 'react'
import type { ProgressStore, StudyMode, VocabWord, WordGroup } from './types'
import { MASTER_REVISION_ID } from './types'
import { buildGroups, buildMasterRevisionGroup } from './lib/groups'
import { loadProgress, saveProgress } from './lib/progress'
import { Home } from './components/Home'
import { Study } from './components/Study'
import './App.css'

type Screen =
  | { name: 'home' }
  | { name: 'study'; groupId: string; mode: StudyMode }

export default function App() {
  const [words, setWords] = useState<VocabWord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressStore>(() => loadProgress())
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  useEffect(() => {
    fetch('/vocab.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load vocab.json')
        return r.json()
      })
      .then((data: VocabWord[]) => setWords(data))
      .catch((e: Error) => setError(e.message))
  }, [])

  const groups: WordGroup[] = useMemo(
    () => (words ? buildGroups(words) : []),
    [words],
  )

  const masterGroup: WordGroup | null = useMemo(
    () => (words ? buildMasterRevisionGroup(words, progress) : null),
    [words, progress],
  )

  function updateProgress(next: ProgressStore) {
    setProgress(next)
    saveProgress(next)
  }

  function clearProgress() {
    const empty = { words: {} }
    setProgress(empty)
    saveProgress(empty)
  }

  function findGroup(groupId: string): WordGroup | undefined {
    if (groupId === MASTER_REVISION_ID) {
      return masterGroup ?? undefined
    }
    return groups.find((g) => g.id === groupId)
  }

  const homeProps = {
    groups,
    masterGroup,
    progress,
    totalWords: words?.length ?? 0,
    onStudy: (groupId: string, mode: StudyMode) =>
      setScreen({ name: 'study', groupId, mode }),
    onClearProgress: clearProgress,
  }

  if (error) {
    return (
      <div className="boot-msg">
        <p>Failed to load words: {error}</p>
      </div>
    )
  }

  if (!words) {
    return (
      <div className="boot-msg">
        <p>Loading vocabulary…</p>
      </div>
    )
  }

  if (screen.name === 'study') {
    const group = findGroup(screen.groupId)
    if (!group) {
      return <Home {...homeProps} totalWords={words.length} />
    }
    return (
      <Study
        key={`${group.id}-${screen.mode}-${group.wordIds.length}`}
        group={group}
        allWords={words}
        progress={progress}
        mode={screen.mode}
        onProgressChange={updateProgress}
        onExit={() => setScreen({ name: 'home' })}
      />
    )
  }

  return <Home {...homeProps} totalWords={words.length} />
}
