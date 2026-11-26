import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Chart } from './Chart'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import { checkImportRows, type ImportPolicy } from './import-policy'
import type { MarketCore } from './market-core'
import { utc, type Asset } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-provider-withdrawals.csv?raw'

const DEMO = { csv: demo, name: 'Synthetic provider revisions' }
const DEFAULT_EFFECTIVE = '2025-06-02T14:02:00Z'
const DEFAULT_KNOWN = '2025-06-02T14:03:59Z'
const PAGE_SIZE = 100

export function ProviderRevisionResearch({ core, policy, close }: {
  core: MarketCore; policy: ImportPolicy; close: () => void
}) {
  const [source, setSource] = useState(DEMO)
  const [effective, setEffective] = useState(DEFAULT_EFFECTIVE)
  const [known, setKnown] = useState(DEFAULT_KNOWN)
  const [view, setView] = useState(() => ({
    ...core.providerHistoryAsOf(DEMO.csv, DEFAULT_EFFECTIVE, DEFAULT_KNOWN),
    effectiveAt: DEFAULT_EFFECTIVE,
    knownAt: DEFAULT_KNOWN,
  }))
  const [page, setPage] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  const chart = useMemo<Asset | null>(() => {
    if (view.bars.length === 0) return null
    const [venue, symbol] = view.instrument.split(':')
    return {
      id: view.instrument, venue, symbol, name: view.instrument, source: 'import',
      bars: view.bars.map(bar => ({
        time: bar.at,
        open: Number(bar.open) / 1e6,
        high: Number(bar.high) / 1e6,
        low: Number(bar.low) / 1e6,
        close: Number(bar.close) / 1e6,
        volume: Number(bar.volume) / 1e6,
      })),
    }
  }, [view])

  function apply(history: typeof source) {
    const effectiveAt = effective.trim()
    const knownAt = known.trim()
    const snapshot = core.providerHistoryAsOf(history.csv, effectiveAt, knownAt)
    setSource(history)
    setView({ ...snapshot, effectiveAt, knownAt })
    setPage(0)
    setProblem('')
  }

  function replay(event: FormEvent) {
    event.preventDefault()
    try {
      apply(source)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not replay provider revisions.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file || loading) return
    setLoading(true)
    try {
      if (file.size > policy.maxBytes)
        throw Error(`Choose a CSV of at most ${policy.maxBytes.toLocaleString('en-US')} bytes.`)
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      checkImportRows(csv, policy)
      apply({ csv, name: file.name })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load provider revisions.')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(view.bars.length / PAGE_SIZE)
  const bars = view.bars.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return <>
    <header className="app-header">
      <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
      <button className="outline" onClick={close}>Return to workspace</button>
    </header>
    <main className="replay-page">
      <div className="page-head"><h1 ref={title} tabIndex={-1}>Provider revisions</h1></div>
      <section className="side-card replay-panel" aria-label="Provider revision controls">
        <form className="universe-query" onSubmit={load}>
          <label>Provider revisions CSV
            <input type="file" accept=".csv,text/csv" disabled={loading}
              onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="outline" disabled={!file || loading}>Load revisions</button>
        </form>
        <form className="universe-query" onSubmit={replay}>
          <label>Bars effective through (UTC)
            <input required disabled={loading} value={effective} onChange={event => setEffective(event.target.value)} />
          </label>
          <label>Revisions known through (UTC)
            <input required disabled={loading} value={known} onChange={event => setKnown(event.target.value)} />
          </label>
          <button className="primary" disabled={loading}>Replay cutoffs</button>
        </form>
        {problem && <p role="alert" className="warning">{problem}</p>}
      </section>
      <section className="side-card replay-panel" aria-label="Observed provider history">
        <h2>{view.instrument}</h2>
        <p role="status">{view.provider} · {source.name} · {view.bars.length} observed {view.bars.length === 1 ? 'bar' : 'bars'}</p>
        <p>Effective through {view.effectiveAt} · Known through {view.knownAt}</p>
        {chart && <section aria-label="Provider replay chart">
          <Chart key={[view.instrument, view.effectiveAt, view.knownAt, view.bars.length].join('/')}
            asset={chart} sma={[]} ema={[]} observedAt={view.bars.map(bar => bar.observedAt)} />
        </section>}
        {bars.length === 0 ? <p>No bars meet these cutoffs.</p> : (
          <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable provider history">
            <table className="universe-table" aria-label="Provider history bars">
              <thead><tr>{['Bar UTC', 'Observed UTC', 'Open', 'High', 'Low', 'Close', 'Volume'].map(label =>
                <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{bars.map(bar => <tr key={bar.at}>
                <th scope="row">{utc(bar.at)}</th><td>{utc(bar.observedAt)}</td>
                {[bar.open, bar.high, bar.low, bar.close, bar.volume].map((value, index) =>
                  <td key={index}>{fixed(value, 6)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && <div className="replay-controls">
          <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous bars</button>
          <p>{page + 1} / {totalPages}</p>
          <button className="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Next bars</button>
        </div>}
      </section>
    </main>
  </>
}
