import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PortfolioSnapshot, PortfolioSpinOff, PortfolioSpinOffBasis, PortfolioSpinOffCash, PortfolioSuccessorShare } from './market-core'
import { SuccessorDeliveryLedger, shareText } from './SuccessorDeliveryLedger'
import { PortfolioRights } from './PortfolioRights'
import { PortfolioRightsExercises } from './PortfolioRightsExercises'
import { PortfolioRightsSettlementJournal } from './PortfolioRightsSettlementJournal'
import { PortfolioCapitalReturns } from './PortfolioCapitalReturns'
import { PortfolioCapitalReturnComparison } from './PortfolioCapitalReturnComparison'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoHoldings from '../../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv?raw'
import demoPrices from '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv?raw'
import demoTerms from '../../../crates/core/tests/fixtures/synthetic-delisting-terms.csv?raw'
import demoDividends from '../../../crates/core/tests/fixtures/synthetic-portfolio-dividends.csv?raw'
import demoSpinOffs from '../../../crates/core/tests/fixtures/synthetic-portfolio-spin-offs.csv?raw'
import demoCashTerms from '../../../crates/core/tests/fixtures/synthetic-spin-off-cash-terms.csv?raw'
import demoBasisTerms from '../../../crates/core/tests/fixtures/synthetic-spin-off-basis-terms.csv?raw'

import demoSuccessors from '../../../crates/core/tests/fixtures/synthetic-successor-shares.csv?raw'
import demoRightsHoldings from '../../../crates/core/tests/fixtures/synthetic-rights-holdings.csv?raw'
import demoRights from '../../../crates/core/tests/fixtures/synthetic-subscription-rights.csv?raw'
import demoExercises from '../../../crates/core/tests/fixtures/synthetic-rights-exercises.csv?raw'
import demoRightsJournal from '../../../crates/core/tests/fixtures/synthetic-rights-journal.csv?raw'
import demoCapitalReturns from '../../../crates/core/tests/fixtures/synthetic-capital-returns.csv?raw'
import demoCapitalBasis from '../../../crates/core/tests/fixtures/synthetic-capital-return-basis.csv?raw'

