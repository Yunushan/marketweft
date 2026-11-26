import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { MacroRecord, MacroRelease, MarketCore } from './market-core'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-macro-calendar.csv?raw'

type Cutoffs = { published: string; known: string }
type Source = { csv: string; name: string; demo: boolean }

function reading(record: MacroRecord | null, unit: string) {
  return record?.value == null ? '—' : fixed(record.value, 6) + ' ' + unit
}

function ReleaseCard({ release }: { release: MacroRelease }) {
  const current = release.actualHistory.at(-1) ?? null
  const scheduled = release.schedule?.scheduledAt
  return (
    <article className="side-card replay-panel macro-release" aria-labelledby={'macro-' + release.releaseId}>
      <div className="replay-heading">
        <div>
          <h3 id={'macro-' + release.releaseId}>{release.seriesId}</h3>
          <p>{release.releaseId} · Reference date {utc(release.referenceDate).slice(0, 10)}</p>
        </div>
      </div>
      <dl className="replay-times">
        <div><dt>Scheduled UTC</dt><dd>{scheduled == null ? '—' : utc(scheduled)}</dd></div>
        <div><dt>Forecast</dt><dd>{reading(release.forecast, release.unit)}</dd></div>
        <div><dt>Actual</dt><dd>{current ? reading(current, release.unit) : 'Awaiting actual'}</dd></div>
      </dl>
      <details>
        <summary>Release evidence</summary>
        {release.schedule && (
          <p>Schedule {release.schedule.recordId} · Known {utc(release.schedule.observedAt)}</p>
        )}
        {release.forecast && (
          <p>Forecast {release.forecast.recordId} · Known {utc(release.forecast.observedAt)}</p>
        )}
        {release.actualHistory.length > 0 && (
          <div className="replay-table-scroll">
            <table className="universe-table" aria-label={release.seriesId + ' actual and revisions'}>
              <thead>
                <tr><th scope="col">Record</th><th scope="col">Value</th><th scope="col">Published UTC</th>
                  <th scope="col">Known UTC</th><th scope="col">Supersedes</th></tr>
              </thead>
              <tbody>
                {release.actualHistory.map((record) => (
                  <tr key={record.recordId}>
                    <th scope="row">{record.recordId}</th><td>{reading(record, release.unit)}</td>
                    <td>{utc(record.publishedAt)}</td><td>{utc(record.observedAt)}</td>
                    <td>{record.supersedes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </article>
  )
}

export function MacroReplay({ core, close }: { core: MarketCore; close: () => void }) {
  const [source, setSource] = useState<Source | null>(null)
  const [draft, setDraft] = useState<Cutoffs>({ published: '', known: '' })
  const [result, setResult] = useState<(Cutoffs & { releases: MacroRelease[] }) | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  function run(csv: string, requested: Cutoffs) {
    const cutoffs = { published: requested.published.trim(), known: requested.known.trim() }
    const releases = core.macroAsOf(csv, cutoffs.published, cutoffs.known)
    setResult({ ...cutoffs, releases })
    setDraft(cutoffs)
    setError('')
  }

  function start(csv: string, name: string, demo = false) {
    const at = utc(core.macroIndex(csv))
    run(csv, { published: at, known: at })
    setSource({ csv, name, demo })
  }

  function openDemo() {
    try {
      start(demo, 'Synthetic economic releases', true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the calendar demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 1024 * 1024) throw new Error('Macro calendar CSV exceeds 1 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      start(csv, file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the calendar.')
    } finally {
      setBusy(false)
    }
  }

  function submit(cutoffs: Cutoffs) {
    if (!source) return
    try {
      run(source.csv, cutoffs)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not query the calendar.')
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Economic calendar</h1></div>
        {!source || !result ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Economic calendar demo</h2>
              <p>Follow a scheduled release through a forecast, a late actual and two revisions.</p>
              <button className="primary" disabled={busy} onClick={openDemo}>Start calendar demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open macro reports</h2>
              <label>Macro calendar CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !file}>Load macro calendar</button>
            </form>
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div><h2>Release cutoffs</h2><p>{source.name}</p></div>
                <button className="outline" onClick={() => {
                  setSource(null)
                  setResult(null)
                  setFile(null)
                  setError('')
                  heading.current?.focus()
                }}>Change calendar</button>
              </div>
              <form className="universe-query" onSubmit={(event) => {
                event.preventDefault()
                submit(draft)
              }}>
                <label>Published through (UTC)
                  <input required value={draft.published} spellCheck={false} autoComplete="off"
                    onChange={(event) => setDraft({ ...draft, published: event.target.value })} />
                </label>
                <label>Known time (UTC)
                  <input required value={draft.known} spellCheck={false} autoComplete="off"
                    onChange={(event) => setDraft({ ...draft, known: event.target.value })} />
                </label>
                <button className="primary">Run calendar query</button>
              </form>
              {source.demo && (
                <div className="replay-controls">
                  {[
                    ['Before release', '14:29:59'],
                    ['Actual observed', '14:32:00'],
                    ['Revised actual', '14:52:00'],
                  ].map(([name, time]) => {
                    const at = '2025-04-03T' + time + 'Z'
                    return <button className="outline" key={time}
                      onClick={() => submit({ published: at, known: at })}>{name}</button>
                  })}
                </div>
              )}
            </section>
            <section className="replay-results macro-results" aria-label="Calendar results">
              <p role="status">Published through {result.published} · Known through {result.known}</p>
              {result.releases.length === 0 && <p>No release records at these cutoffs.</p>}
              {result.releases.map((release) => <ReleaseCard key={release.releaseId} release={release} />)}
            </section>
          </>
        )}
        {error && <p className="warning replay-error" role="alert">{error}</p>}
      </main>
    </>
  )
}
