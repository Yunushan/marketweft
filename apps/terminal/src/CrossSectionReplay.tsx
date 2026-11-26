import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { CrossSectionConfig, CrossSectionReport, MarketCore, PaperConfig, PaperReceipt } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoLiquidity from '../../../crates/core/tests/fixtures/synthetic-cross-section-liquidity.csv?raw'

const defaults: CrossSectionConfig = {
  decisionSeconds: '60', lookbackSeconds: '60', topListings: '1', targetShares: '4',
  limitBuffer: '1000', participation: '10000',
  paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1000', feePerShare: '0.1', feePerOrder: '0.5' },
}

const rankingFields = [
  ['decisionSeconds', 'Decision interval (seconds)'], ['lookbackSeconds', 'Return lookback (seconds)'],
  ['topListings', 'Ranked listings to hold'], ['targetShares', 'Target shares per listing'],
  ['limitBuffer', 'Limit buffer (basis points)'], ['participation', 'Liquidity participation (basis points)'],
] as const

const accountFields: [keyof PaperConfig, string][] = [
  ['startingCash', 'Starting cash'], ['positionLimit', 'Position limit (shares)'],
  ['exposureLimit', 'Committed cost limit'], ['feePerShare', 'Fee per share'], ['feePerOrder', 'Fee per order'],
]

type Source = { csv: string; name: string }
type Run = { from: string; config: CrossSectionConfig; liquidity: Source }
type ReplayProps = {
  core: MarketCore; membership: string; membershipSource: string; prices: string; priceSource: string;
  firstCutoff: string; effective: string; known: string; demo: boolean
}

function money(value: bigint | null) {
  return value === null ? '—' : fixed(value, 6)
}
function decimal(value: bigint | null) {
  return value === null ? '' : fixed(value, 6)
}

