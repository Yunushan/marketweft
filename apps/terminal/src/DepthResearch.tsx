import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import type { DepthLevel, DepthStamp, DepthStatus, DepthSweep, MarketCore, RecordedDepth } from './market-core'
import { utc } from './workspace'
import type { Asset } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-depth.csv?raw'

type Source = { csv: string; name: string; checkpoints: number[] }
type Snapshot = { source: Source; cutoff: string; depth: RecordedDepth }
type SweepRequest = { side: 'buy' | 'sell'; size: string; limit: string }
const VISIBLE_LEVELS = 50

function statusText(status: DepthStatus) {
  switch (status.kind) {
    case 'no-observation': return 'No frames observed by this cutoff.'
    case 'awaiting-snapshot': return 'Waiting for the first complete snapshot.'
    case 'synchronized': return 'Synchronized'
    case 'sequence-gap':
      return 'Sequence gap. Expected ' + status.expected + ', received ' + status.received + '. Waiting for a new snapshot.'
    case 'crossed':
      return 'Crossed order book at sequence ' + status.sequence + '. Waiting for a new snapshot.'
  }
}

function stampFields(stamp: DepthStamp | null) {
  return stamp ? [stamp.sequence, utc(stamp.eventAt), utc(stamp.observedAt)] : ['', '', '']
}

