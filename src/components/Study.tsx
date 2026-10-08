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

  const showAnswer = phase === 'reveal'
  const canSelfGrade = showAnswer && !preGradedMiss

  function resetCardUi() {
    setDraft('')
    setUsedHelp(false)
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

  function flipCard() {
    if (!current || phase !== 'prompt') return
    setPhase('reveal')
  }

  function markKnown() {
    if (!current || phase !== 'prompt') return
    grade('correct')
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
      if (e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (preGradedMiss) continueAfterDontKnow()
        else grade('correct')
        return
      }

      if (preGradedMiss) return

      if (e.key === 'ArrowRight' || e.key === '1') {
        e.preventDefault()
        grade('correct')
      } else if (e.key === 'ArrowLeft' || e.key === '2') {
        e.preventDefault()
        grade('miss')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (phase !== 'prompt') return

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        flipCard()
      }
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
        <article
          className={`flash-card${showAnswer ? ' is-flipped' : ''}`}
          aria-live="polite"
        >
          <button
            type="button"
            className="flash-card-face"
            onClick={phase === 'prompt' ? flipCard : undefined}
            disabled={phase !== 'prompt'}
            aria-label={
              phase === 'prompt'
                ? `Flashcard: ${current.word}. Tap to reveal meaning.`
                : undefined
            }
          >
            <p className="study-label">
              {showAnswer ? 'Meaning' : 'What does this mean?'}
            </p>
            <h1 className="study-word">{current.word}</h1>

            {showAnswer ? (
              <div className="flash-card-answer">
                <p className="flash-meaning">{current.meaning}</p>
                {current.mnemonic && (
                  <div className="flash-detail">
                    <span className="reveal-label">Mnemonic</span>
                    <p>{current.mnemonic}</p>
                  </div>
                )}
                {current.example && (
                  <div className="flash-detail flash-example">
                    <span className="reveal-label">Example</span>
                    <p>{current.example}</p>
                  </div>
                )}
                {draft.trim() && (
                  <div className="flash-detail flash-guess">
                    <span className="reveal-label">You wrote</span>
                    <p>{draft.trim()}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="flash-hint">
                Tap to flip · Guess to type · ✓ / ✗ to grade fast
              </p>
            )}
          </button>

          {(phase === 'prompt' || showAnswer) && (
            <footer className="flash-card-footer">
              {phase === 'prompt' && (
                <>
                  <button
                    type="button"
                    className="flash-footer-btn flash-footer-miss"
                    onClick={handleDontKnow}
                    aria-label="I don't know"
                    title="I don't know"
                  >
                    <span aria-hidden="true">✗</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flash-guess-btn"
                    onClick={startTyping}
                  >
                    Guess
                  </button>
                  <button
                    type="button"
                    className="flash-footer-btn flash-footer-ok"
                    onClick={markKnown}
                    aria-label="I know it"
                    title="I know it"
                  >
                    <span aria-hidden="true">✓</span>
                  </button>
                </>
              )}

              {canSelfGrade && (
                <>
                  <button
                    type="button"
                    className="flash-footer-btn flash-footer-miss"
                    onClick={() => grade('miss')}
                    aria-label="Missed"
                    title="Missed"
                  >
                    <span aria-hidden="true">✗</span>
                  </button>
                  <p className="flash-footer-label">Did you know it?</p>
                  <button
                    type="button"
                    className="flash-footer-btn flash-footer-ok"
                    onClick={() => grade('correct')}
                    aria-label="Got it"
                    title="Got it"
                  >
                    <span aria-hidden="true">✓</span>
                  </button>
                </>
              )}

              {preGradedMiss && showAnswer && (
                <button
                  type="button"
                  className="btn btn-primary flash-next-btn"
                  onClick={continueAfterDontKnow}
                >
                  Next word
                </button>
              )}
            </footer>
          )}
        </article>

        {phase === 'prompt' && (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={handleSeeOptions}
          >
            See options
          </button>
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
            <div className="typing-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDraft('')
                  setPhase('prompt')
                }}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={!draft.trim()}
              >
                Check
              </button>
            </div>
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setUsedHelp(false)
                setOptions([])
                setPhase('prompt')
              }}
            >
              Back to card
            </button>
          </div>
        )}

        {canSelfGrade && (mode === 'revise' || wp?.status === 'mastered') && (
          <button type="button" className="btn btn-ghost" onClick={onNotConfident}>
            Not confident — needs revise
          </button>
        )}
      </div>
    </div>
  )
}
