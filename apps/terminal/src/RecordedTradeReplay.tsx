import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BacktestConfig, BacktestResult, MarketCore, RecordedBacktestQuery } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import sampleTrades from '../../../crates/core/tests/fixtures/synthetic-backtest-trades.csv?raw'

type Book = {
  title: string; instrument: string; bars: string; calendar: string; interval: number; times: number[]; demo: boolean
}
type Source = { name: string; csv: string }
type Replay = { source: Source; query: RecordedBacktestQuery; report: BacktestResult }

const money = (value: bigint | null) => value === null ? '' : fixed(value, 6)
const timestamp = (value: number | null) => value === null ? '' : utc(value)

function exportReplay(book: Book, replay: Replay) {
  const { query: { effective, known, config }, report } = replay
  const { paper } = config
  const source = [book.title, replay.source.name, book.instrument, effective, known,
    book.interval, config.fastWindow, config.slowWindow, config.targetShares, config.participation,
    config.slippage, config.limitBuffer, config.maxWait, paper.startingCash, paper.positionLimit,
    paper.exposureLimit, paper.feePerShare, paper.feePerOrder].map(value => quoteText(String(value)))
  const header = 'history_source,trade_source,instrument,effective_through_utc,known_through_utc,interval_seconds,fast_sma,slow_sma,target_shares,participation_bps,slippage_bps,limit_buffer_bps,max_wait_bars,starting_cash,position_limit,committed_cost_limit,fee_per_share,fee_per_order,row,observed_utc,event_id,order_id,source_id,execution_utc,action,status,shares,price,fee,cash_change,cash,reserved,equity,drawdown'
  const mark = report.marks.at(-1)
  const rows = [
    ['summary', timestamp(mark?.at ?? null), ...Array<string>(9).fill(''), '',
      money(report.ledger.cash), money(report.ledger.reserved), money(mark?.equity ?? report.ledger.cash),
      money(report.drawdown)],
    ...report.ledger.receipts.map(row => ['receipt', utc(row.observedAt), row.id, row.orderId ?? '',
      row.sourceId ?? '', timestamp(row.priceAt), row.kind, row.status, row.shares ?? '',
      money(row.price), money(row.fee), money(row.cashDelta), '', '', '', '']),
    ...report.marks.map(row => ['mark', utc(row.at), '', '', '', '', '', '', row.shares,
      money(row.close), '', '', money(row.cash), '', money(row.equity), '']),
  ]
  const csv = [header, ...rows.map(row => [...source, ...row].join(','))].join('\r\n') + '\r\n'
  downloadFile('recorded-trade-backtest.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

export function RecordedTradeReplay({ core, book, config }: { core: MarketCore; book: Book; config: BacktestConfig }) {
  const lastBar = utc(book.times[book.times.length - 1])
  const [effective, setEffective] = useState(lastBar)
  const [known, setKnown] = useState(lastBar)
  const [source, setSource] = useState<Source | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Replay | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const report = result?.report
  const mark = report?.marks.at(-1)
  const fills = report?.ledger.receipts.filter(row => row.kind === 'fill' && row.status === 'accepted').length ?? 0

  async function run(event: FormEvent) {
    event.preventDefault()
    if (!file && !source) return
    setBusy(true)
    try {
      let next = source
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
        next = { name: file.name, csv: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
      }
      if (!next) return
      const query = { effective: effective.trim(), known: known.trim(), config }
      const report = core.recordedBacktest(book.instrument, book.calendar, book.bars, next.csv, book.interval, query)
      setResult({ source: next, query, report })
      setSource(next)
      setFile(null)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not replay recorded trades.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="side-card replay-panel research-details">
    <summary>Recorded trade execution</summary>
    <section aria-label="Recorded trade execution">
      <p>Use the active strategy and paper account settings with fills from recorded trade prints.</p>
      <form className="universe-query" onSubmit={run}>
        <label>Recorded execution trades CSV
          <input type="file" accept=".csv,text/csv" disabled={busy}
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {book.demo && <button type="button" className="outline" disabled={busy} onClick={() => {
          setSource({ name: 'Synthetic execution trades', csv: sampleTrades })
          setFile(null)
        }}>Use sample execution trades</button>}
        <label>Trade effective cutoff (UTC)
          <input required value={effective} onChange={event => setEffective(event.target.value)} />
        </label>
        <label>Trade known cutoff (UTC)
          <input required value={known} onChange={event => setKnown(event.target.value)} />
        </label>
        <button type="submit" className="outline" disabled={busy || !file && !source}>Run recorded trade backtest</button>
      </form>
      {error && <p role="alert" className="warning">{error}</p>}
      {result && report && <>
        <p role="status">{fills} accepted fills · {report.marks.length} marks · {result.source.name}</p>
        <dl className="replay-times">
          <div><dt>Trade replay cash</dt><dd>{money(report.ledger.cash)}</dd></div>
          <div><dt>Trade replay equity</dt><dd>{money(mark?.equity ?? report.ledger.cash)}</dd></div>
          <div><dt>Held shares</dt><dd>{mark?.shares.toString() ?? '0'}</dd></div>
          <div><dt>Maximum drawdown</dt><dd>{money(report.drawdown)}</dd></div>
        </dl>
        {report.ledger.receipts.length > 0 && <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Recorded trade receipts">
            <thead><tr><th scope="col">Event</th><th scope="col">Observed UTC</th><th scope="col">Source</th>
              <th scope="col">Execution UTC</th><th scope="col">Action</th><th scope="col">Outcome</th>
              <th scope="col">Shares</th><th scope="col">Price or limit</th><th scope="col">Cash change</th></tr></thead>
            <tbody>{report.ledger.receipts.slice(-100).map(row => <tr key={row.id}>
              <th scope="row">{row.id}</th><td>{utc(row.observedAt)}</td><td>{row.sourceId ?? '—'}</td>
              <td>{timestamp(row.priceAt) || '—'}</td><td>{row.kind}</td><td>{row.status}</td>
              <td>{row.shares?.toString() ?? '—'}</td><td>{money(row.price) || '—'}</td><td>{money(row.cashDelta)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <button type="button" className="outline" onClick={() => exportReplay(book, result)}>Download recorded trade backtest</button>
      </>}
    </section>
  </details>
}