function DepthSweepResearch({ core, instrument, view }: { core: MarketCore; instrument: string; view: Snapshot }) {
  const [draft, setDraft] = useState<SweepRequest>({ side: 'buy', size: '5', limit: '' })
  const [run, setRun] = useState<{ request: SweepRequest; view: Snapshot; result: DepthSweep } | null>(null)
  const [problem, setProblem] = useState('')
  const [page, setPage] = useState(0)
  const result = useMemo(() => {
    if (!run) return null
    if (run.view === view) return run.result
    const { side, size, limit } = run.request
    return core.recordedDepthSweep(instrument, view.source.csv, view.cutoff, side, size, limit)
  }, [core, instrument, run, view])
  const execution = result?.execution
  const lastPage = Math.max(0, Math.ceil((execution?.fills.length ?? 0) / VISIBLE_LEVELS) - 1)
  const current = Math.min(page, lastPage)

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const request = { side: draft.side, size: draft.size.trim(), limit: draft.limit.trim() }
      const result = core.recordedDepthSweep(instrument, view.source.csv, view.cutoff, request.side, request.size, request.limit)
      setRun({ request, result, view })
      setPage(0)
      setProblem('')
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not simulate the depth sweep.')
    }
  }

  function download(request: SweepRequest, sweep: DepthSweep) {
    const { execution, status } = sweep
    const expected = status.kind === 'sequence-gap' ? status.expected : ''
    const failed = status.kind === 'sequence-gap' ? status.received : status.kind === 'crossed' ? status.sequence : ''
    const header = 'instrument,source,known_utc,status,last_sequence,event_utc,observed_utc,snapshot_sequence,snapshot_event_utc,snapshot_observed_utc,expected_sequence,failed_sequence,side,requested,limit_price,filled,unfilled,notional,average_price,level_price,level_quantity'
    const prefix = [quoteText(instrument), quoteText(view.source.name), view.cutoff, status.kind,
      ...stampFields(sweep.received), ...stampFields(sweep.snapshot), expected, failed, request.side, request.size, request.limit,
      execution ? fixed(execution.filledTicks, 6) : '', execution ? fixed(execution.remainingTicks, 6) : '',
      execution ? fixed(execution.notionalUnits, 12) : '',
      execution?.meanPriceTicks == null ? '' : fixed(execution.meanPriceTicks, 6)]
    const levels = execution?.fills.map(fill => [fixed(fill.priceTicks, 6), fixed(fill.sizeTicks, 6)]) ?? []
    const rows = levels.length ? levels : [['', '']]
    const csv = [header, ...rows.map(row => [...prefix, ...row].join(','))].join('\r\n') + '\r\n'
    downloadFile('recorded-depth-sweep.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <details>
    <summary>Simulate a depth sweep</summary>
    <form className="universe-query" onSubmit={submit}>
      <label>Order side
        <select value={draft.side} onChange={event => setDraft({ ...draft, side: event.target.value === 'sell' ? 'sell' : 'buy' })}>
          <option value="buy">Buy</option><option value="sell">Sell</option>
        </select>
      </label>
      <label>Sweep quantity
        <input value={draft.size} required inputMode="decimal" onChange={event => setDraft({ ...draft, size: event.target.value })} />
      </label>
      <label>Limit price (optional)
        <input value={draft.limit} inputMode="decimal" onChange={event => setDraft({ ...draft, limit: event.target.value })} />
      </label>
      <button type="submit" className="outline">Calculate sweep</button>
    </form>
    {problem && <p role="alert" className="warning">{problem}</p>}
    {result && run && <section aria-label="Depth sweep result">
      {execution ? <>
        <dl className="replay-times">
          <div><dt>Filled</dt><dd>{fixed(execution.filledTicks, 6)}</dd></div>
          <div><dt>Unfilled</dt><dd>{fixed(execution.remainingTicks, 6)}</dd></div>
          <div><dt>Notional</dt><dd>{fixed(execution.notionalUnits, 12)}</dd></div>
          <div><dt>Average price</dt><dd>{execution.meanPriceTicks === null ? '—' : fixed(execution.meanPriceTicks, 6)}</dd></div>
        </dl>
        {execution.fills.length > 0 && <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable sweep fills">
          <table className="universe-table" aria-label="Sweep fills">
            <thead><tr><th scope="col">Price</th><th scope="col">Quantity</th></tr></thead>
            <tbody>{execution.fills.slice(current * VISIBLE_LEVELS, (current + 1) * VISIBLE_LEVELS).map(fill =>
              <tr key={fill.priceTicks.toString()}><th scope="row">{fixed(fill.priceTicks, 6)}</th>
                <td>{fixed(fill.sizeTicks, 6)}</td></tr>)}</tbody>
          </table>
        </div>}
        {lastPage > 0 && <div className="universe-query">
          <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous sweep fills</button>
          <p>{current + 1} / {lastPage + 1}</p>
          <button type="button" className="outline" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next sweep fills</button>
        </div>}
      </> : <p>Simulation unavailable while the order book is unsynchronized.</p>}
      <button type="button" className="outline" onClick={() => download(run.request, result)}>Download depth sweep</button>
    </section>}
  </details>
}

function depthCsv(instrument: string, { source, cutoff, depth }: Snapshot) {
  const header = 'instrument,source,known_utc,status,last_sequence,event_utc,observed_utc,snapshot_sequence,snapshot_event_utc,snapshot_observed_utc,expected_sequence,failed_sequence,side,price,size'
  const status = depth.status
  const expected = status.kind === 'sequence-gap' ? status.expected : ''
  const failed = status.kind === 'sequence-gap' ? status.received : status.kind === 'crossed' ? status.sequence : ''
  const prefix = [quoteText(instrument), quoteText(source.name), cutoff, status.kind,
    ...stampFields(depth.received), ...stampFields(depth.snapshot), expected, failed]
  const levels = [
    ...depth.bids.map(level => ['bid', fixed(level.priceTicks, 6), fixed(level.sizeTicks, 6)]),
    ...depth.asks.map(level => ['ask', fixed(level.priceTicks, 6), fixed(level.sizeTicks, 6)]),
  ]
  const records = levels.length === 0 ? [['', '', '']] : levels
  return [header, ...records.map(level => [...prefix, ...level].join(','))].join('\r\n') + '\r\n'
}

function DepthLadder({ name, levels, maximum }: { name: 'Bids' | 'Asks'; levels: DepthLevel[]; maximum: bigint }) {
  return (
    <div className="depth-ladder">
      <h3>{name}</h3>
      {levels.length === 0 ? <p>No {name.toLowerCase()}.</p> : (
        <div className="replay-table-scroll" tabIndex={0} role="region" aria-label={'Scrollable ' + name.toLowerCase()}>
          <table aria-label={name + ' by price'} className="universe-table">
            <thead><tr><th scope="col">Price</th><th scope="col">Size</th></tr></thead>
            <tbody>
              {levels.map(level => (
                <tr key={level.priceTicks.toString()}>
                  <th scope="row">{fixed(level.priceTicks, 6)}</th>
                  <td className={'depth-size ' + name.toLowerCase()}>
                    <span aria-hidden="true" style={{ width: (Number(level.sizeTicks) * 100 / Number(maximum)) + '%' }} />
                    <b>{fixed(level.sizeTicks, 6)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DepthResearch({ core, asset, close }: { core: MarketCore; asset: Asset; close: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<Snapshot | null>(null)
  const [problem, setProblem] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])

  function apply(source: Source, cutoff: string) {
    try {
      const depth = core.recordedDepth(asset.id, source.csv, cutoff)
      setView({ source, cutoff, depth })
      setDraft(cutoff)
      setProblem('')
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not replay recorded depth.')
    }
  }

  function start(csv: string, name: string) {
    const checkpoints = core.depthCheckpoints(asset.id, csv)
    apply({ csv, name, checkpoints }, utc(checkpoints[0]))
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setProblem('')
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Depth CSV exceeds 8 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      start(csv, file.name)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not read depth reports.')
    } finally {
      setBusy(false)
    }
  }

  function loadDemo() {
    try {
      start(demo, 'Synthetic depth snapshots and updates')
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not open the recorded depth demo.')
    }
  }

  const { depth, cutoff, source } = view ?? {}
  const time = cutoff ? Date.parse(cutoff) / 1000 : 0
  const before = source?.checkpoints.findIndex(at => at >= time) ?? -1
  const previous = before < 0 ? (source?.checkpoints.length ?? 0) - 1 : before - 1
  const next = before < 0 ? (source?.checkpoints.length ?? 0) : before + Number(source?.checkpoints[before] === time)
  const bids = depth?.bids.slice(0, VISIBLE_LEVELS) ?? []
  const asks = depth?.asks.slice(0, VISIBLE_LEVELS) ?? []
  const maxSize = [...bids, ...asks].reduce((max, level) => max > level.sizeTicks ? max : level.sizeTicks, 1n)
  const spread = bids[0] && asks[0] ? asks[0].priceTicks - bids[0].priceTicks : null

  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to workspace</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={title} tabIndex={-1}>Recorded market depth</h1></div>
        <section className="side-card replay-panel" aria-labelledby="depth-instrument">
          <div className="replay-heading">
            <h2 id="depth-instrument">{asset.id}</h2>
            {asset.id === 'NASDAQ:NVDA' && <button className="outline" onClick={loadDemo}
              disabled={busy}>Load depth demo</button>}
          </div>
          <form className="universe-query" onSubmit={load}>
            <label>Depth CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                onChange={event => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="primary" type="submit" disabled={!file || busy}>Load depth reports</button>
          </form>
          <details>
            <summary>Depth CSV format</summary>
            <p>Use one instrument and exact UTC timestamps. Use snapshot for a complete book and update for changes to specific levels. An update size of zero removes that level.</p>
            <pre>instrument,event_at,observed_at,sequence,kind,side,price,size</pre>
          </details>
          {source && (
            <>
              <div className="replay-controls">
                <button className="outline" type="button" disabled={previous < 0}
                  onClick={() => apply(source, utc(source.checkpoints[previous]))}>Previous observation</button>
                <button className="outline" type="button" disabled={next >= source.checkpoints.length}
                  onClick={() => apply(source, utc(source.checkpoints[next]))}>Next observation</button>
              </div>
              <form className="universe-query" onSubmit={event => { event.preventDefault(); apply(source, draft.trim()) }}>
                <label>Depth known time (UTC)
                  <input required value={draft} spellCheck={false} autoComplete="off"
                    onChange={event => setDraft(event.target.value)} />
                </label>
                <button className="outline" type="submit">Query depth</button>
              </form>
            </>
          )}
          {problem && <p role="alert" className="warning">{problem}</p>}
        </section>
        {view && depth && (
          <section className="side-card replay-panel replay-results" aria-labelledby="depth-results">
            <div className="replay-heading">
              <h2 id="depth-results">Order book at cutoff</h2>
              <p role="status">{statusText(depth.status)}</p>
            </div>
            <dl className="replay-times">
              <div><dt>Source</dt><dd>{view.source.name}</dd></div>
              <div><dt>Known through</dt><dd>{view.cutoff}</dd></div>
              {depth.received && <div><dt>Last received</dt><dd>{depth.received.sequence.toString()} · {utc(depth.received.observedAt)}</dd></div>}
              {depth.snapshot && <div><dt>Snapshot sequence</dt><dd>{depth.snapshot.sequence.toString()}</dd></div>}
              {spread !== null && <div><dt>Spread</dt><dd>{fixed(spread, 6)}</dd></div>}
            </dl>
            {depth.status.kind === 'synchronized' && (
              <>
                <div className="depth-ladders">
                  <DepthLadder name="Bids" levels={bids} maximum={maxSize} />
                  <DepthLadder name="Asks" levels={asks} maximum={maxSize} />
                </div>
                {Math.max(depth.bids.length, depth.asks.length) > VISIBLE_LEVELS &&
                  <p>The ladder shows the best {VISIBLE_LEVELS} levels per side. The CSV includes every level.</p>}
              </>
            )}
            <button type="button" className="outline" onClick={() => {
              downloadFile('recorded-depth.csv', new Blob([depthCsv(asset.id, view)], { type: 'text/csv;charset=utf-8' }))
            }}>Download depth snapshot</button>
            <DepthSweepResearch core={core} instrument={asset.id} view={view} />
          </section>
        )}
      </main>
    </>
  )
}
