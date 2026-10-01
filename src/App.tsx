import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProgressStore, StudyMode, VocabWord, WordGroup } from './types'
import { MASTER_REVISION_ID } from './types'
import { buildGroups, buildMasterRevisionGroup } from './lib/groups'
import { emptyProgress, loadProgress, saveProgress } from './lib/progress'
import {
  clearSyncCode,
  ensureSyncCode,
  getSyncCode,
  isSyncConfigured,
  setSyncCode,
  syncNow,
} from './lib/sync'
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
  const [syncCode, setSyncCodeState] = useState(() =>
    isSyncConfigured() ? ensureSyncCode() : getSyncCode() ?? '',
  )
  const [syncStatus, setSyncStatus] = useState<string>('…')
  const pushTimer = useRef<number | null>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    fetch('/vocab.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load vocab.json')
        return r.json()
      })
      .then((data: VocabWord[]) => setWords(data))
      .catch((e: Error) => setError(e.message))
  }, [])

  async function runSync(label = 'Synced') {
    if (!isSyncConfigured()) {
      setSyncStatus('Sync offline')
      return
    }
    try {
      setSyncStatus('Syncing…')
      const merged = await syncNow(progressRef.current)
      setProgress(merged)
      saveProgress(merged)
      setSyncCodeState(ensureSyncCode())
      setSyncStatus(label)
    } catch (e) {
      console.error(e)
      setSyncStatus('Sync failed')
    }
  }

  // Initial sync + when tab becomes visible again
  useEffect(() => {
    void runSync('Synced')
    function onVisible() {
      if (document.visibilityState === 'visible') void runSync('Synced')
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void runSync('Synced'), 45_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function schedulePush(next: ProgressStore) {
    if (!isSyncConfigured()) return
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      const code = ensureSyncCode()
      void syncNow(next)
        .then((merged) => {
          // Only update if remote had something newer to merge in
          setProgress(merged)
          saveProgress(merged)
          setSyncStatus('Synced')
          setSyncCodeState(code)
        })
        .catch(() => setSyncStatus('Sync failed'))
    }, 600)
  }

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
    schedulePush(next)
  }

  function clearProgress() {
    const empty = emptyProgress()
    setProgress(empty)
    saveProgress(empty)
    schedulePush(empty)
  }

  function linkDevice(code: string) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    setSyncCode(normalized)
    setSyncCodeState(normalized)
    // Merge this device's local with the linked cloud progress
    void (async () => {
      try {
        setSyncStatus('Linking…')
        const merged = await syncNow(progressRef.current)
        setProgress(merged)
        saveProgress(merged)
        setSyncStatus('Linked & synced')
      } catch (e) {
        console.error(e)
        setSyncStatus('Link failed')
      }
    })()
  }

  function resetSyncCode() {
    clearSyncCode()
    const code = ensureSyncCode()
    setSyncCodeState(code)
    void runSync('New code ready')
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
    syncCode,
    syncStatus,
    syncEnabled: isSyncConfigured(),
    onLinkDevice: linkDevice,
    onSyncNow: () => void runSync('Synced'),
    onNewSyncCode: resetSyncCode,
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
