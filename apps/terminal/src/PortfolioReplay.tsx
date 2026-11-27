import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PortfolioSnapshot, PortfolioSpinOff, PortfolioSpinOffCash } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoHoldings from '../../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv?raw'
import demoPrices from '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv?raw'
import demoTerms from '../../../crates/core/tests/fixtures/synthetic-delisting-terms.csv?raw'
import demoDividends from '../../../crates/core/tests/fixtures/synthetic-portfolio-dividends.csv?raw'
import demoSpinOffs from '../../../crates/core/tests/fixtures/synthetic-portfolio-spin-offs.csv?raw'
import demoCashTerms from '../../../crates/core/tests/fixtures/synthetic-spin-off-cash-terms.csv?raw'

type Source = { holdings: string; prices: string; terms: string; dividends: string; spinOffs: string; cashTerms: string }
const states = {
  unobserved: 'Listing unobserved',
  'missing-close': 'Close unavailable',
  shares: 'Marked shares',
  'missing-proceeds': 'Proceeds unavailable',
  receivable: 'Delisting receivable',
  cash: 'Delisting cash',
}
const dividendStates = {
  'unknown-position': 'Entitlement unavailable',
  'no-payment': 'No payment',
  receivable: 'Dividend receivable',
  paid: 'Dividend cash',
}
const spinOffStates: Record<PortfolioSpinOff['state'], string> = {
  'unknown-position': 'Entitlement unavailable',
  'no-distribution': 'No distribution',
  receivable: 'Shares receivable',
  distributed: 'Shares distributed',
}
const spinOffCashStates: Record<PortfolioSpinOffCash['state'], string> = {
  'unknown-position': 'Entitlement unavailable',
  'missing-terms': 'Payment terms unavailable',
  'no-payment': 'No payment',
  receivable: 'Cash receivable',
  paid: 'Cash paid',
}
const money = (value: bigint) => fixed(value, 6)

function shareText(shares: PortfolioSpinOff['childShares']) {
  if (shares === null) return '—'
  return shares.denominator === 1 ? shares.numerator.toString() : shares.numerator + '/' + shares.denominator
}

async function readReport(file: File, max: number) {
  if (file.size > max * 1024 * 1024) throw new Error(file.name + ' exceeds ' + max + ' MiB.')
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
}

