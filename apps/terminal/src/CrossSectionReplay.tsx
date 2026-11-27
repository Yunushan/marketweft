import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { CrossSectionConfig, CrossSectionReport, CrossSectionWalkConfig, MarketCore, PaperConfig, PaperReceipt } from './market-core'
import { CrossSectionWalk } from './CrossSectionWalk'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoLiquidity from '../../../crates/core/tests/fixtures/synthetic-cross-section-liquidity.csv?raw'
import demoWalkLiquidity from '../../../crates/core/tests/fixtures/synthetic-cross-section-walk-liquidity.csv?raw'
import demoDividends from '../../../crates/core/tests/fixtures/synthetic-cross-section-dividends.csv?raw'
import demoDelistings from '../../../crates/core/tests/fixtures/synthetic-cross-section-delisting.csv?raw'
import demoSuccessors from '../../../crates/core/tests/fixtures/synthetic-paper-successor-shares.csv?raw'

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
type CorporateReports = {
  accountCurrency: string; dividends: Source | null; delistings: Source | null; successorShares: Source | null
}
type Run = { from: string; config: CrossSectionConfig; liquidity: Source; corporate: CorporateReports | null }
type ReplayProps = {
  core: MarketCore; membership: string; membershipSource: string; prices: string; priceSource: string;
  firstCutoff: string; effective: string; known: string; demo: boolean; corporateDemo?: boolean
}

function calculationInputs(reports: CorporateReports | null) {
  if (!reports) return undefined
  return { accountCurrency: reports.accountCurrency, dividends: reports.dividends?.csv ?? '',
    delistings: reports.delistings?.csv ?? '', successorShares: reports.successorShares?.csv ?? '' }
}

