import { useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import type { DepthStamp, MarketCore, TradeClassification, TradeClassificationQuery, TradeSideBasis } from './market-core'
import { utc } from './workspace'
import sampleTrades from '../../../crates/core/tests/fixtures/synthetic-trade-classification.csv?raw'
import sampleDepth from '../../../crates/core/tests/fixtures/synthetic-depth.csv?raw'

type Source = { name: string; csv: string }
type Draft = Omit<TradeClassificationQuery, 'maxQuoteAgeSeconds'> & { maxQuoteAgeSeconds: string }
type Report = { trades: Source; depth: Source; query: TradeClassificationQuery; rows: TradeClassification[] }

const pageSize = 60
const cutoffs = [['from', 'Classification window start (UTC)'], ['through', 'Classification window end (UTC)'],
  ['known', 'Classification known through (UTC)']] as const
const basisLabel: Record<TradeSideBasis, string> = {
  reported: 'Source reported',
  'quote-midpoint': 'Inferred from midpoint',
  'at-midpoint': 'At midpoint',
  'no-depth': 'No earlier depth',
  'unsynchronized-depth': 'Unsynchronized depth',
  'incomplete-quote': 'Missing bid or ask',
  'stale-quote': 'Stale best quote',
  'locked-quote': 'Locked quote',
}

async function readSource(file: File | null, previous: Source | undefined) {
  if (!file) return previous
  if (file.size > 8 * 1024 * 1024) throw new Error('Trade and depth CSVs may each use up to 8 MiB.')
  return { name: file.name, csv: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
}

function stampFields(stamp: DepthStamp | undefined) {
  return stamp ? [stamp.sequence, utc(stamp.eventAt), utc(stamp.observedAt)] : ['', '', '']
}

function auditCsv(instrument: string, { trades, depth, query, rows }: Report) {
  const header = 'instrument,trade_source,depth_source,execution_from_utc,execution_through_utc,known_through_utc,max_quote_age_seconds,trade_sequence,executed_utc,observed_utc,price,size,side,basis,book_state,expected_sequence,failed_sequence,book_sequence,book_event_utc,book_observed_utc,bid_price,bid_sequence,bid_event_utc,bid_observed_utc,ask_price,ask_sequence,ask_event_utc,ask_observed_utc'
  const prefix = [quoteText(instrument), quoteText(trades.name), quoteText(depth.name),
    query.from, query.through, query.known, query.maxQuoteAgeSeconds]
  const data = rows.map(row => {
    const quote = row.quote
    const status = quote?.status
    const expected = status?.kind === 'sequence-gap' ? status.expected : ''
    const failed = status?.kind === 'sequence-gap' ? status.received : status?.kind === 'crossed' ? status.sequence : ''
    const levelFields = (level: NonNullable<TradeClassification['quote']>['bid'] | undefined) =>
      [level ? fixed(level.priceTicks, 6) : '', ...stampFields(level ?? undefined)]
    return [...prefix, row.sequence, utc(row.executedAt), utc(row.observedAt), fixed(row.priceTicks, 6),
      fixed(row.sizeTicks, 6), row.side, row.basis, status?.kind ?? '', expected, failed, ...stampFields(quote?.stamp),
      ...levelFields(quote?.bid), ...levelFields(quote?.ask)].join(',')
  })
  return [header, ...data].join('\r\n') + '\r\n'
}

export function TradeClassificationResearch({ core, instrument, plot }: {
  core: MarketCore
  instrument: string
  plot: (csv: string, source: string, query: TradeClassificationQuery) => void
}) {
  const [tradeFile, setTradeFile] = useState<File | null>(null)
  const [depthFile, setDepthFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<Draft>({ from: '', through: '', known: '', maxQuoteAgeSeconds: '10' })
  const [report, setReport] = useState<Report | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  const rows = report?.rows ?? []
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const current = Math.min(page, lastPage)

  function calculate(trades: Source, depth: Source, settings: Draft) {
    const age = settings.maxQuoteAgeSeconds.trim()
    if (!/^\d+$/.test(age)) throw new Error('Use a positive whole-second maximum quote age.')
    const query = { from: settings.from.trim(), through: settings.through.trim(), known: settings.known.trim(),
      maxQuoteAgeSeconds: Number(age) }
    const rows = core.classifyRecordedTrades(instrument, trades.csv, depth.csv, query)
    setReport({ trades, depth, query, rows })
    setDraft({ ...query, maxQuoteAgeSeconds: String(query.maxQuoteAgeSeconds) })
    setTradeFile(null)
    setDepthFile(null)
    setProblem('')
    setPage(0)
  }

  function demo() {
    try {
      calculate({ name: 'Synthetic classification trades', csv: sampleTrades },
        { name: 'Synthetic depth snapshots and updates', csv: sampleDepth },
        { from: '2025-06-02T14:00:00Z', through: '2025-06-02T14:00:13Z',
          known: '2025-06-02T14:00:13Z', maxQuoteAgeSeconds: '10' })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not load the trade classification sample.')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const [trades, depth] = await Promise.all([readSource(tradeFile, report?.trades), readSource(depthFile, report?.depth)])
      if (trades && depth) calculate(trades, depth, draft)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not classify the recorded trades.')
    } finally {
      setBusy(false)
    }
  }

  function plotRows() {
    if (!report || !rows.length) return
    const header = 'instrument,executed_at,observed_at,sequence,price,size,aggressor'
    const records = rows.map(row => [instrument, row.executedAt, row.observedAt, row.sequence,
      fixed(row.priceTicks, 6), fixed(row.sizeTicks, 6), row.side].join(','))
    plot([header, ...records].join('\n') + '\n',
      `Classified trades · ${report.trades.name} · ${report.depth.name}`, report.query)
  }

  return <details>
    <summary>Classify trade sides from recorded quotes</summary>
    <section aria-label="Recorded trade classification">
      {instrument === 'NASDAQ:NVDA' && <button className="outline" type="button" disabled={busy} onClick={demo}>
        Load classification demo
      </button>}
      <form className="universe-query" onSubmit={submit}>
        <label>Classification trade CSV
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => setTradeFile(event.target.files?.[0] ?? null)} />
        </label>
        <label>Classification depth CSV
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => setDepthFile(event.target.files?.[0] ?? null)} />
        </label>
        {cutoffs.map(([key, label]) => <label key={key}>{label}
          <input required spellCheck={false} autoComplete="off" value={draft[key]}
            onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
        </label>)}
        <label>Maximum quote age (seconds)
          <input required inputMode="numeric" value={draft.maxQuoteAgeSeconds}
            onChange={event => setDraft({ ...draft, maxQuoteAgeSeconds: event.target.value })} />
        </label>
        <button className="outline" type="submit" disabled={busy || !(tradeFile || report?.trades) || !(depthFile || report?.depth)}>
          Classify trades
        </button>
      </form>
      {problem && <p className="warning" role="alert">{problem}</p>}
      {report && <>
        <p>{report.trades.name} · {report.depth.name}</p>
        {!rows.length && <p>No observed trades at these cutoffs.</p>}
        {!!rows.length && <>
          <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable classified trades">
            <table className="universe-table" aria-label="Classified trades">
              <thead><tr>{['Trade sequence', 'Execution UTC', 'Observed UTC', 'Price', 'Size', 'Side',
                'Basis', 'Book sequence', 'Best bid', 'Best ask'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(row =>
                <tr key={row.sequence.toString()}><th scope="row">{row.sequence.toString()}</th>
                  <td>{utc(row.executedAt)}</td><td>{utc(row.observedAt)}</td><td>{fixed(row.priceTicks, 6)}</td>
                  <td>{fixed(row.sizeTicks, 6)}</td><td>{row.side}</td><td>{basisLabel[row.basis]}</td>
                  <td>{row.quote?.stamp.sequence.toString() ?? '—'}</td>
                  <td>{row.quote?.bid ? fixed(row.quote.bid.priceTicks, 6) : '—'}</td>
                  <td>{row.quote?.ask ? fixed(row.quote.ask.priceTicks, 6) : '—'}</td>
                </tr>)}</tbody>
            </table>
          </div>
          {lastPage > 0 && <div className="replay-controls">
            <button className="outline" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous trades</button>
            <p>{current + 1} / {lastPage + 1}</p>
            <button className="outline" type="button" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next trades</button>
          </div>}
          <div className="replay-controls">
            <button className="outline" type="button" onClick={plotRows}>Plot classified trades</button>
            <button className="outline" type="button" onClick={() => downloadFile('recorded-trade-classification.csv',
              new Blob([auditCsv(instrument, report)], { type: 'text/csv;charset=utf-8' }))}>Download classification audit</button>
          </div>
        </>}
      </>}
    </section>
  </details>
}
