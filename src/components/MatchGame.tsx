import { useMemo, useRef, useState } from 'react'
import type { ProgressStore, VocabWord, WordGroup } from '../types'
import { applyGrade, buildSessionQueue } from '../lib/mastery'
import { wordsInGroup } from '../lib/groups'
import './MatchGame.css'

interface MatchGameProps {
  group: WordGroup
  allWords: VocabWord[]
  progress: ProgressStore
  onProgressChange: (next: ProgressStore) => void
  onExit: () => void
}

const BATCH_SIZE = 5

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Side = 'word' | 'meaning'

function takeBatch(queue: number[]): { batch: number[]; rest: number[] } {
  return {
    batch: queue.slice(0, BATCH_SIZE),
    rest: queue.slice(BATCH_SIZE),
  }
}

export function MatchGame({
  group,
  allWords,
  progress,
  onProgressChange,
  onExit,
}: MatchGameProps) {
  const groupWords = useMemo(
    () => wordsInGroup(allWords, group),
    [allWords, group],
  )

  const byId = useMemo(() => {
    const map = new Map<number, VocabWord>()
    for (const w of groupWords) map.set(w.id, w)
    return map
  }, [groupWords])

  const initial = useMemo(() => {
    const learn = buildSessionQueue(group.wordIds, progress, 'learn')
    const ids = learn.length > 0 ? learn : buildSessionQueue(group.wordIds, progress, 'revise')
    const { batch, rest } = takeBatch(ids)
    return { batch, rest, empty: ids.length === 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  const [queue, setQueue] = useState<number[]>(initial.rest)
  const [board, setBoard] = useState<number[]>(initial.batch)
  const [meaningOrder, setMeaningOrder] = useState<number[]>(() =>
    shuffle(initial.batch),
  )
  const [selectedWord, setSelectedWord] = useState<number | null>(null)
  const [selectedMeaning, setSelectedMeaning] = useState<number | null>(null)
  const [wobbleIds, setWobbleIds] = useState<number[]>([])
  const [leavingIds, setLeavingIds] = useState<number[]>([])
  const [missedIds, setMissedIds] = useState<Set<number>>(() => new Set())
  const [matchedCount, setMatchedCount] = useState(0)
  const [done, setDone] = useState(initial.empty)
  const [locked, setLocked] = useState(false)

  const progressRef = useRef(progress)
  progressRef.current = progress
  const missedRef = useRef(missedIds)
  missedRef.current = missedIds
  const queueRef = useRef(queue)
  queueRef.current = queue
  const boardRef = useRef(board)
  boardRef.current = board

  const totalLeft = queue.length + board.length

  function dealNext(nextQueue: number[]) {
    const { batch, rest } = takeBatch(nextQueue)
    setQueue(rest)
    setBoard(batch)
    setMeaningOrder(shuffle(batch))
    setSelectedWord(null)
    setSelectedMeaning(null)
    setWobbleIds([])
    setLeavingIds([])
    setMissedIds(new Set())
    setLocked(false)
    if (batch.length === 0) setDone(true)
  }

  function resolvePair(wordId: number, meaningId: number) {
    if (locked) return
    setLocked(true)

    if (wordId === meaningId) {
      setLeavingIds([wordId])
      const nextProgress = applyGrade(progressRef.current, wordId, 'correct', {
        usedHelp: false,
        reviseMode: false,
      })
      onProgressChange(nextProgress)
      progressRef.current = nextProgress

      const replay = missedRef.current.has(wordId)

      window.setTimeout(() => {
        const remainingBoard = boardRef.current.filter((id) => id !== wordId)
        let nextQueue = queueRef.current
        if (replay) nextQueue = [...nextQueue, wordId]

        setMatchedCount((n) => n + 1)
        setLeavingIds([])
        setSelectedWord(null)
        setSelectedMeaning(null)
        setMeaningOrder((order) => order.filter((id) => id !== wordId))

        if (replay) {
          setMissedIds((prev) => {
            const copy = new Set(prev)
            copy.delete(wordId)
            return copy
          })
        }

        if (remainingBoard.length === 0) {
          dealNext(nextQueue)
        } else {
          setBoard(remainingBoard)
          setQueue(nextQueue)
          setLocked(false)
        }
      }, 300)
      return
    }

    // Wrong — wobble and stay; both words come back later
    setWobbleIds([wordId, meaningId])
    let nextProgress = applyGrade(progressRef.current, wordId, 'miss', {
      usedHelp: false,
      reviseMode: false,
    })
    if (meaningId !== wordId) {
      nextProgress = applyGrade(nextProgress, meaningId, 'miss', {
        usedHelp: false,
        reviseMode: false,
      })
    }
    onProgressChange(nextProgress)
    progressRef.current = nextProgress

    setMissedIds((prev) => {
      const copy = new Set(prev)
      copy.add(wordId)
      copy.add(meaningId)
      return copy
    })

    window.setTimeout(() => {
      setWobbleIds([])
      setSelectedWord(null)
      setSelectedMeaning(null)
      setLocked(false)
    }, 550)
  }

  function onPick(side: Side, id: number) {
    if (locked || leavingIds.includes(id) || !board.includes(id)) return

    if (side === 'word') {
      if (selectedWord === id) {
        setSelectedWord(null)
        return
      }
      const nextWord = id
      setSelectedWord(nextWord)
      if (selectedMeaning !== null) resolvePair(nextWord, selectedMeaning)
      return
    }

    if (selectedMeaning === id) {
      setSelectedMeaning(null)
      return
    }
    const nextMeaning = id
    setSelectedMeaning(nextMeaning)
    if (selectedWord !== null) resolvePair(selectedWord, nextMeaning)
  }

  if (done) {
    return (
      <div className="match match-done">
        <button type="button" className="back-link" onClick={onExit}>
          ← Groups
        </button>
        <h1>Round clear</h1>
        <p>
          {matchedCount === 0
            ? 'No words left to match in this group.'
            : `Matched ${matchedCount} pair${matchedCount === 1 ? '' : 's'}. Misses were sent back into the queue.`}
        </p>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          Back to groups
        </button>
      </div>
    )
  }

  return (
    <div className="match">
      <header className="match-top">
        <button type="button" className="back-link" onClick={onExit}>
          ← Exit
        </button>
        <div className="match-meta">
          <span>{group.label} · Match</span>
          <span>
            {board.length} on board · {totalLeft} left
          </span>
        </div>
        <p className="match-hint">Tap a word, then its meaning</p>
      </header>

      <div className="match-board" aria-label="Match words to meanings">
        <div className="match-col" aria-label="Words">
          <p className="match-col-label">Word</p>
          {board.map((id) => {
            const w = byId.get(id)
            if (!w) return null
            return (
              <button
                key={`w-${id}`}
                type="button"
                className={[
                  'match-tile',
                  'match-tile-word',
                  selectedWord === id ? 'is-selected' : '',
                  wobbleIds.includes(id) ? 'is-wobble' : '',
                  leavingIds.includes(id) ? 'is-matched' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPick('word', id)}
                disabled={locked && !wobbleIds.includes(id)}
              >
                {w.word}
              </button>
            )
          })}
        </div>

        <div className="match-col" aria-label="Meanings">
          <p className="match-col-label">Meaning</p>
          {meaningOrder.map((id) => {
            const w = byId.get(id)
            if (!w) return null
            return (
              <button
                key={`m-${id}`}
                type="button"
                className={[
                  'match-tile',
                  'match-tile-meaning',
                  selectedMeaning === id ? 'is-selected' : '',
                  wobbleIds.includes(id) ? 'is-wobble' : '',
                  leavingIds.includes(id) ? 'is-matched' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPick('meaning', id)}
                disabled={locked && !wobbleIds.includes(id)}
              >
                {w.meaning}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
