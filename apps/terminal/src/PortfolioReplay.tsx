import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PortfolioSnapshot } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoHoldings from '../../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv?raw'
import demoPrices from '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv?raw'
import demoTerms from '../../../crates/core/tests/fixtures/synthetic-delisting-terms.csv?raw'

type Source = { holdings: string; prices: string; terms: string }
const states = {
  unobserved: 'Listing unobserved',
  'missing-close': 'Close unavailable',
  shares: 'Marked shares',
  'missing-proceeds': 'Proceeds unavailable',
  receivable: 'Delisting receivable',
  cash: 'Delisting cash',
}
const money = (value: bigint) => fixed(value, 6)

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = useMemo(() => source
    ? core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known)
    : null, [core, membership, source, effective, known])

  function open(source: Source) {
    core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known)
    setSource(source)
    setError('')
  }

  function startDemo() {
    try {
      open({ holdings: demoHoldings, prices: demoPrices, terms: demoTerms })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the portfolio demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!holdings || !prices) return
    setBusy(true)
    try {
      const [holdingCsv, priceCsv, termCsv] = await Promise.all([
        readReport(holdings, 2), readReport(prices, 2), terms ? readReport(terms, 1) : '',
      ])
      open({ holdings: holdingCsv, prices: priceCsv, terms: termCsv })
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
          <p>Value dated holdings, delisting receivables and cash at the universe cutoffs.</p>
        </div>
        {demo && <button className="outline" onClick={startDemo} disabled={busy}>Load portfolio demo</button>}
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
        <button className="outline" disabled={busy || !holdings || !prices}>Load portfolio reports</button>
      </form>
      {error && <p role="alert" className="warning replay-error">{error}</p>}
      {snapshot && <PortfolioResult snapshot={snapshot} />}
    </section>
  )
}

function PortfolioResult({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const count = snapshot.holdings.length
  return (
    <>
      <p role="status">{count} {count === 1 ? 'holding' : 'holdings'} · {snapshot.unvaluedPositions} without a value</p>
      {snapshot.totals.length > 0 && <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio currency subtotals">
          <thead><tr><th scope="col">Currency</th><th scope="col">Share value</th>
            <th scope="col">Delisting receivable</th><th scope="col">Delisting cash</th>
            <th scope="col">Known subtotal</th></tr></thead>
          <tbody>{snapshot.totals.map(row => (
            <tr key={row.currency}>
              <th scope="row">{row.currency}</th><td>{money(row.sharesValue)}</td>
              <td>{money(row.receivable)}</td><td>{money(row.cash)}</td>
              <td>{money(row.sharesValue + row.receivable + row.cash)}</td>
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