type Source = {
  holdings: string; prices: string; terms: string; dividends: string; spinOffs: string
  cashTerms: string; basisTerms: string; successors: string
  rights?: { csv: string; reportsName: string; holdingsName: string; exercises?: { csv: string; name: string } }
  capitalReturns?: { csv: string; basis: string; reportsName: string; holdingsName: string; basisName?: string }
}
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
const spinOffBasisStates: Record<PortfolioSpinOffBasis['state'], string> = {
  'unknown-position': 'Entitlement unavailable',
  'missing-terms': 'Basis terms unavailable',
  'no-distribution': 'No distribution',
  'awaiting-distribution': 'Awaiting distribution',
  allocated: 'Basis allocated',
}
const successorShareStates: Record<PortfolioSuccessorShare['state'], string> = {
  'missing-terms': 'Successor terms unavailable',
  'unknown-position': 'Entitlement unavailable',
  'no-distribution': 'No distribution',
  receivable: 'Shares receivable',
  delivered: 'Shares delivered',
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
  const [dividends, setDividends] = useState<File | null>(null)
  const [spinOffs, setSpinOffs] = useState<File | null>(null)
  const [cashTerms, setCashTerms] = useState<File | null>(null)
  const [basisTerms, setBasisTerms] = useState<File | null>(null)
  const [successors, setSuccessors] = useState<File | null>(null)
  const [rights, setRights] = useState<File | null>(null)
  const [exercises, setExercises] = useState<File | null>(null)
  const [capitalReturns, setCapitalReturns] = useState<File | null>(null)
  const [capitalBasis, setCapitalBasis] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsPrices = !(rights || exercises || capitalReturns || capitalBasis) || !!(terms || dividends || spinOffs || cashTerms || basisTerms || successors)
  const snapshot = useMemo(() => source?.prices
    ? core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known, source.dividends)
    : null, [core, membership, source, effective, known])
  const distributions = useMemo(() => source?.spinOffs
    ? core.portfolioSpinOffsAsOf(membership, source.holdings, source.spinOffs, effective, known)
    : null, [core, membership, source, effective, known])
  const settlements = useMemo(() => source?.cashTerms
    ? core.portfolioSpinOffCashAsOf(membership, source.holdings, source.spinOffs, source.cashTerms, effective, known)
    : null, [core, membership, source, effective, known])

  const allocations = useMemo(() => source?.basisTerms
    ? core.portfolioSpinOffBasisAsOf(membership, source.holdings, source.spinOffs, source.basisTerms, effective, known)
    : null, [core, membership, source, effective, known])

  const successorClaims = useMemo(() => source?.successors
    ? core.portfolioSuccessorSharesAsOf(membership, source.holdings, source.successors, effective, known)
    : null, [core, membership, source, effective, known])
  const rightOfferings = useMemo(() => source?.rights
    ? core.portfolioRightsAsOf(membership, source.holdings, source.rights.csv, effective, known)
    : null, [core, membership, source, effective, known])
  const exerciseReports = useMemo(() => source?.rights?.exercises
    ? core.portfolioRightsExercisesAsOf(membership, source.holdings, source.rights.csv, source.rights.exercises.csv, effective, known)
    : null, [core, membership, source, effective, known])
  const capitalDistributions = useMemo(() => source?.capitalReturns
    ? core.portfolioCapitalReturnsAsOf(membership, source.holdings, source.capitalReturns.csv, source.capitalReturns.basis, effective, known)
    : null, [core, membership, source, effective, known])

  const calculateDeliveries = useCallback(() => source?.successors
    ? core.portfolioSuccessorDeliveryLedger(membership, source.holdings, source.successors, effective, known)
    : [], [core, membership, source, effective, known])
  const calculateRightsJournal = useCallback(() => source?.rights?.exercises
    ? core.portfolioRightsSettlementJournal(membership, source.rights.csv, source.rights.exercises.csv, effective, known)
    : [], [core, membership, source, effective, known])

  function open(source: Source) {
    if (source.prices) core.portfolioAsOf(membership, source.holdings, source.prices, source.terms, effective, known, source.dividends)
    if (source.spinOffs) core.portfolioSpinOffsAsOf(membership, source.holdings, source.spinOffs, effective, known)
    if (source.cashTerms) core.portfolioSpinOffCashAsOf(membership, source.holdings, source.spinOffs, source.cashTerms, effective, known)
    if (source.basisTerms) core.portfolioSpinOffBasisAsOf(membership, source.holdings, source.spinOffs, source.basisTerms, effective, known)
    if (source.successors) core.portfolioSuccessorSharesAsOf(membership, source.holdings, source.successors, effective, known)
    if (source.rights) core.portfolioRightsAsOf(membership, source.holdings, source.rights.csv, effective, known)
    if (source.rights?.exercises)
      core.portfolioRightsExercisesAsOf(membership, source.holdings, source.rights.csv, source.rights.exercises.csv, effective, known)
    if (source.capitalReturns)
      core.portfolioCapitalReturnsAsOf(membership, source.holdings, source.capitalReturns.csv, source.capitalReturns.basis, effective, known)
    setSource(source)
    setError('')
  }

  function startDemo(mode?: 'income' | 'spin-offs' | 'successors' | 'rights' | 'exercises' | 'rights-journal' | 'capital-returns') {
    try {
      const rightsDemo = mode === 'rights' || mode === 'exercises' || mode === 'rights-journal'
      const exercises = mode === 'rights-journal' ? { csv: demoRightsJournal, name: 'synthetic-rights-journal.csv' }
        : mode === 'exercises' ? { csv: demoExercises, name: 'synthetic-rights-exercises.csv' } : undefined
      open({ holdings: rightsDemo || mode === 'capital-returns' ? demoRightsHoldings : demoHoldings, prices: demoPrices, terms: demoTerms,
        dividends: mode === 'income' ? demoDividends : '', spinOffs: mode === 'spin-offs' ? demoSpinOffs : '',
        cashTerms: mode === 'spin-offs' ? demoCashTerms : '', basisTerms: mode === 'spin-offs' ? demoBasisTerms : '',
        successors: mode === 'successors' ? demoSuccessors : '',
        rights: rightsDemo ? {
          csv: demoRights, reportsName: 'synthetic-subscription-rights.csv', holdingsName: 'synthetic-rights-holdings.csv',
          exercises,
        } : undefined,
        capitalReturns: mode === 'capital-returns' ? {
          csv: demoCapitalReturns, basis: demoCapitalBasis, reportsName: 'synthetic-capital-returns.csv',
          holdingsName: 'synthetic-rights-holdings.csv', basisName: 'synthetic-capital-return-basis.csv',
        } : undefined })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the portfolio demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!holdings || (needsPrices && !prices)) return
    setBusy(true)
    try {
      const [holdingCsv, priceCsv, termCsv, dividendCsv, spinOffCsv, cashTermsCsv, basisTermsCsv, successorCsv,
        rightsCsv, exerciseCsv, capitalReturnsCsv, capitalBasisCsv] = await Promise.all([
        readReport(holdings, 2), prices ? readReport(prices, 2) : '', terms ? readReport(terms, 1) : '',
        dividends ? readReport(dividends, 1) : '', spinOffs ? readReport(spinOffs, 1) : '',
        cashTerms ? readReport(cashTerms, 1) : '', basisTerms ? readReport(basisTerms, 1) : '',
        successors ? readReport(successors, 1) : '',
        rights ? readReport(rights, 1) : '',
        exercises ? readReport(exercises, 1) : '',
        capitalReturns ? readReport(capitalReturns, 1) : '',
        capitalBasis ? readReport(capitalBasis, 1) : '',
      ])
      if (prices && !priceCsv.trim()) throw new Error('Portfolio closes CSV contains no reports.')
      if (dividends && !dividendCsv.trim()) throw new Error('Portfolio dividends CSV contains no reports.')
      if (spinOffs && !spinOffCsv.trim()) throw new Error('Portfolio spin-off CSV contains no reports.')
      if (cashTerms && !cashTermsCsv.trim()) throw new Error('Spin-off cash terms CSV contains no reports.')
      if (cashTerms && !spinOffCsv) throw new Error('Supply spin-off reports with the cash terms.')
      if (basisTerms && !basisTermsCsv.trim()) throw new Error('Spin-off basis terms CSV contains no reports.')
      if (basisTerms && !spinOffCsv) throw new Error('Supply spin-off reports with the basis terms.')
      if (successors && !successorCsv.trim()) throw new Error('Successor share terms CSV contains no reports.')
      if (rights && !rightsCsv.trim()) throw new Error('Subscription rights CSV contains no reports.')
      if (exercises && !rightsCsv) throw new Error('Supply subscription rights with the exercise reports.')
      if (exercises && !exerciseCsv.trim()) throw new Error('Subscription exercises CSV contains no reports.')
      if (capitalReturns && !capitalReturnsCsv.trim()) throw new Error('Portfolio capital returns CSV contains no reports.')
      if (capitalBasis && !capitalReturnsCsv) throw new Error('Supply capital returns with the basis reports.')
      if (capitalBasis && !capitalBasisCsv.trim()) throw new Error('Capital return basis CSV contains no reports.')
      open({ holdings: holdingCsv, prices: priceCsv, terms: termCsv, dividends: dividendCsv,
        spinOffs: spinOffCsv, cashTerms: cashTermsCsv, basisTerms: basisTermsCsv, successors: successorCsv,
        rights: rights ? {
          csv: rightsCsv, reportsName: rights.name, holdingsName: holdings.name,
          exercises: exercises ? { csv: exerciseCsv, name: exercises.name } : undefined,
        } : undefined,
        capitalReturns: capitalReturns ? {
          csv: capitalReturnsCsv, basis: capitalBasisCsv, reportsName: capitalReturns.name,
          holdingsName: holdings.name, basisName: capitalBasis?.name,
        } : undefined })
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
          <button className="outline" onClick={() => startDemo('successors')} disabled={busy}>Load successor shares demo</button>
          <button className="outline" onClick={() => startDemo('rights')} disabled={busy}>Load subscription rights demo</button>
          <button className="outline" onClick={() => startDemo('exercises')} disabled={busy}>Load subscription exercise demo</button>
          <button className="outline" onClick={() => startDemo('rights-journal')} disabled={busy}>Load settlement journal demo</button>
          <button className="outline" onClick={() => startDemo('capital-returns')} disabled={busy}>Load capital return demo</button>
        </div>}
      </div>
      <form className="universe-query" onSubmit={load}>
        <label>Portfolio holdings CSV
          <input required type="file" accept=".csv,text/csv"
            onChange={event => setHoldings(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio closes CSV
          <input required={needsPrices} type="file" accept=".csv,text/csv"
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
        <label>Spin-off basis terms CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setBasisTerms(event.target.files?.[0] ?? null)} />
        </label>
        <label>Delisting successor shares CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setSuccessors(event.target.files?.[0] ?? null)} />
        </label>
        <label>Subscription rights CSV{exercises ? '' : ' (optional)'}
          <input required={!!exercises} type="file" accept=".csv,text/csv"
            onChange={event => setRights(event.target.files?.[0] ?? null)} />
        </label>
        <label>Subscription exercise reports CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setExercises(event.target.files?.[0] ?? null)} />
        </label>
        <label>Portfolio capital returns CSV{capitalBasis ? '' : ' (optional)'}
          <input required={!!capitalBasis} type="file" accept=".csv,text/csv"
            onChange={event => setCapitalReturns(event.target.files?.[0] ?? null)} />
        </label>
        <label>Capital return basis CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setCapitalBasis(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={busy || !holdings || (needsPrices && !prices)}>Load portfolio reports</button>
      </form>
      {error && <p role="alert" className="warning replay-error">{error}</p>}
      {snapshot && <PortfolioResult snapshot={snapshot} />}
      {rightOfferings && source?.rights && <PortfolioRights rows={rightOfferings} effective={effective} known={known}
        reportsSource={source.rights.reportsName} holdingsSource={source.rights.holdingsName} />}
      {exerciseReports && source?.rights?.exercises && <PortfolioRightsExercises rows={exerciseReports}
        effective={effective} known={known} exerciseSource={source.rights.exercises.name}
        rightsSource={source.rights.reportsName} holdingsSource={source.rights.holdingsName} />}
      {source?.rights?.exercises && <PortfolioRightsSettlementJournal calculate={calculateRightsJournal}
        effective={effective} known={known} exerciseSource={source.rights.exercises.name} rightsSource={source.rights.reportsName} />}
      {capitalDistributions && source?.capitalReturns && <PortfolioCapitalReturns rows={capitalDistributions}
        effective={effective} known={known} reportsSource={source.capitalReturns.reportsName}
        holdingsSource={source.capitalReturns.holdingsName} basisSource={source.capitalReturns.basisName} />}
      {source?.capitalReturns && <PortfolioCapitalReturnComparison core={core} membership={membership}
        holdings={source.holdings} source={source.capitalReturns} effective={effective} known={known} />}
      {successorClaims && <SuccessorShareClaims rows={successorClaims} />}
      {source?.successors && <SuccessorDeliveryLedger title="Successor delivery ledger" filename="successor-delivery-ledger.csv"
        calculate={calculateDeliveries} effective={effective} known={known} />}
      {distributions && <SpinOffEntitlements rows={distributions} />}
      {settlements && settlements.length > 0 && <SpinOffSettlements rows={settlements} />}
      {allocations && allocations.length > 0 && <SpinOffBasisAllocations rows={allocations} />}
    </section>
  )
}

