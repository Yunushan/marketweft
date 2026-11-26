import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PaperConfig, PaperSnapshot } from './market-core'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-paper-events.csv?raw'

const defaults: PaperConfig = {
  startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2',
}
const configFields: [keyof PaperConfig, string][] = [
  ['startingCash', 'Starting cash'],
  ['positionLimit', 'Position limit (shares)'],
  ['exposureLimit', 'Committed cost limit'],
  ['feePerShare', 'Fee per share'],
  ['feePerOrder', 'Fee per order'],
]
const receipts: Record<string, string> = {
  accepted: 'Accepted',
  'invalid-order': 'Invalid order',
  'existing-order': 'Existing order ID',
  'unknown-order': 'Unknown order',
  'closed-order': 'Order is closed',
  halted: 'Account halted',
  'cash-limit': 'Insufficient available cash',
  'position-limit': 'Position limit',
  'exposure-limit': 'Committed cost limit',
  'insufficient-shares': 'Insufficient free shares',
  'invalid-fill': 'Invalid fill',
  'price-time': 'Price time ineligible',
  'limit-price': 'Price violates limit',
  'repeated-fill-source': 'Source already filled this order',
}
const statuses: Record<string, string> = { open: 'Open', partial: 'Partially filled', filled: 'Filled', canceled: 'Canceled' }
const amount = (value: bigint) => fixed(value, 6)

type Source = { csv: string; name: string; times: number[] }
type Query = { at: string; config: PaperConfig }