async function readReport(file: File | null, prior: Source | null, label: string, limit: number) {
  if (!file) return prior
  if (file.size > limit * 1024 * 1024) throw new Error(`${label} CSV exceeds ${limit} MiB.`)
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  if (!csv.trim()) throw new Error(`${label} CSV is empty.`)
  return { csv, name: file.name }
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
          <th scope="col">Action</th><th scope="col">Side</th><th scope="col">Order</th><th scope="col">Source ID</th>
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

function CorporateCash({ report, run, props }: {
  report: CrossSectionReport; run: CorporateReports; props: ReplayProps
}) {
  const rows = [
    ...report.dividendPostings.map(row => ({
      kind: 'Dividend movement', id: row.dividendId, listing: row.listingId,
      at: row.postedAt, effective: row.exAt, observed: row.observedAt, terms: null,
      pay: row.payAt, shares: row.shares, status: '', currency: row.currency,
      amount: null, delta: row.cashDelta, receipt: row.receiptId,
    })),
    ...report.delistingClaims.map(claim => ({
      kind: 'Delisting claim', id: claim.changeId, listing: claim.listingId,
      at: null, effective: claim.effectiveAt, observed: claim.observedAt, terms: claim.termsObservedAt,
      pay: claim.payAt, shares: claim.shares, status: claim.state, currency: claim.currency,
      amount: claim.amount, delta: null, receipt: null,
    })),
    ...report.delistingPostings.map(({ claim, postedAt, cashDelta, receiptId }) => ({
      kind: 'Delisting movement', id: claim.changeId, listing: claim.listingId,
      at: postedAt, effective: claim.effectiveAt, observed: claim.observedAt, terms: claim.termsObservedAt,
      pay: claim.payAt, shares: claim.shares, status: claim.state, currency: claim.currency,
      amount: claim.amount, delta: cashDelta, receipt: receiptId,
    })),
  ].sort((left, right) => (left.at ?? Infinity) - (right.at ?? Infinity))
  const date = (value: number | null) => value === null ? '' : utc(value)
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(rows.length / 100) - 1)
  const current = Math.min(page, lastPage)
  if (!rows.length) return <p>No corporate cash movements or delisting claims at these cutoffs.</p>

  function download() {
    const source = [props.membershipSource, props.priceSource, run.dividends?.name ?? '',
      run.delistings?.name ?? '', run.accountCurrency, props.effective, props.known].map(quoteText)
    const header = 'membership_source,price_source,dividend_source,delisting_source,account_currency,effective_through_utc,known_through_utc,kind,listing,source_id,posted_utc,ex_or_delisting_utc,report_observed_utc,terms_observed_utc,pay_utc,shares,state,currency,amount,cash_change,receipt_id'
    const csv = [header, ...rows.map(row => [...source, row.kind, row.listing, row.id,
      date(row.at), date(row.effective), date(row.observed), date(row.terms), date(row.pay),
      row.shares, row.status, row.currency ?? '', decimal(row.amount), decimal(row.delta), row.receipt ?? '',
    ].join(','))].join('\r\n') + '\r\n'
    downloadFile('paper-corporate-cash.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable corporate cash">
      <table className="universe-table" aria-label="Paper corporate cash">
        <thead><tr><th scope="col">Event</th><th scope="col">Listing</th><th scope="col">Source ID</th>
          <th scope="col">Posted UTC</th><th scope="col">Effective UTC</th><th scope="col">Pay UTC</th>
          <th scope="col">Shares</th><th scope="col">Status</th><th scope="col">Currency</th>
          <th scope="col">Proceeds</th><th scope="col">Cash change</th><th scope="col">Receipt</th></tr></thead>
        <tbody>{rows.slice(current * 100, (current + 1) * 100).map((row, index) => (
          <tr key={current * 100 + index}><th scope="row">{row.kind}</th><td>{row.listing}</td>
            <td>{row.id}</td><td>{date(row.at) || '—'}</td><td>{date(row.effective)}</td><td>{date(row.pay) || '—'}</td>
            <td>{row.shares.toString()}</td><td>{row.status || '—'}</td><td>{row.currency ?? '—'}</td>
            <td>{money(row.amount)}</td><td>{money(row.delta)}</td><td>{row.receipt ?? '—'}</td></tr>
        ))}</tbody>
      </table>
    </div>
    {lastPage > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous cash rows</button>
      <p>{current + 1} / {lastPage + 1}</p>
      <button type="button" className="outline" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next cash rows</button>
    </div>}
    <button type="button" className="outline" onClick={download}>Download corporate cash</button>
  </>
}

function SuccessorClaims({ report, source, currency, props }: {
  report: CrossSectionReport; source: Source; currency: string; props: ReplayProps
}) {
  const rows = report.successorClaims
  if (!rows.length) return <p>No known paper successor-share claims at these cutoffs.</p>
  const optionalUtc = (value: number | null) => value === null ? '' : utc(value)
  const detail = (row: CrossSectionReport['successorClaims'][number]) => [
    row.listingId, row.changeId, utc(row.effectiveAt), utc(row.observedAt), utc(row.positionAt), row.entitledShares,
    row.successorListing, utc(row.termsObservedAt), optionalUtc(row.deliverAt), row.ratio, row.shares, row.state,
    optionalUtc(row.markObservedAt), decimal(row.mark), decimal(row.value),
  ]
  function download() {
    const prefix = [props.membershipSource, props.priceSource, source.name, currency, props.effective, props.known]
      .map(quoteText)
    const header = 'membership_source,price_source,successor_source,account_currency,effective_through_utc,known_through_utc,listing,change_id,delisting_utc,delisting_observed_utc,holding_observed_utc,entitled_shares,successor_listing,terms_observed_utc,delivery_utc,ratio,successor_shares,state,mark_observed_utc,mark,marked_value'
    const csv = [header, ...rows.map(row => [...prefix, ...detail(row)].join(','))].join('\r\n') + '\r\n'
    downloadFile('paper-successor-claims.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }
  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable paper successor shares">
      <table className="universe-table" aria-label="Paper successor shares">
        <thead><tr>{['Delisted listing', 'Delisting', 'Effective UTC', 'Observed UTC', 'Holding UTC', 'Entitled shares',
          'Successor listing', 'Terms UTC', 'Delivery UTC', 'Ratio', 'Successor shares', 'State', 'Mark observed UTC',
          'Close', `Marked value (${currency})`].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const [listing, ...values] = detail(row)
          return <tr key={row.changeId}><th scope="row">{listing}</th>
            {values.map((value, index) => <td key={index}>{value === '' ? '—' : value.toString()}</td>)}</tr>
        })}</tbody>
      </table>
    </div>
    <button type="button" className="outline" onClick={download}>Download paper successor shares</button>
  </>
}

export function CrossSectionReplay(props: ReplayProps) {
  const { core, membership, prices, firstCutoff, effective, known, demo, corporateDemo } = props
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [enableCorporate, setEnableCorporate] = useState(false)
  const [accountCurrency, setAccountCurrency] = useState('USD')
  const [dividendFile, setDividendFile] = useState<File | null>(null)
  const [delistingFile, setDelistingFile] = useState<File | null>(null)
  const [successorFile, setSuccessorFile] = useState<File | null>(null)
  const [dividends, setDividends] = useState<Source | null>(null)
  const [delistings, setDelistings] = useState<Source | null>(null)
  const [successorShares, setSuccessorShares] = useState<Source | null>(null)
  const [from, setFrom] = useState(() => utc(Date.parse(firstCutoff) / 1000 + 60))
  const [draft, setDraft] = useState(defaults)
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const calculateWalk = useCallback((settings: CrossSectionWalkConfig) => {
    if (!run) return []
    return core.crossSectionWalk(membership, prices, run.liquidity.csv, run.from, effective, known,
      run.config, settings, calculationInputs(run.corporate))
  }, [core, membership, prices, run, effective, known])
  const state = useMemo(() => {
    if (!run) return null
    try {
      return { report: core.crossSectionReplay(membership, prices, run.liquidity.csv,
        run.from, effective, known, run.config, calculationInputs(run.corporate)) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not run the paper replay.' }
    }
  }, [core, membership, prices, effective, known, run])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file && !source) return
    setBusy(true)
    try {
      const [liquidity, dividendReport, delistingReport, successorReport] = await Promise.all([
        readReport(file, source, 'Paper liquidity', 2),
        readReport(enableCorporate ? dividendFile : null, dividends, 'Paper dividend', 1),
        readReport(enableCorporate ? delistingFile : null, delistings, 'Paper delisting', 1),
        readReport(enableCorporate ? successorFile : null, successorShares, 'Paper successor share', 1),
      ])
      if (!liquidity) return
      const corporate = enableCorporate ? { accountCurrency: accountCurrency.trim(),
        dividends: dividendReport, delistings: delistingReport, successorShares: successorReport } : null
      const next = { from: from.trim(), config: draft, liquidity, corporate }
      core.crossSectionReplay(membership, prices, liquidity.csv, next.from, effective, known, draft,
        calculationInputs(corporate))
      setRun(next)
      setSource(liquidity)
      setFile(null)
      if (enableCorporate) {
        setDividends(dividendReport)
        setDelistings(delistingReport)
        setSuccessorShares(successorReport)
        setDividendFile(null)
        setDelistingFile(null)
        setSuccessorFile(null)
      }
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
          {demo && <button type="button" className="outline" disabled={busy} onClick={() => {
            setSource({ csv: demoWalkLiquidity, name: 'Synthetic walk-forward liquidity' })
            setFile(null)
            setError('')
          }}>Use walk-forward sample liquidity</button>}
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
        <details>
          <summary>Corporate cash reports</summary>
          <label><input type="checkbox" checked={enableCorporate} disabled={busy}
            onChange={event => setEnableCorporate(event.target.checked)} /> Apply corporate cash and delistings</label>
          {corporateDemo && <button type="button" className="outline" disabled={busy} onClick={() => {
            setEnableCorporate(true)
            setAccountCurrency('USD')
            setDividends({ name: 'Synthetic paper dividends', csv: demoDividends })
            setDelistings({ name: 'Synthetic paper delisting terms', csv: demoDelistings })
            setDividendFile(null)
            setDelistingFile(null)
          }}>Use sample corporate reports</button>}
          {corporateDemo && enableCorporate && <button type="button" className="outline" disabled={busy} onClick={() => {
            setSuccessorShares({ name: 'Synthetic paper successor share terms', csv: demoSuccessors })
            setSuccessorFile(null)
          }}>Use sample successor share terms</button>}
          {enableCorporate && <div className="universe-query">
            <label>Paper account currency
              <input value={accountCurrency} maxLength={3} required disabled={busy}
                onChange={event => setAccountCurrency(event.target.value.toUpperCase())} />
            </label>
            <label>Paper dividends CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                onChange={event => setDividendFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>Paper delisting terms CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                onChange={event => setDelistingFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>Paper successor share terms CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                onChange={event => setSuccessorFile(event.target.files?.[0] ?? null)} />
            </label>
            {dividends && <div>{dividends.name} <button type="button" className="outline" disabled={busy}
              onClick={() => { setDividends(null); setDividendFile(null) }}>Remove dividend source</button></div>}
            {delistings && <div>{delistings.name} <button type="button" className="outline" disabled={busy}
              onClick={() => { setDelistings(null); setDelistingFile(null) }}>Remove delisting source</button></div>}
            {successorShares && <div>{successorShares.name} <button type="button" className="outline" disabled={busy}
              onClick={() => { setSuccessorShares(null); setSuccessorFile(null) }}>Remove successor share source</button></div>}
          </div>}
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
        {run.corporate && <CorporateCash report={report} run={run.corporate} props={props} />}
        {run.corporate?.successorShares && <SuccessorClaims report={report} source={run.corporate.successorShares}
          currency={run.corporate.accountCurrency} props={props} />}
        <button type="button" className="outline" onClick={() => downloadReplay(report, run, props)}>Download paper replay</button>
      </>}
      {run && <CrossSectionWalk calculate={calculateWalk} metadata={[
        ['membership_source', props.membershipSource], ['price_source', props.priceSource],
        ['liquidity_source', run.liquidity.name], ['dividend_source', run.corporate?.dividends?.name ?? ''],
        ['delisting_source', run.corporate?.delistings?.name ?? ''], ['account_currency', run.corporate?.accountCurrency ?? ''],
        ...(run.corporate?.successorShares ? [['successor_share_source', run.corporate.successorShares.name] as [string, string]] : []),
        ['from_utc', run.from], ['effective_through_utc', effective], ['known_through_utc', known],
        ['decision_seconds', run.config.decisionSeconds], ['target_shares', run.config.targetShares],
        ['limit_buffer_bps', run.config.limitBuffer], ['participation_bps', run.config.participation],
        ['starting_cash', run.config.paper.startingCash], ['position_limit', run.config.paper.positionLimit],
        ['committed_cost_limit', run.config.paper.exposureLimit], ['fee_per_share', run.config.paper.feePerShare],
        ['fee_per_order', run.config.paper.feePerOrder],
      ]} />}
    </section>
  </details>
}