export function PortfolioReplay({ core, membership, demo, effective, known }: {
  core: MarketCore; membership: string; demo: boolean; effective: string; known: string
}) {
  const [source, setSource] = useState<Source | null>(null)
  const [holdings, setHoldings] = useState<File | null>(null)
  const [prices, setPrices] = useState<File | null>(null)
  const [terms, setTerms] = useState<File | null>(null)
  const [dividends, setDividends] = useState<File | null>(null)
  const [spinOffs, setSpinOffs] = useState<File | null>(null)
  const [cashTerms, setCashTerms] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = useMemo(() => source
    ? core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known, source.dividends)
    : null, [core, membership, source, effective, known])
  const distributions = useMemo(() => source?.spinOffs
    ? core.portfolioSpinOffsAsOf(membership, source.holdings, source.spinOffs, effective, known)
    : null, [core, membership, source, effective, known])
  const settlements = useMemo(() => source?.cashTerms
    ? core.portfolioSpinOffCashAsOf(membership, source.holdings, source.spinOffs, source.cashTerms, effective, known)
    : null, [core, membership, source, effective, known])

  function open(source: Source) {
    core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known, source.dividends)
    if (source.spinOffs) core.portfolioSpinOffsAsOf(membership, source.holdings, source.spinOffs, effective, known)
    if (source.cashTerms) core.portfolioSpinOffCashAsOf(membership, source.holdings, source.spinOffs, source.cashTerms, effective, known)
    setSource(source)
    setError('')
  }

  function startDemo(mode?: 'income' | 'spin-offs') {
    try {
      open({ holdings: demoHoldings, prices: demoPrices, terms: demoTerms,
        dividends: mode === 'income' ? demoDividends : '', spinOffs: mode === 'spin-offs' ? demoSpinOffs : '',
        cashTerms: mode === 'spin-offs' ? demoCashTerms : '' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the portfolio demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!holdings || !prices) return
    setBusy(true)
    try {
      const [holdingCsv, priceCsv, termCsv, dividendCsv, spinOffCsv, cashTermsCsv] = await Promise.all([
        readReport(holdings, 2), readReport(prices, 2), terms ? readReport(terms, 1) : '',
        dividends ? readReport(dividends, 1) : '', spinOffs ? readReport(spinOffs, 1) : '',
        cashTerms ? readReport(cashTerms, 1) : '',
      ])
      if (dividends && !dividendCsv.trim()) throw new Error('Portfolio dividends CSV contains no reports.')
      if (spinOffs && !spinOffCsv.trim()) throw new Error('Portfolio spin-off CSV contains no reports.')
      if (cashTerms && !cashTermsCsv.trim()) throw new Error('Spin-off cash terms CSV contains no reports.')
      if (cashTerms && !spinOffCsv) throw new Error('Supply spin-off reports with the cash terms.')
      open({ holdings: holdingCsv, prices: priceCsv, terms: termCsv, dividends: dividendCsv,
        spinOffs: spinOffCsv, cashTerms: cashTermsCsv })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the portfolio reports.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="side-card replay-panel replay-results" aria-labelledby="portfolio-title">
      <div className="replay-heading">
        <div>
          <h2 id="portfolio-title">Portfolio replay</h2>
          <p>Value dated holdings and review delisting, dividend and spin-off entitlements at the universe cutoffs.</p>
        </div>
        {demo && <div className="replay-controls">
          <button className="outline" onClick={() => startDemo()} disabled={busy}>Load portfolio demo</button>
          <button className="outline" onClick={() => startDemo('income')} disabled={busy}>Load dividend income demo</button>
          <button className="outline" onClick={() => startDemo('spin-offs')} disabled={busy}>Load spin-off demo</button>
        </div>}
      </div>
      <form className="universe-query" onSubmit={load}>
        <label>Portfolio holdings CSV
          <input required type="file" accept=".csv,text/csv"
            onChange={event => setHoldings(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio closes CSV
          <input required type="file" accept=".csv,text/csv"
            onChange={event => setPrices(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio delisting terms CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setTerms(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio dividends CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setDividends(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio spin-off CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setSpinOffs(event.target.files?.[0] ?? null)} />
        </label>
        <label>Spin-off cash terms CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setCashTerms(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={busy || !holdings || !prices}>Load portfolio reports</button>
      </form>
      {error && <p role="alert" className="warning replay-error">{error}</p>}
      {snapshot && <PortfolioResult snapshot={snapshot} />}
      {distributions && <SpinOffEntitlements rows={distributions} />}
      {settlements && settlements.length > 0 && <SpinOffSettlements rows={settlements} />}
    </section>
  )
}

function SpinOffEntitlements({ rows }: { rows: PortfolioSpinOff[] }) {
  if (!rows.length) return <p>No spin-off entitlements at these cutoffs.</p>
  return <div className="replay-table-scroll">
    <table className="universe-table" aria-label="Portfolio spin-off entitlements">
      <thead><tr><th scope="col">Action</th><th scope="col">Parent listing</th><th scope="col">Child listing</th>
        <th scope="col">Entitlement (UTC)</th><th scope="col">Distribution (UTC)</th><th scope="col">Terms observed (UTC)</th>
        <th scope="col">Parent shares</th><th scope="col">Holding observed (UTC)</th><th scope="col">Child shares</th>
        <th scope="col">State</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th scope="row">{row.id}</th><td>{row.parent}</td><td>{row.child}</td><td>{utc(row.entitlementAt)}</td>
        <td>{utc(row.distributionAt)}</td><td>{utc(row.observedAt)}</td><td>{row.entitledParentShares ?? '—'}</td>
        <td>{row.positionObservedAt === null ? '—' : utc(row.positionObservedAt)}</td>
        <td>{shareText(row.childShares)}</td>
        <td>{spinOffStates[row.state]}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function SpinOffSettlements({ rows }: { rows: PortfolioSpinOffCash[] }) {
  return <div className="replay-table-scroll">
    <table className="universe-table" aria-label="Portfolio spin-off cash in lieu">
      <thead><tr><th scope="col">Action</th><th scope="col">Child listing</th><th scope="col">Fractional shares</th>
        <th scope="col">Pay date (UTC)</th><th scope="col">Terms observed (UTC)</th><th scope="col">Cash per share</th>
        <th scope="col">State</th><th scope="col">Amount</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th scope="row">{row.id}</th><td>{row.child}</td><td>{shareText(row.fractionalShares)}</td>
        <td>{row.terms === null ? '—' : utc(row.terms.payAt)}</td>
        <td>{row.terms === null ? '—' : utc(row.terms.observedAt)}</td>
        <td>{row.terms === null ? '—' : money(row.terms.rate) + ' ' + row.terms.currency}</td>
        <td>{spinOffCashStates[row.state]}</td>
        <td>{row.amount === null ? '—' : [money(row.amount), row.terms?.currency].filter(Boolean).join(' ')}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function PortfolioResult({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const count = snapshot.holdings.length
  const base = new Map(snapshot.totals.map(row => [row.currency, row]))
  const incomeTotals = new Map(snapshot.income?.totals.map(row => [row.currency, row]))
  const currencies = [...new Set([...base.keys(), ...incomeTotals.keys()])].sort()
  return (
    <>
      <p role="status">{count} {count === 1 ? 'holding' : 'holdings'} · {snapshot.unvaluedPositions} without a value</p>
      {currencies.length > 0 && <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio currency subtotals">
          <thead><tr><th scope="col">Currency</th><th scope="col">Share value</th>
            <th scope="col">Delisting receivable</th><th scope="col">Delisting cash</th>
            {snapshot.income && <><th scope="col">Dividend receivable</th><th scope="col">Dividend cash</th></>}
            <th scope="col">Known subtotal</th></tr></thead>
          <tbody>{currencies.map(currency => {
            const row = base.get(currency)
            const income = incomeTotals.get(currency)
            const shares = row?.sharesValue ?? 0n
            const delistingReceivable = row?.receivable ?? 0n
            const delistingCash = row?.cash ?? 0n
            const dividendReceivable = income?.receivable ?? 0n
            const dividendCash = income?.cash ?? 0n
            return <tr key={currency}>
              <th scope="row">{currency}</th><td>{money(shares)}</td>
              <td>{money(delistingReceivable)}</td><td>{money(delistingCash)}</td>
              {snapshot.income && <><td>{money(dividendReceivable)}</td><td>{money(dividendCash)}</td></>}
              <td>{money(shares + delistingReceivable + delistingCash + dividendReceivable + dividendCash)}</td>
            </tr>
          })}</tbody>
        </table>
      </div>}
      {snapshot.income && snapshot.income.dividends.length > 0 && <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio dividend entitlement">
          <thead><tr><th scope="col">Listing</th><th scope="col">Dividend</th><th scope="col">Ex date (UTC)</th>
            <th scope="col">Pay date (UTC)</th><th scope="col">Terms observed (UTC)</th>
            <th scope="col">Entitled shares</th><th scope="col">State</th><th scope="col">Amount</th></tr></thead>
          <tbody>{snapshot.income.dividends.map(row => (
            <tr key={row.listing + ':' + row.id}>
              <th scope="row">{row.listing}</th><td>{row.id}</td><td>{utc(row.exAt)}</td>
              <td>{utc(row.payAt)}</td><td>{utc(row.observedAt)}</td><td>{row.entitledShares ?? '—'}</td>
              <td>{dividendStates[row.state]}</td>
              <td>{row.amount === null ? '—' : money(row.amount) + ' ' + row.currency}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
      {count > 0 && <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio positions">
          <thead><tr><th scope="col">Listing</th><th scope="col">Instrument</th><th scope="col">Shares</th>
            <th scope="col">State</th><th scope="col">Value</th><th scope="col">Position observed (UTC)</th>
            <th scope="col">Price or terms observed (UTC)</th></tr></thead>
          <tbody>{snapshot.holdings.map(row => (
            <tr key={row.listing}>
              <th scope="row">{row.listing}</th><td>{row.instrument ?? '—'}</td><td>{row.shares}</td>
              <td>{states[row.state]}</td><td>{row.value === null ? '—' : money(row.value) + ' ' + row.currency}</td>
              <td>{utc(row.positionObservedAt)}</td>
              <td>{row.termsObservedAt !== null
                ? utc(row.termsObservedAt) : row.priceObservedAt !== null ? utc(row.priceObservedAt) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
    </>
  )
}
