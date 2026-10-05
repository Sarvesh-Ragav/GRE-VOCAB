import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProgressStore, StudyMode, VocabWord, WordGroup } from './types'
import { FOCUS_GROUP_ID, MASTER_REVISION_ID } from './types'
import {
  buildFocusGroup,
  buildGroups,
  buildMasterRevisionGroup,
} from './lib/groups'
import { emptyProgress, loadProgress, saveProgress } from './lib/progress'
import { persistProgress, restoreProgress, wordCount } from './lib/storage'
import {
  clearSyncCode,
  ensureSyncCode,
  getSyncCode,
  isSyncConfigured,
  resolveSyncCode,
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
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [syncCode, setSyncCodeState] = useState(() => getSyncCode() ?? '')
  const [syncStatus, setSyncStatus] = useState<string>('Restoring…')
  const pushTimer = useRef<number | null>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const booting = useRef(true)

  useEffect(() => {
    fetch('/vocab.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load vocab.json')
        return r.json()
      })
      .then((data: VocabWord[]) => setWords(data))
      .catch((e: Error) => setError(e.message))
  }, [])

  async function saveAll(next: ProgressStore) {
    saveProgress(next)
    await persistProgress(next)
  }

  async function runSync(label = 'Synced', allowEmptyPush = false) {
    if (!isSyncConfigured()) {
      setSyncStatus('Sync offline — progress saved on this device only')
      return
    }
    try {
      setSyncStatus('Syncing…')
      const code = await resolveSyncCode()
      setSyncCodeState(code)
      const merged = await syncNow(progressRef.current, { allowEmptyPush })
      setProgress(merged)
      await saveAll(merged)
      setSyncStatus(
        wordCount(merged) === 0 ? label : `${label} · ${wordCount(merged)} words`,
      )
    } catch (e) {
      console.error(e)
      setSyncStatus('Sync failed — local progress kept')
    }
  }

  // Boot: restore from IndexedDB if needed, then sync from cloud
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const restored = await restoreProgress()
        if (cancelled) return
        if (wordCount(restored) > wordCount(progressRef.current)) {
          setProgress(restored)
          saveProgress(restored)
          progressRef.current = restored
        }
        const code = await resolveSyncCode()
        if (!cancelled) setSyncCodeState(code)
        if (isSyncConfigured()) {
          setSyncStatus('Syncing…')
          const merged = await syncNow(progressRef.current, {
            allowEmptyPush: false,
          })
          if (cancelled) return
          setProgress(merged)
          await saveAll(merged)
          setSyncStatus(
            wordCount(merged) > 0
              ? `Synced · ${wordCount(merged)} words`
              : 'Synced',
          )
        } else {
          setSyncStatus('Sync offline — add Vercel env vars to keep progress')
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setSyncStatus('Restore issue — try Sync now')
      } finally {
        booting.current = false
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh from cloud when returning to the tab
  useEffect(() => {
    if (!ready) return
    function onVisible() {
      if (document.visibilityState === 'visible' && !booting.current) {
        void runSync('Synced')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => {
      if (!booting.current) void runSync('Synced')
    }, 45_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  function schedulePush(next: ProgressStore, allowEmptyPush = false) {
    if (!isSyncConfigured()) return
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void syncNow(next, { allowEmptyPush })
        .then(async (merged) => {
          setProgress(merged)
          await saveAll(merged)
          setSyncStatus('Synced')
          setSyncCodeState(ensureSyncCode())
        })
        .catch(() => setSyncStatus('Sync failed — local progress kept'))
    }, 600)
  }

  const groups: WordGroup[] = useMemo(
    () => (words ? buildGroups(words) : []),
    [words],
  )

  const focusGroup: WordGroup | null = useMemo(
    () => (words ? buildFocusGroup(words) : null),
    [words],
  )

  const masterGroup: WordGroup | null = useMemo(
    () => (words ? buildMasterRevisionGroup(words, progress) : null),
    [words, progress],
  )

  function updateProgress(next: ProgressStore) {
    setProgress(next)
    void saveAll(next)
    schedulePush(next, false)
  }

  function clearProgress() {
    const empty = emptyProgress()
    setProgress(empty)
    void saveAll(empty)
    schedulePush(empty, true)
  }

  function linkDevice(code: string) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    setSyncCode(normalized)
    setSyncCodeState(normalized)
    void (async () => {
      try {
        setSyncStatus('Linking…')
        const merged = await syncNow(progressRef.current, {
          allowEmptyPush: false,
        })
        setProgress(merged)
        await saveAll(merged)
        setSyncStatus(
          wordCount(merged) > 0
            ? `Linked · ${wordCount(merged)} words restored`
            : 'Linked & synced',
        )
      } catch (e) {
        console.error(e)
        setSyncStatus('Link failed')
      }
    })()
  }

  function resetSyncCode() {
    clearSyncCode()
    // If env default exists, resolveSyncCode will put it back
    void (async () => {
      const code = await resolveSyncCode()
      setSyncCodeState(code)
      await runSync('Code ready')
    })()
  }

  function findGroup(groupId: string): WordGroup | undefined {
    if (groupId === MASTER_REVISION_ID) {
      return masterGroup ?? undefined
    }
    if (groupId === FOCUS_GROUP_ID) {
      return focusGroup ?? undefined
    }
    return groups.find((g) => g.id === groupId)
  }

  const homeProps = {
    groups,
    masterGroup,
    focusGroup,
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

  if (!words || !ready) {
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
