import type { WordGroup, ProgressStore } from '../types'
import { countByStatus, getWordProgress } from '../lib/progress'
import './Home.css'

interface HomeProps {
  groups: WordGroup[]
  masterGroup: WordGroup | null
  progress: ProgressStore
  totalWords: number
  onStudy: (groupId: string, mode: 'learn' | 'revise') => void
  onClearProgress: () => void
}

export function Home({
  groups,
  masterGroup,
  progress,
  totalWords,
  onStudy,
  onClearProgress,
}: HomeProps) {
  const overallMastered = groups.reduce((sum, g) => {
    return sum + countByStatus(progress, g.wordIds).mastered
  }, 0)

  const hardCount = masterGroup?.wordIds.length ?? 0

  return (
    <div className="home">
      <header className="home-header">
        <p className="home-kicker">GRE Verbal</p>
        <h1 className="home-title">Vocab Drill</h1>
        <p className="home-sub">
          Type the meaning. No guessing from options unless you need them.
        </p>
        <div className="home-overall" aria-label="Overall progress">
          <div className="home-overall-bar">
            <div
              className="home-overall-fill"
              style={{
                width: `${totalWords ? (overallMastered / totalWords) * 100 : 0}%`,
              }}
            />
          </div>
          <span>
            {overallMastered} / {totalWords} mastered
          </span>
        </div>
        <button
          type="button"
          className="clear-progress"
          onClick={() => {
            if (
              window.confirm(
                'Clear all progress on this device? This cannot be undone.',
              )
            ) {
              onClearProgress()
            }
          }}
        >
          Clear progress
        </button>
      </header>

      <section className="master-revision" aria-label="Master revision">
        <div className={`group-card master-card${hardCount === 0 ? ' is-empty' : ''}`}>
          <div className="group-card-top">
            <div>
              <h2>Master revision</h2>
              <p className="group-meta">
                Missed or “don’t know” more than twice — from every group
              </p>
            </div>
            <span className="group-count group-count-hard">{hardCount}</span>
          </div>
          <div className="group-stats">
            <span data-tone="learning">
              {hardCount === 0
                ? 'No hard words yet'
                : `${hardCount} word${hardCount === 1 ? '' : 's'} need focused drill`}
            </span>
          </div>
          <div className="group-actions group-actions-single">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => masterGroup && onStudy(masterGroup.id, 'learn')}
              disabled={hardCount === 0}
            >
              {hardCount === 0 ? 'Empty for now' : 'Drill hard words'}
            </button>
          </div>
        </div>
      </section>

      <h3 className="section-label">Groups</h3>
      <ul className="group-list">
        {groups.map((g) => {
          const c = countByStatus(progress, g.wordIds)
          const hardInGroup = g.wordIds.filter((id) => {
            const p = getWordProgress(progress, id)
            return (p.missCount ?? 0) > 2 && p.status !== 'mastered'
          }).length
          const done = c.mastered === g.wordIds.length
          return (
            <li key={g.id} className={`group-card${done ? ' is-done' : ''}`}>
              <div className="group-card-top">
                <div>
                  <h2>{g.label}</h2>
                  <p className="group-meta">
                    Letters {g.letterRange} · {g.wordIds.length} words
                    {hardInGroup > 0 ? ` · ${hardInGroup} hard` : ''}
                  </p>
                </div>
                <span className="group-count">
                  {c.mastered}/{g.wordIds.length}
                </span>
              </div>
              <div className="group-stats">
                <span data-tone="learning">{c.learning + c.new} to learn</span>
                <span data-tone="known">{c.known} confirm</span>
                <span data-tone="mastered">{c.mastered} done</span>
              </div>
              <div className="group-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStudy(g.id, 'learn')}
                  disabled={c.remaining === 0}
                >
                  {c.remaining === 0 ? 'All mastered' : 'Study'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onStudy(g.id, 'revise')}
                  disabled={c.mastered === 0}
                >
                  Revise
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