function downloadReplay(report: CrossSectionReport, run: Run, props: ReplayProps) {
  const { membershipSource, priceSource, effective, known } = props
  const { config, liquidity, from } = run
  const settings = [...rankingFields.map(([key]) => config[key]), ...accountFields.map(([key]) => config.paper[key])]
  const prefix = [membershipSource, priceSource, liquidity.name, from, effective, known, ...settings].map(quoteText)
  const header = 'membership_source,price_source,liquidity_source,from_utc,effective_through_utc,known_through_utc,decision_seconds,lookback_seconds,top_listings,target_shares,limit_buffer_bps,participation_bps,starting_cash,position_limit,committed_cost_limit,fee_per_share,fee_per_order,row,observed_utc,listing,event_id,action,side,order_id,quote_id,price_utc,shares,price,outcome,cash_change,fee,realized_change,ranked,missing,selected,position_cost,cash,reserved_cash,fees,turnover,equity'
  const rows = [
    ['summary', ...Array<string>(18).fill(''), decimal(report.cash), decimal(report.reservedCash),
      decimal(report.fees), decimal(report.turnover), decimal(report.equity)],
    ...report.decisions.map(row => ['decision', utc(row.at), ...Array<string>(13).fill(''),
      row.eligible, row.missing, quoteText(row.selected.join(' ')), ...Array<string>(6).fill('')]),
    ...report.positions.map(row => ['position', '', quoteText(row.listingId), ...Array<string>(6).fill(''),
      row.shares, decimal(row.mark), ...Array<string>(7).fill(''), decimal(row.cost), ...Array<string>(5).fill('')]),
    ...report.receipts.map(row => ['receipt', utc(row.observedAt), quoteText(row.listingId), row.id, row.kind, row.side,
      row.orderId ?? '', row.sourceId ?? '', row.priceAt === null ? '' : utc(row.priceAt), row.shares ?? '',
      decimal(row.price), row.status, decimal(row.cashDelta), decimal(row.fee), decimal(row.realizedDelta),
      ...Array<string>(9).fill('')]),
  ]
  const csv = [header, ...rows.map(row => [...prefix, ...row].join(','))].join('\r\n') + '\r\n'
  downloadFile('cross-sectional-paper-replay.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

function Receipts({ rows }: { rows: (PaperReceipt & { listingId: string; side: string })[] }) {
  const [page, setPage] = useState(0)
  const perPage = 100
  const maxPage = Math.max(0, Math.ceil(rows.length / perPage) - 1)
  const current = Math.min(page, maxPage)
  if (!rows.length) return <p>No orders or fills at these cutoffs.</p>
  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable paper receipts">
      <table className="universe-table" aria-label="Cross-sectional paper receipts">
        <thead><tr><th scope="col">Event</th><th scope="col">Observed UTC</th><th scope="col">Listing</th>
          <th scope="col">Action</th><th scope="col">Side</th><th scope="col">Order</th><th scope="col">Quote</th>
          <th scope="col">Price UTC</th><th scope="col">Shares</th><th scope="col">Price or limit</th>
          <th scope="col">Outcome</th><th scope="col">Cash change</th><th scope="col">Fee</th></tr></thead>
        <tbody>{rows.slice(current * perPage, (current + 1) * perPage).map(row => (
          <tr key={row.id}><th scope="row">{row.id}</th><td>{utc(row.observedAt)}</td><td>{row.listingId}</td>
            <td>{row.kind}</td><td>{row.side || '—'}</td><td>{row.orderId ?? '—'}</td><td>{row.sourceId ?? '—'}</td>
            <td>{row.priceAt === null ? '—' : utc(row.priceAt)}</td><td>{row.shares?.toString() ?? '—'}</td>
            <td>{money(row.price)}</td><td>{row.status}</td><td>{money(row.cashDelta)}</td><td>{money(row.fee)}</td></tr>
        ))}</tbody>
      </table>
    </div>
    {maxPage > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous receipts</button>
      <p>{current + 1} / {maxPage + 1}</p>
      <button type="button" className="outline" disabled={current === maxPage} onClick={() => setPage(current + 1)}>Next receipts</button>
    </div>}
  </>
}

export function CrossSectionReplay(props: ReplayProps) {
  const { core, membership, prices, firstCutoff, effective, known, demo } = props
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [from, setFrom] = useState(() => utc(Date.parse(firstCutoff) / 1000 + 60))
  const [draft, setDraft] = useState(defaults)
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const state = useMemo(() => {
    if (!run) return null
    try {
      return { report: core.crossSectionReplay(membership, prices, run.liquidity.csv, run.from, effective, known, run.config) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not run the paper replay.' }
    }
  }, [core, membership, prices, effective, known, run])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file && !source) return
    setBusy(true)
    try {
      let liquidity = source
      if (file) {
        if (file.size > 2 * 1024 * 1024) throw new Error('Paper liquidity CSV exceeds 2 MiB.')
        liquidity = { csv: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), name: file.name }
      }
      if (!liquidity) return
      const next = { from: from.trim(), config: draft, liquidity }
      core.crossSectionReplay(membership, prices, liquidity.csv, next.from, effective, known, draft)
      setRun(next)
      setSource(liquidity)
      setFile(null)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run the paper replay.')
    } finally {
      setBusy(false)
    }
  }

  const report = state?.report
  return <details className="research-details">
    <summary>Cross-sectional paper replay</summary>
    <section aria-label="Cross-sectional paper replay">
      <form onSubmit={submit}>
        <div className="universe-query">
          <label>Execution liquidity CSV
            <input type="file" accept=".csv,text/csv" disabled={busy}
              onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </label>
          {demo && <button type="button" className="outline" disabled={busy} onClick={() => {
            setSource({ csv: demoLiquidity, name: 'Synthetic paper liquidity' })
            setFile(null)
            setError('')
          }}>Use sample liquidity</button>}
          <label>First decision (UTC)
            <input required value={from} onChange={event => setFrom(event.target.value)}
              autoComplete="off" spellCheck={false} />
          </label>
        </div>
        {source && !file && <p>Liquidity source {source.name}</p>}
        <div className="universe-query">
          {rankingFields.map(([key, label]) => <label key={key}>{label}
            <input required inputMode="numeric" value={draft[key]}
              onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
          </label>)}
        </div>
        <details>
          <summary>Paper account settings</summary>
          <div className="universe-query">
            {accountFields.map(([key, label]) => <label key={key}>{label}
              <input required inputMode={key === 'positionLimit' ? 'numeric' : 'decimal'} value={draft.paper[key]}
                onChange={event => setDraft({ ...draft, paper: { ...draft.paper, [key]: event.target.value } })} />
            </label>)}
          </div>
        </details>
        <button type="submit" className="outline" disabled={busy || !file && !source}>Run ranking replay</button>
      </form>
      {(error || state?.error) && <p className="warning" role="alert">{error || state?.error}</p>}
      {report && run && <>
        <p role="status">{report.decisions.length} decisions · {report.receipts.length} paper receipts</p>
        <dl className="replay-times">
          <div><dt>Cash</dt><dd>{money(report.cash)}</dd></div>
          <div><dt>Reserved cash</dt><dd>{money(report.reservedCash)}</dd></div>
          <div><dt>Fees</dt><dd>{money(report.fees)}</dd></div>
          <div><dt>Filled turnover</dt><dd>{money(report.turnover)}</dd></div>
          <div><dt>Marked equity</dt><dd>{report.equity === null ? 'Incomplete marks' : money(report.equity)}</dd></div>
        </dl>
        {!!report.decisions.length && <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable ranking decisions">
          <table className="universe-table" aria-label="Ranking decisions">
            <thead><tr><th scope="col">Decision UTC</th><th scope="col">Ranked</th><th scope="col">Missing</th><th scope="col">Selected</th></tr></thead>
            <tbody>{report.decisions.map(row => <tr key={row.at}><th scope="row">{utc(row.at)}</th>
              <td>{row.eligible}</td><td>{row.missing}</td><td>{row.selected.join(', ') || '—'}</td></tr>)}</tbody>
          </table>
        </div>}
        {!!report.positions.length && <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable ending positions">
          <table className="universe-table" aria-label="Ending paper positions">
            <thead><tr><th scope="col">Listing</th><th scope="col">Shares</th><th scope="col">Cost</th><th scope="col">Exact close</th></tr></thead>
            <tbody>{report.positions.map(row => <tr key={row.listingId}><th scope="row">{row.listingId}</th>
              <td>{row.shares.toString()}</td><td>{money(row.cost)}</td><td>{money(row.mark)}</td></tr>)}</tbody>
          </table>
        </div>}
        <Receipts rows={report.receipts} />
        <button type="button" className="outline" onClick={() => downloadReplay(report, run, props)}>Download paper replay</button>
      </>}
    </section>
  </details>
}
