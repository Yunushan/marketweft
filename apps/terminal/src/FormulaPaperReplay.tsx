import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BacktestConfig, FormulaBacktestQuery, FormulaBacktestResult, MarketCore } from './market-core'
import { BacktestReceiptTable, backtestEvidenceRows } from './RecordedTradeReplay'
import type { BacktestBook } from './RecordedTradeReplay'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import sampleTrades from '../../../crates/core/tests/fixtures/synthetic-backtest-trades.csv?raw'

type TradeSource = { name: string; csv: string }
type Replay = { source: string; query: FormulaBacktestQuery; report: FormulaBacktestResult }
const money = (value: bigint | null) => value === null ? '' : fixed(value, 6)

function exportReplay(book: BacktestBook, replay: Replay) {
  const { report, query, source } = replay
  const { paper, targetShares, participation, slippage, limitBuffer, maxWait } = query.config
  const fields = [book.title, source, book.instrument, query.effective, query.known, report.version,
    query.entry, query.exit, book.interval, targetShares, participation, slippage, limitBuffer, maxWait,
    paper.startingCash, paper.positionLimit, paper.exposureLimit, paper.feePerShare, paper.feePerOrder]
    .map(value => quoteText(String(value)))
  const header = 'history_source,execution_source,instrument,effective_through_utc,known_through_utc,language_version,entry_formula,exit_formula,interval_seconds,target_shares,participation_bps,slippage_bps,limit_buffer_bps,max_wait_bars,starting_cash,position_limit,committed_cost_limit,fee_per_share,fee_per_order,row,observed_utc,event_id,order_id,source_id,execution_utc,action,status,shares,price,fee,cash_change,cash,reserved,equity,drawdown,bar_index,entry_value,exit_value,decision'
  const evaluations = report.evaluations.map(row => ['evaluation', utc(row.at), ...Array<string>(14).fill(''),
    row.barIndex, money(row.entry), money(row.exit), row.decision ?? ''])
  const rows = [...backtestEvidenceRows(report.backtest).map(row => [...row, '', '', '', '']), ...evaluations]
  const csv = [header, ...rows.map(row => [...fields, ...row].join(','))].join('\r\n') + '\r\n'
  downloadFile('formula-paper-backtest.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

export function FormulaPaperReplay({ book, config, core }: { book: BacktestBook; config: BacktestConfig; core: MarketCore }) {
  const lastBar = utc(book.times[book.times.length - 1])
  const [entry, setEntry] = useState('close >= 13')
  const [exit, setExit] = useState('close <= 10')
  const [effective, setEffective] = useState(lastBar)
  const [known, setKnown] = useState(lastBar)
  const [recorded, setRecorded] = useState(false)
  const [source, setSource] = useState<TradeSource | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [replay, setReplay] = useState<Replay | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const result = replay?.report
  const backtest = result?.backtest
  const last = backtest?.marks.at(-1)
  const fills = backtest?.ledger.receipts.filter(row => row.kind === 'fill' && row.status === 'accepted').length

  async function run(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      let next = source
      if (recorded && file) {
        if (file.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
        const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
        if (!csv.trim()) throw new Error('Supply recorded trades for trade execution.')
        next = { name: file.name, csv }
      }
      const tape = recorded ? next : null
      if (recorded && !tape) throw new Error('Supply recorded trades for trade execution.')
      const query = { effective: effective.trim(), known: known.trim(), config, entry: entry.trim(), exit: exit.trim() }
      const report = core.formulaBacktest(book.instrument, book.calendar, book.bars,
        tape?.csv ?? '', book.interval, query)
      setReplay({ source: tape?.name ?? 'Bar volume', query, report })
      if (recorded) {
        setSource(next)
        setFile(null)
      }
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run the formula paper backtest.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="side-card replay-panel research-details">
    <summary>Formula paper backtest</summary>
    <section aria-label="Formula paper backtest">
      <p>Evaluate entry and exit at each observed close using the active paper account and execution settings.</p>
      <form className="formula-form" onSubmit={run}>
        <label>Entry formula<textarea rows={2} maxLength={2048} value={entry} required spellCheck={false}
          onChange={event => setEntry(event.target.value)} /></label>
        <label>Exit formula<textarea rows={2} maxLength={2048} value={exit} required spellCheck={false}
          onChange={event => setExit(event.target.value)} /></label>
        <div className="universe-query">
          <label>Formula effective cutoff (UTC)
            <input required value={effective} onChange={event => setEffective(event.target.value)} />
          </label>
          <label>Formula known cutoff (UTC)
            <input required value={known} onChange={event => setKnown(event.target.value)} />
          </label>
          <label>Formula execution source
            <select value={recorded ? 'trades' : 'bars'} onChange={event => setRecorded(event.target.value === 'trades')}>
              <option value="bars">Bar volume</option><option value="trades">Recorded trades</option>
            </select>
          </label>
          {recorded && <label>Formula execution trades CSV
            <input type="file" accept=".csv,text/csv" disabled={busy}
              onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </label>}
          {recorded && book.demo && <button type="button" className="outline" disabled={busy} onClick={() => {
            setSource({ name: 'Synthetic execution trades', csv: sampleTrades })
            setFile(null)
          }}>Use formula sample trades</button>}
          <button type="submit" className="outline" disabled={busy || recorded && !file && !source}>Run formula backtest</button>
        </div>
      </form>
      {error && <p role="alert" className="warning">{error}</p>}
      {replay && result && backtest && <>
        <p role="status">{result.evaluations.length} observed bars · {fills} accepted fills · Language v{result.version}</p>
        <dl className="replay-times">
          <div><dt>Formula cash</dt><dd>{money(backtest.ledger.cash)}</dd></div>
          <div><dt>Formula equity</dt><dd>{money(last?.equity ?? backtest.ledger.cash)}</dd></div>
          <div><dt>Held shares</dt><dd>{last?.shares.toString() ?? '0'}</dd></div>
          <div><dt>Maximum drawdown</dt><dd>{money(backtest.drawdown)}</dd></div>
        </dl>
        {result.evaluations.length > 0 && <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Formula signal evaluations">
            <thead><tr><th scope="col">Observed UTC</th><th scope="col">Entry</th>
              <th scope="col">Exit</th><th scope="col">Decision</th></tr></thead>
            <tbody>{result.evaluations.slice(-100).map(row => <tr key={row.at}>
              <th scope="row">{utc(row.at)}</th><td>{money(row.entry) || 'Unavailable'}</td>
              <td>{money(row.exit) || 'Unavailable'}</td><td>{row.decision ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <BacktestReceiptTable report={backtest} label="Formula backtest receipts" />
        <button type="button" className="outline" onClick={() => exportReplay(book, replay)}>Download formula backtest</button>
      </>}
    </section>
  </details>
}