function SuccessorShareClaims({ rows }: { rows: PortfolioSuccessorShare[] }) {
  if (!rows.length) return <p>No successor share claims at these cutoffs.</p>
  return <div className="replay-table-scroll">
    <table className="universe-table" aria-label="Portfolio delisting successor shares">
      <thead><tr><th scope="col">Delisting</th><th scope="col">Old listing</th><th scope="col">Successor listing</th>
        <th scope="col">Delisting (UTC)</th><th scope="col">Delisting observed (UTC)</th>
        <th scope="col">Old shares</th><th scope="col">Holding observed (UTC)</th>
        <th scope="col">Terms observed (UTC)</th><th scope="col">Delivery (UTC)</th>
        <th scope="col">Successor shares</th><th scope="col">State</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.delisting}>
        <th scope="row">{row.delisting}</th><td>{row.listing}</td><td>{row.terms?.listing ?? '—'}</td>
        <td>{utc(row.delistedAt)}</td><td>{utc(row.delistingObservedAt)}</td><td>{row.entitledShares ?? '—'}</td>
        <td>{row.positionObservedAt === null ? '—' : utc(row.positionObservedAt)}</td>
        <td>{row.terms ? utc(row.terms.observedAt) : '—'}</td>
        <td>{row.terms?.deliverAt == null ? '—' : utc(row.terms.deliverAt)}</td>
        <td>{shareText(row.successorShares)}</td><td>{successorShareStates[row.state]}</td>
      </tr>)}</tbody>
    </table>
  </div>
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

