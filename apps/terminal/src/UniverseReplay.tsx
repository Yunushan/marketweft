import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, UniverseListing } from './market-core'
import { Mark } from './Icons'
import { UniverseScreen } from './UniverseScreen'
import { DelistingReplay } from './DelistingReplay'
import { utc } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-universe.csv?raw'

const statuses = { member: 'Member', removed: 'Removed', delisted: 'Delisted' }
type Cutoffs = { effective: string; known: string }
type Dataset = {
  name: string
  csv: string
  checkpoints: number[]
  source: string
  demo: boolean
}
type Result = Cutoffs & {
  listings: UniverseListing[]
  checkpoint: number | null
}

function atCheckpoint(checkpoint: number): Cutoffs {
  const cutoff = utc(checkpoint)
  return { effective: cutoff, known: cutoff }
}

export function UniverseReplay({
  core,
  close,
}: {
  core: MarketCore
  close: () => void
}) {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [draft, setDraft] = useState<Cutoffs>({ effective: '', known: '' })
  const [cursor, setCursor] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    title.current?.focus()
  }, [])

  function snapshot(
    csv: string,
    cutoffs: Cutoffs,
    checkpoint: number | null,
  ): Result {
    return {
      ...cutoffs,
      checkpoint,
      listings: core.universeAsOf(csv, cutoffs.effective, cutoffs.known),
    }
  }

  function start(csv: string, source: string, demo = false) {
    const book = core.universeIndex(csv)
    const first = atCheckpoint(book.checkpoints[0])
    const initial = snapshot(csv, first, 0)
    setDataset({ ...book, csv, source, demo })
    setResult(initial)
    setDraft(first)
    setCursor(0)
  }

  function tryDemo() {
    setError('')
    try {
      start(demo, 'Synthetic membership reports', true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not open the universe demo.',
      )
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 1024 * 1024)
        throw Error('Universe membership CSV exceeds 1 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
      start(csv, file.name)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not open the universe history.',
      )
    } finally {
      setBusy(false)
    }
  }

  function step(index: number) {
    if (!dataset) return
    const value = atCheckpoint(dataset.checkpoints[index])
    setResult(snapshot(dataset.csv, value, index))
    setDraft(value)
    setCursor(index)
    setError('')
  }

  function query(event: FormEvent) {
    event.preventDefault()
    if (!dataset) return
    setError('')
    try {
      const cutoffs = {
        effective: draft.effective.trim(),
        known: draft.known.trim(),
      }
      setResult(snapshot(dataset.csv, cutoffs, null))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not query the universe.',
      )
    }
  }

  const members =
    result?.listings.filter((row) => row.status === 'member').length ?? 0

  return (
    <>
      <header className="app-header">
        <div className="app-brand">
          <Mark />
          <strong>MarketWeft</strong>
        </div>
        <button className="outline" onClick={close}>
          Return to historical replay
        </button>
      </header>
      <main className="replay-page">
        <div className="page-head">
          <h1 ref={title} tabIndex={-1}>
            Universe replay
          </h1>
        </div>
        {!dataset || !result ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Universe demo</h2>
              <p>
                Step through an addition, a late removal and a delisting. Query
                what was effective and what was known independently.
              </p>
              <button className="primary" onClick={tryDemo} disabled={busy}>
                Start universe demo
              </button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open a universe history</h2>
              <label>
                Universe membership CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  required
                  disabled={busy}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <details>
                <summary>Universe CSV format</summary>
                <p>
                  Use one universe, stable change and listing IDs, canonical
                  instrument labels and exact UTC times. Use add, remove, delist
                  or cancel as the action.
                </p>
                <pre>
                  universe,change_id,listing_id,instrument,effective_at,observed_at,action
                </pre>
              </details>
              <button className="primary" disabled={busy || !file}>
                Load universe
              </button>
            </form>
            {error && (
              <p className="warning replay-error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div>
                  <h2>{dataset.name}</h2>
                  <p>{dataset.source}</p>
                </div>
                <button
                  className="outline"
                  onClick={() => {
                    setDataset(null)
                    setResult(null)
                    setFile(null)
                    setError('')
                    title.current?.focus()
                  }}
                >
                  Change universe
                </button>
              </div>
              <div className="replay-controls">
                <button
                  className="outline"
                  disabled={cursor === 0}
                  onClick={() => step(cursor - 1)}
                >
                  Previous cutoff
                </button>
                <button
                  className="primary"
                  disabled={cursor + 1 === dataset.checkpoints.length}
                  onClick={() => step(cursor + 1)}
                >
                  Next cutoff
                </button>
              </div>
              <form className="universe-query" onSubmit={query}>
                <label>
                  Effective time (UTC)
                  <input
                    type="text"
                    required
                    value={draft.effective}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      setDraft({ ...draft, effective: event.target.value })
                    }
                  />
                </label>
                <label>
                  Known time (UTC)
                  <input
                    type="text"
                    required
                    value={draft.known}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      setDraft({ ...draft, known: event.target.value })
                    }
                  />
                </label>
                <button className="outline">Run as-of query</button>
              </form>
              {error && (
                <p className="warning" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section
              className="side-card replay-panel replay-results"
              aria-labelledby="universe-results"
            >
              <div className="replay-heading">
                <h2 id="universe-results">As-of listings</h2>
                <p role="status">
                  {members} {members === 1 ? 'member' : 'members'} ·{' '}
                  {result.listings.length - members} excluded
                </p>
              </div>
              <dl className="replay-times">
                <div>
                  <dt>View</dt>
                  <dd>
                    {result.checkpoint === null
                      ? 'Custom query'
                      : 'Replay cutoff ' + (result.checkpoint + 1)}
                  </dd>
                </div>
                <div>
                  <dt>Effective through</dt>
                  <dd>
                    <time dateTime={result.effective}>{result.effective}</time>
                  </dd>
                </div>
                <div>
                  <dt>Known through</dt>
                  <dd>
                    <time dateTime={result.known}>{result.known}</time>
                  </dd>
                </div>
              </dl>
              {result.listings.length === 0 ? (
                <p>No effective listings at these cutoffs.</p>
              ) : (
                <div className="replay-table-scroll">
                  <table
                    aria-label="As-of universe listings"
                    className="universe-table"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Listing</th>
                        <th scope="col">Instrument</th>
                        <th scope="col">Status</th>
                        <th scope="col">Effective</th>
                        <th scope="col">Observed</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.listings.map((row) => (
                        <tr key={row.listingId}>
                          <th scope="row">{row.listingId}</th>
                          <td>{row.instrument}</td>
                          <td>{statuses[row.status]}</td>
                          <td>{utc(row.effectiveAt)}</td>
                          <td>{utc(row.observedAt)}</td>
                          <td>{row.changeId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <UniverseScreen
              core={core}
              membership={dataset.csv}
              demo={dataset.demo}
              firstCutoff={utc(dataset.checkpoints[0])}
              effective={result.effective}
              known={result.known}
            />
            <DelistingReplay
              core={core}
              membership={dataset.csv}
              demo={dataset.demo}
              effective={result.effective}
              known={result.known}
            />
          </>
        )}
      </main>
    </>
  )
}
