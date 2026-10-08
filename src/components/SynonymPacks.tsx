import { useMemo, useState } from 'react'
import type { PackProgressStore, SynonymPack, VocabWord } from '../types'
import {
  countPacksByStatus,
  getPackStatus,
  setPackStatus,
} from '../lib/packs'
import './SynonymPacks.css'

interface SynonymPacksProps {
  packs: SynonymPack[]
  allWords: VocabWord[]
  packProgress: PackProgressStore
  onPackProgressChange: (next: PackProgressStore) => void
  onExit: () => void
}

export function SynonymPacks({
  packs,
  allWords,
  packProgress,
  onPackProgressChange,
  onExit,
}: SynonymPacksProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'review' | 'new' | 'known'>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  const meaningById = useMemo(() => {
    const map = new Map<number, string>()
    for (const w of allWords) map.set(w.id, w.meaning)
    return map
  }, [allWords])

  const stats = useMemo(
    () => countPacksByStatus(packProgress, packs),
    [packProgress, packs],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return packs.filter((pack) => {
      const status = getPackStatus(packProgress, pack.id)
      if (filter !== 'all' && status !== filter) return false
      if (!q) return true
      if (pack.theme.toLowerCase().includes(q)) return true
      if (pack.gloss.toLowerCase().includes(q)) return true
      return pack.words.some((w) => w.word.toLowerCase().includes(q))
    })
  }, [packs, packProgress, query, filter])

  const active = activeId ? packs.find((p) => p.id === activeId) : null

  function grade(packId: string, status: 'known' | 'review') {
    onPackProgressChange(setPackStatus(packProgress, packId, status))
  }

  if (active) {
    const status = getPackStatus(packProgress, active.id)
    return (
      <div className="packs packs-detail">
        <header className="packs-top">
          <button type="button" className="back-link" onClick={() => setActiveId(null)}>
            ← All packs
          </button>
          <p className="packs-status-pill" data-status={status}>
            {status === 'known'
              ? 'Marked known'
              : status === 'review'
                ? 'Needs review'
                : 'Not marked yet'}
          </p>
        </header>

        <article className="pack-sheet">
          <p className="pack-kicker">Synonym pack · {active.words.length} words</p>
          <h1 className="pack-theme">{active.theme}</h1>
          <p className="pack-gloss">{active.gloss}</p>

          <ul className="pack-word-list">
            {active.words.map((w) => (
              <li key={w.id} className="pack-word-row">
                <div className="pack-word-head">
                  <span className="pack-word">{w.word}</span>
                  {w.nuance && <span className="pack-nuance">{w.nuance}</span>}
                </div>
                <p className="pack-meaning">{meaningById.get(w.id) ?? ''}</p>
              </li>
            ))}
          </ul>

          <footer className="pack-sheet-footer">
            <button
              type="button"
              className="flash-footer-btn flash-footer-miss"
              onClick={() => grade(active.id, 'review')}
              aria-label="Need this pack again"
              title="Need this pack again"
            >
              <span aria-hidden="true">✗</span>
            </button>
            <p className="pack-footer-label">Know this family?</p>
            <button
              type="button"
              className="flash-footer-btn flash-footer-ok"
              onClick={() => grade(active.id, 'known')}
              aria-label="Got this pack"
              title="Got this pack"
            >
              <span aria-hidden="true">✓</span>
            </button>
          </footer>
        </article>

        <div className="pack-nav">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const idx = filtered.findIndex((p) => p.id === active.id)
              const prev = filtered[idx - 1] ?? filtered[filtered.length - 1]
              if (prev) setActiveId(prev.id)
            }}
            disabled={filtered.length < 2}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              grade(active.id, 'known')
              const idx = filtered.findIndex((p) => p.id === active.id)
              const next = filtered[idx + 1]
              if (next) setActiveId(next.id)
              else setActiveId(null)
            }}
          >
            ✓ & next
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="packs">
      <header className="packs-top">
        <button type="button" className="back-link" onClick={onExit}>
          ← Home
        </button>
        <h1 className="packs-title">Synonym packs</h1>
        <p className="packs-sub">
          Scan meaning families together. Mark the whole pack ✓ or ✗ — no typing.
        </p>
        <div className="packs-stats">
          <span>{stats.known} known</span>
          <span>{stats.review} review</span>
          <span>{stats.new} new</span>
          <span>{stats.total} packs</span>
        </div>
      </header>

      <label className="packs-search-label" htmlFor="pack-search">
        Search themes or words
      </label>
      <input
        id="pack-search"
        className="packs-search"
        placeholder="e.g. capricious, praise, stubborn…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="packs-filters" role="tablist" aria-label="Filter packs">
        {(
          [
            ['all', 'All'],
            ['review', 'Review'],
            ['new', 'New'],
            ['known', 'Known'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`packs-filter${filter === id ? ' is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="packs-list">
        {filtered.map((pack) => {
          const status = getPackStatus(packProgress, pack.id)
          return (
            <li key={pack.id}>
              <button
                type="button"
                className="packs-list-item"
                onClick={() => setActiveId(pack.id)}
              >
                <div className="packs-list-main">
                  <h2>{pack.theme}</h2>
                  <p>{pack.gloss}</p>
                  <p className="packs-list-words">
                    {pack.words.map((w) => w.word).join(' · ')}
                  </p>
                </div>
                <div className="packs-list-meta">
                  <span className="packs-count">{pack.words.length}</span>
                  <span className="packs-status-dot" data-status={status}>
                    {status}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="packs-empty">No packs match that search.</p>
      )}
    </div>
  )
}
