import { useEffect, useMemo, useState } from 'react'
import type { ProgressStore, StudyMode, VocabWord, WordGroup } from '../types'
import {
  applyGrade,
  buildSessionQueue,
  demoteToLearning,
  pickMeaningOptions,
  requeueAfterGrade,
} from '../lib/mastery'
import { getWordProgress } from '../lib/progress'
import { wordsInGroup } from '../lib/groups'
import './Study.css'

interface StudyProps {
  group: WordGroup
  allWords: VocabWord[]
  progress: ProgressStore
  mode: StudyMode
  onProgressChange: (next: ProgressStore) => void
  onExit: () => void
}

type Phase = 'prompt' | 'typing' | 'options' | 'reveal' | 'done'

export function Study({
  group,
  allWords,
  progress,
  mode,
  onProgressChange,
  onExit,
}: StudyProps) {
  const groupWords = useMemo(
    () => wordsInGroup(allWords, group),
    [allWords, group],
  )

  const initialQueue = useMemo(
    () => buildSessionQueue(group.wordIds, progress, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group.id, mode],
  )

  const [queue, setQueue] = useState<number[]>(initialQueue)
  const [phase, setPhase] = useState<Phase>(initialQueue.length ? 'prompt' : 'done')
  const [draft, setDraft] = useState('')
  const [usedHelp, setUsedHelp] = useState(false)
  const [showClue, setShowClue] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [seenCount, setSeenCount] = useState(0)
  const [preGradedMiss, setPreGradedMiss] = useState(false)
  const [pendingQueue, setPendingQueue] = useState<number[] | null>(null)

  const currentId = queue[0]
  const current = groupWords.find((w) => w.id === currentId)
  const wp = current ? getWordProgress(progress, current.id) : null

  const totalEstimate = seenCount + queue.length
  const progressPct =
    totalEstimate === 0 ? 100 : (seenCount / Math.max(totalEstimate, 1)) * 100

  function resetCardUi() {
    setDraft('')
    setUsedHelp(false)
    setShowClue(false)
    setOptions([])
    setPreGradedMiss(false)
    setPendingQueue(null)
  }

  function advanceWithStore(wordId: number, nextStore: ProgressStore) {
    const newQueue = requeueAfterGrade(queue, wordId, nextStore)
    setSeenCount((n) => n + 1)
    setQueue(newQueue)
    resetCardUi()
    setPhase(newQueue.length ? 'prompt' : 'done')
  }

  function startTyping() {
    setPhase('typing')
    setDraft('')
  }

  function handleDontKnow() {
    if (!current) return
    const next = applyGrade(progress, current.id, 'miss', {
      usedHelp: false,
      reviseMode: mode === 'revise',
    })
    onProgressChange(next)
    const newQueue = requeueAfterGrade(queue, current.id, next)
    setPendingQueue(newQueue)
    setPreGradedMiss(true)
    setDraft('')
    setUsedHelp(false)
    setPhase('reveal')
  }

  function handleSeeOptions() {
    if (!current) return
    setUsedHelp(true)
    setOptions(pickMeaningOptions(current, groupWords))
    setPhase('options')
  }

  function peekClue() {
    setShowClue(true)
    setUsedHelp(true)
  }

  function submitGuess() {
    setPhase('reveal')
  }

  function grade(outcome: 'correct' | 'miss') {
    if (!current) return
    if (preGradedMiss) {
      const nextQ = pendingQueue ?? queue.slice(1)
      setSeenCount((n) => n + 1)
      setQueue(nextQ)
      resetCardUi()
      setPhase(nextQ.length ? 'prompt' : 'done')
      return
    }
    const next = applyGrade(progress, current.id, outcome, {
      usedHelp,
      reviseMode: mode === 'revise',
    })
    onProgressChange(next)
    advanceWithStore(current.id, next)
  }

  function continueAfterDontKnow() {
    const nextQ = pendingQueue ?? queue.slice(1)
    setSeenCount((n) => n + 1)
    setQueue(nextQ)
    resetCardUi()
    setPhase(nextQ.length ? 'prompt' : 'done')
  }

  function onNotConfident() {
    if (!current) return
    const next = demoteToLearning(progress, current.id)
    onProgressChange(next)
    const rest = queue.slice(1)
    setSeenCount((n) => n + 1)
    setQueue(rest)
    resetCardUi()
    setPhase(rest.length ? 'prompt' : 'done')
  }

  useEffect(() => {
    if (phase !== 'reveal') return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey || e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      e.preventDefault()
      if (preGradedMiss) continueAfterDontKnow()
      else grade('correct')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (phase === 'done' || !current) {
    return (
      <div className="study study-done">
        <button type="button" className="back-link" onClick={onExit}>
          ← Groups
        </button>
        <h1>Group complete</h1>
        <p>
          {mode === 'revise'
            ? 'Finished revising mastered words in this group.'
            : 'All active words in this group are mastered for now.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          Back to groups
        </button>
      </div>
    )
  }

  const clue = current.clue || current.meaning.split(/[;.]/)[0]
  const example = current.example || ''

  return (
    <div className="study">
      <header className="study-top">
        <button type="button" className="back-link" onClick={onExit}>
          ← Exit
        </button>
        <div className="study-meta">
          <span>
            {group.label} · {mode === 'revise' ? 'Revise' : 'Study'}
          </span>
          <span>
            {queue.length} left
            {wp && wp.status !== 'new' ? ` · ${wp.status}` : ''}
          </span>
        </div>
        <div className="study-bar" aria-hidden>
          <div className="study-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      <div className="study-stage">
        <div className="study-hero">
          <p className="study-label">What does this mean?</p>
          <h1 className="study-word">{current.word}</h1>
        </div>

        {(phase === 'prompt' || phase === 'typing') && (
          <div className="study-assist">
            {showClue ? (
              <div className="info-card clue-card">
                <span className="reveal-label">Clue</span>
                <p>{clue}</p>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost clue-peek" onClick={peekClue}>
                Peek clue
              </button>
            )}
          </div>
        )}

        {phase === 'prompt' && (
          <div className="study-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={startTyping}>
              Guess
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={handleDontKnow}
            >
              I don&apos;t know
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={handleSeeOptions}
            >
              See options
            </button>
          </div>
        )}

        {phase === 'typing' && (
          <form
            className="study-type"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) submitGuess()
            }}
          >
            <label htmlFor="meaning-input" className="sr-only">
              Type the meaning
            </label>
            <textarea
              id="meaning-input"
              className="meaning-input"
              rows={2}
              placeholder="Type the meaning…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (draft.trim()) submitGuess()
                }
              }}
              autoFocus
              enterKeyHint="done"
            />
            {usedHelp && (
              <p className="help-note">Help was used — counts as helped.</p>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={!draft.trim()}
            >
              Check
            </button>
          </form>
        )}

        {phase === 'options' && (
          <div className="study-options">
            <p className="options-hint">
              Peek for a hint, then type the meaning. Using options marks this word
              for extra practice.
            </p>
            <ul className="options-list">
              {options.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    className="option-chip"
                    onClick={() => {
                      setDraft(opt)
                      setPhase('typing')
                    }}
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => setPhase('typing')}
            >
              Type my answer
            </button>
          </div>
        )}

        {phase === 'reveal' && (
          <div className="study-reveal">
            {draft.trim() && (
              <div className="info-card your-answer">
                <span className="reveal-label">You wrote</span>
                <p>{draft.trim()}</p>
              </div>
            )}
            <div className="info-card correct-answer">
              <span className="reveal-label">Meaning</span>
              <p>{current.meaning}</p>
            </div>
            <div className="info-card clue-card">
              <span className="reveal-label">Clue</span>
              <p>{clue}</p>
            </div>
            {example && (
              <div className="info-card example-card">
                <span className="reveal-label">Example</span>
                <p>{example}</p>
              </div>
            )}

            {preGradedMiss ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={continueAfterDontKnow}
              >
                Next word
              </button>
            ) : (
              <div className="grade-row">
                <button
                  type="button"
                  className="btn btn-good btn-lg"
                  onClick={() => grade('correct')}
                >
                  Got it
                </button>
                <button
                  type="button"
                  className="btn btn-bad btn-lg"
                  onClick={() => grade('miss')}
                >
                  Missed
                </button>
              </div>
            )}

            {(mode === 'revise' || wp?.status === 'mastered') && !preGradedMiss && (
              <button type="button" className="btn btn-ghost" onClick={onNotConfident}>
                Not confident — needs revise
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