function SpinOffBasisAllocations({ rows }: { rows: PortfolioSpinOffBasis[] }) {
  return <div className="replay-table-scroll">
    <table className="universe-table" aria-label="Portfolio spin-off basis allocation">
      <thead><tr><th scope="col">Action</th><th scope="col">Parent listing</th><th scope="col">Child listing</th>
        <th scope="col">Distribution (UTC)</th><th scope="col">Terms observed (UTC)</th>
        <th scope="col">Original basis</th><th scope="col">Child allocation</th>
        <th scope="col">State</th><th scope="col">Retained parent basis</th><th scope="col">Child basis</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th scope="row">{row.id}</th><td>{row.parent}</td><td>{row.child}</td><td>{utc(row.distributionAt)}</td>
        <td>{row.terms ? utc(row.terms.observedAt) : '—'}</td>
        <td>{row.terms ? money(row.terms.originalParentBasis) + ' ' + row.terms.currency : '—'}</td>
        <td>{row.terms ? money(row.terms.childBasisFraction * 100n) + '%' : '—'}</td>
        <td>{spinOffBasisStates[row.state]}</td>
        <td>{row.allocation && row.terms ? money(row.allocation.retainedParentBasis) + ' ' + row.terms.currency : '—'}</td>
        <td>{row.allocation && row.terms ? money(row.allocation.childBasis) + ' ' + row.terms.currency : '—'}</td>
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