export function PaperReplay({ core, close }: { core: MarketCore; close: () => void }) {
  const [source, setSource] = useState<Source | null>(null)
  const [draft, setDraft] = useState<Query>({ at: '', config: defaults })
  const [view, setView] = useState<{ query: Query; ledger: PaperSnapshot } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  function evaluate(input: Source, requested: Query) {
    const query = { ...requested, at: requested.at.trim() }
    const ledger = core.paperReplay(input.csv, query.at, query.config)
    setDraft(query)
    setView({ query, ledger })
    setError('')
  }

  function start(csv: string, name: string) {
    const times = core.paperIndex(csv)
    const book = { csv, name, times }
    evaluate(book, { at: utc(times[0]), config: defaults })
    setSource(book)
  }

  function startDemo() {
    try {
      start(demo, 'Synthetic paper orders and fills')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the paper demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Paper events CSV exceeds 2 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      start(csv, file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load paper events.')
    } finally {
      setBusy(false)
    }
  }

  function submit(query: Query) {
    if (!source) return
    try {
      evaluate(source, query)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not replay the paper ledger.')
    }
  }

  const cutoff = view ? Date.parse(view.query.at) / 1000 : null
  const times = source?.times ?? []
  const cursor = cutoff === null ? 0 : times.findIndex(time => time >= cutoff)
  const previous = cursor < 0 ? times.at(-1) : times[cursor - 1]
  const next = cursor < 0 ? undefined : times[cursor + Number(times[cursor] === cutoff)]
  const ledger = view?.ledger
  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Paper ledger</h1></div>
        {!source || !view || !ledger ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Paper ledger demo</h2>
              <p>Step through cash reserves, partial fills, a rejected early fill and a halt.</p>
              <button className="primary" disabled={busy} onClick={startDemo}>Start paper demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open simulated events</h2>
              <label>Paper events CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={event => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !file}>Load paper ledger</button>
            </form>
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div><h2>Simulation inputs</h2><p>{source.name}</p></div>
                <button className="outline" onClick={() => {
                  setSource(null)
                  setView(null)
                  setFile(null)
                  setError('')
                  heading.current?.focus()
                }}>Change event file</button>
              </div>
              <form className="universe-query" onSubmit={event => { event.preventDefault(); submit(draft) }}>
                <label>Observed through (UTC)
                  <input required value={draft.at} spellCheck={false} autoComplete="off"
                    onChange={event => setDraft({ ...draft, at: event.target.value })} />
                </label>
                {configFields.map(([key, label]) => (
                  <label key={key}>{label}
                    <input required inputMode={key === 'positionLimit' ? 'numeric' : 'decimal'} value={draft.config[key]}
                      onChange={event => setDraft({ ...draft, config: { ...draft.config, [key]: event.target.value } })} />
                  </label>
                ))}
                <button className="primary">Run paper replay</button>
              </form>
              <div className="replay-controls">
                <button className="outline" disabled={previous === undefined}
                  onClick={() => previous !== undefined && submit({ at: utc(previous), config: view.query.config })}>Previous event time</button>
                <button className="outline" disabled={next === undefined}
                  onClick={() => next !== undefined && submit({ at: utc(next), config: view.query.config })}>Next event time</button>
                <button className="outline" disabled={next === undefined}
                  onClick={() => submit({ at: utc(source.times[source.times.length - 1]), config: view.query.config })}>Final account</button>
              </div>
            </section>
            <section className="side-card replay-panel replay-results" aria-labelledby="paper-account">
              <h2 id="paper-account">Simulated account</h2>
              <p role="status">Observed through {view.query.at} · {ledger.halted ? 'Halted' : 'Active'}</p>
              <dl className="replay-times">
                {([
                  ['Cash balance', ledger.cash], ['Reserved cash', ledger.reserved],
                  ['Available cash', ledger.available], ['Committed cost', ledger.committed], ['Realized profit and loss', ledger.realized],
                ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{amount(value)}</dd></div>)}
              </dl>
              <div className="replay-table-scroll">
                <table className="universe-table" aria-label="Paper orders">
                  <thead><tr><th scope="col">Order</th><th scope="col">Instrument</th><th scope="col">Side</th>
                    <th scope="col">Limit</th><th scope="col">Shares</th><th scope="col">Remaining</th><th scope="col">Status</th></tr></thead>
                  <tbody>{ledger.orders.map(order => (
                    <tr key={order.id}><th scope="row">{order.id}</th><td>{order.instrument}</td>
                      <td>{order.side}</td><td>{amount(order.limit)}</td><td>{order.shares.toString()}</td>
                      <td>{order.remaining.toString()}</td><td>{statuses[order.status]}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="replay-table-scroll">
                <table className="universe-table" aria-label="Paper positions">
                  <thead><tr><th scope="col">Instrument</th><th scope="col">Shares</th><th scope="col">Cost including entry fees</th></tr></thead>
                  <tbody>{ledger.positions.map(position => (
                    <tr key={position.instrument}><th scope="row">{position.instrument}</th>
                      <td>{position.shares.toString()}</td><td>{amount(position.cost)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p>{ledger.receipts.length} unique receipts{ledger.receipts.length > 100 && ' · Showing the latest 100'}</p>
              <div className="replay-table-scroll">
                <table className="universe-table" aria-label="Paper receipts">
                  <thead><tr><th scope="col">Event</th><th scope="col">Observed UTC</th><th scope="col">Action</th><th scope="col">Order</th>
                    <th scope="col">Result</th><th scope="col">Cash change</th><th scope="col">Fee</th><th scope="col">Fill source</th>
                    <th scope="col">Price time UTC</th><th scope="col">Shares</th><th scope="col">Price</th></tr></thead>
                  <tbody>{ledger.receipts.slice(-100).map(receipt => (
                    <tr key={receipt.id}><th scope="row">{receipt.id}</th><td>{utc(receipt.observedAt)}</td><td>{receipt.kind}</td>
                      <td>{receipt.orderId ?? '—'}</td><td>{receipts[receipt.status]}</td>
                      <td>{amount(receipt.cashDelta)}</td><td>{amount(receipt.fee)}</td>
                      <td>{receipt.sourceId ?? '—'}</td><td>{receipt.priceAt === null ? '—' : utc(receipt.priceAt)}</td>
                      <td>{receipt.shares?.toString() ?? '—'}</td><td>{receipt.price === null ? '—' : amount(receipt.price)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {error && <p className="warning replay-error" role="alert">{error}</p>}
      </main>
    </>
  )
}
