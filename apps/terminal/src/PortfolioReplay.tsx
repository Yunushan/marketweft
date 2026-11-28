import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { EquityConcentration, EquityConcentrationChange, FxAmount, MarketCore, PortfolioCutoff, PortfolioSnapshot, PortfolioSpinOff, PortfolioSpinOffBasis, PortfolioSpinOffCash, PortfolioSuccessorShare } from './market-core'
import { SuccessorDeliveryLedger, shareText } from './SuccessorDeliveryLedger'
import { PortfolioRights } from './PortfolioRights'
import { PortfolioRightsExercises } from './PortfolioRightsExercises'
import { PortfolioRightsSettlementJournal } from './PortfolioRightsSettlementJournal'
import { PortfolioCapitalReturns } from './PortfolioCapitalReturns'
import { PortfolioCapitalReturnComparison } from './PortfolioCapitalReturnComparison'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
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
import demoFxRates from '../../../crates/core/tests/fixtures/synthetic-portfolio-fx.csv?raw'
import demoEquityTargets from '../../../crates/core/tests/fixtures/synthetic-equity-targets.csv?raw'

type Source = {
  holdings: string; prices: string; terms: string; dividends: string; spinOffs: string
  cashTerms: string; basisTerms: string; successors: string
  fx?: string
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

type ConcentrationSources = Pick<Source, 'holdings' | 'prices' | 'terms'>

function concentrationSide(side: EquityConcentrationChange['before']): string {
  if (!side) return 'Outside equity'
  if (side.mark === null) return 'Mark unavailable'
  if (side.weightMicros === null) return money(side.mark) + ' · Weight unavailable'
  return money(side.mark) + ' · ' + money(side.weightMicros) + '% · Rank ' + side.rank
}

function downloadEquityComparison(rows: EquityConcentrationChange[], baseline: PortfolioCutoff, current: PortfolioCutoff) {
  const header = [
    'baseline_effective_utc', 'baseline_known_utc', 'current_effective_utc', 'current_known_utc', 'listing_id', 'quote_currency',
    'baseline_state', 'baseline_mark_ticks', 'baseline_weight_micros', 'baseline_rank',
    'current_state', 'current_mark_ticks', 'current_weight_micros', 'current_rank',
    'weight_change_micros', 'rank_improvement',
  ].join(',')
  const fields = (side: EquityConcentrationChange['before']) => {
    if (!side) return ['outside-equity', '', '', '']
    return [side.mark === null ? 'mark-unavailable' : 'marked', side.mark, side.weightMicros, side.rank]
  }
  const lines = rows.map(row => [
    baseline.effectiveAt, baseline.knownAt, current.effectiveAt, current.knownAt, quoteText(row.listing), row.currency,
    ...fields(row.before), ...fields(row.after), row.weightChangeMicros, row.rankImprovement,
  ].join(','))
  downloadFile('portfolio-equity-concentration-comparison.csv', new Blob([[header, ...lines].join('\r\n') + '\r\n'],
    { type: 'text/csv;charset=utf-8' }))
}

function EquityConcentrationValues({ groups, core, source, membership, effective, known }: {
  groups: EquityConcentration[]; core: MarketCore; source: ConcentrationSources; membership: string
  effective: string; known: string
}) {
  const [saved, saveBaseline] = useState<{ source: ConcentrationSources; membership: string; cutoff: PortfolioCutoff } | null>(null)
  const baseline = saved?.source === source && saved.membership === membership ? saved.cutoff : null
  const comparison = useMemo(() => {
    if (!baseline) return null
    try {
      const current = { effectiveAt: effective, knownAt: known }
      const rows = core.compareEquityConcentration(membership, source.holdings, source.prices, source.terms,
        baseline, current)
      return { rows, baseline, current }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The equity concentration comparison failed.' }
    }
  }, [core, membership, source, baseline, effective, known])
  return <details className="research-details">
    <summary>Equity concentration</summary>
    <section aria-label="Portfolio equity concentration">
      {groups.map(({ currency, grossMark, positions }) => {
        const label = currency ?? 'Currency unavailable'
        const missing = positions.filter(row => row.mark === null).length
        return <div key={label} className="replay-table-scroll">
          <p>{label} · Known gross {grossMark === null ? '—' : money(grossMark)} · {missing} without a close</p>
          <table className="universe-table" aria-label={label + ' equity weights'}>
            <thead><tr><th scope="col">Listing</th><th scope="col">Signed share value</th>
              <th scope="col">Rank</th><th scope="col">Weight of known gross</th></tr></thead>
            <tbody>{positions.map(row => <tr key={row.listing}>
              <th scope="row">{row.listing}</th><td>{row.mark === null ? '—' : money(row.mark)}</td>
              <td>{row.rank ?? '—'}</td><td>{row.weightMicros === null ? '—' : money(row.weightMicros) + '%'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      })}
      <div className="replay-controls">
        <button className="outline" type="button"
          onClick={() => saveBaseline({ source, membership, cutoff: { effectiveAt: effective, knownAt: known } })}>
          {baseline ? 'Replace equity baseline' : 'Pin equity baseline'}
        </button>
        {baseline && <button className="outline" type="button" onClick={() => saveBaseline(null)}>Clear equity baseline</button>}
        {comparison?.rows?.length ? <button className="outline" type="button"
          onClick={() => downloadEquityComparison(comparison.rows, comparison.baseline, comparison.current)}>
          Download equity comparison
        </button> : null}
      </div>
      {baseline && <p>Baseline effective {baseline.effectiveAt} · Known {baseline.knownAt}</p>}
      {comparison?.error && <p role="alert" className="warning replay-error">{comparison.error}</p>}
      {comparison?.rows && (comparison.rows.length === 0
        ? <p>No equity holdings at either cutoff.</p>
        : <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Equity concentration comparison">
            <thead><tr><th scope="col">Listing</th><th scope="col">Currency</th>
              <th scope="col">Baseline value, weight and rank</th><th scope="col">Current value, weight and rank</th>
              <th scope="col">Weight change (pp)</th><th scope="col">Rank improvement</th></tr></thead>
            <tbody>{comparison.rows.map(row => <tr key={JSON.stringify([row.listing, row.currency])}>
              <th scope="row">{row.listing}</th><td>{row.currency ?? 'Unavailable'}</td>
              <td>{concentrationSide(row.before)}</td><td>{concentrationSide(row.after)}</td>
              <td>{row.weightChangeMicros === null ? '—' : money(row.weightChangeMicros)}</td>
              <td>{row.rankImprovement ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>)}
    </section>
  </details>
}

async function readReport(file: File, max: number) {
  if (file.size > max * 1024 * 1024) throw new Error(file.name + ' exceeds ' + max + ' MiB.')
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
}

function EquityTargets({ core, source, membership, demo, effective, known }: {
  core: MarketCore; source: ConcentrationSources; membership: string; demo: boolean; effective: string; known: string
}) {
  const [reports, setReports] = useState<{ csv: string; name: string; source: ConcentrationSources; membership: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = reports?.source === source && reports.membership === membership ? reports : null
  const evaluate = useCallback((csv: string) => core.equityTargetDriftAsOf(
    membership, source.holdings, source.prices, source.terms, csv, effective, known,
  ), [core, source, membership, effective, known])
  const result = useMemo(() => {
    if (!active) return null
    try {
      return { rows: evaluate(active.csv) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not evaluate equity targets.' }
    }
  }, [evaluate, active])
  const pageSize = 100
  const last = Math.max(0, Math.ceil((result?.rows?.length ?? 0) / pageSize) - 1)
  const current = Math.min(page, last)

  function apply(csv: string, name: string) {
    evaluate(csv)
    setReports({ csv, name, source, membership })
    setPage(0)
    setError('')
  }
  async function upload(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      if (file) apply(await readReport(file, 2), file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read equity targets.')
    } finally {
      setBusy(false)
    }
  }
  function openDemo() {
    try {
      apply(demoEquityTargets, 'synthetic-equity-targets.csv')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the equity targets demo.')
    }
  }
  function clear() {
    setReports(null)
    setError('')
  }
  return <details className="research-details">
    <summary>Equity allocation targets</summary>
    <section aria-label="Equity allocation targets">
      <form onSubmit={upload} className="replay-controls">
        <label>Equity targets CSV
          <input type="file" accept=".csv,text/csv" disabled={busy}
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={!file || busy}>Load equity targets</button>
        {demo && <button type="button" className="outline" disabled={busy} onClick={openDemo}>Load equity targets demo</button>}
        {active && <button type="button" className="outline" disabled={busy} onClick={clear}>Clear equity targets</button>}
      </form>
      {active && <p role="status">Loaded {active.name}</p>}
      {error && <p className="warning replay-error" role="alert">{error}</p>}
      {result?.error && <p className="warning replay-error" role="alert">{result.error}</p>}
      {result?.rows && (result.rows.length === 0 ? <p>No equity or target reports at this cutoff.</p> :
        <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Equity target drift">
            <thead><tr><th scope="col">Listing</th><th scope="col">Currency</th><th scope="col">Weight of known gross</th>
              <th scope="col">Target</th><th scope="col">Drift (pp)</th><th scope="col">Target effective UTC</th>
              <th scope="col">Target observed UTC</th></tr></thead>
            <tbody>{result.rows.slice(current * pageSize, (current + 1) * pageSize).map(row =>
              <tr key={JSON.stringify([row.currency, row.listing])}>
                <th scope="row">{row.listing}</th><td>{row.currency ?? 'Unavailable'}</td>
                <td>{row.actualWeightMicros === null ? (row.inEquity ? 'Weight unavailable' : 'Outside equity') : money(row.actualWeightMicros) + '%'}</td>
                <td>{row.target === null ? 'No target' : row.target.weightMicros === null ? 'Withdrawn' : money(row.target.weightMicros) + '%'}</td>
                <td>{row.driftMicros === null ? '—' : money(row.driftMicros)}</td>
                <td>{row.target ? utc(row.target.effectiveAt) : '—'}</td>
                <td>{row.target ? utc(row.target.observedAt) : '—'}</td>
              </tr>)}</tbody>
          </table>
          {last > 0 && <div className="replay-controls">
            <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous targets</button>
            <span>Page {current + 1} of {last + 1}</span>
            <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next targets</button>
          </div>}
        </div>)}
    </section>
  </details>
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
  const [fxFile, setFxFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsPrices = !(rights || exercises || capitalReturns || capitalBasis) || !!(terms || dividends || spinOffs || cashTerms || basisTerms || successors || fxFile)
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
    if (source.fx) core.portfolioFxAsOf(source.fx, 'USD', effective, known, [])
    setSource(source)
    setError('')
  }

  function startDemo(mode?: 'income' | 'spin-offs' | 'successors' | 'rights' | 'exercises' | 'rights-journal' | 'capital-returns' | 'fx') {
    try {
      const rightsDemo = mode === 'rights' || mode === 'exercises' || mode === 'rights-journal'
      const exercises = mode === 'rights-journal' ? { csv: demoRightsJournal, name: 'synthetic-rights-journal.csv' }
        : mode === 'exercises' ? { csv: demoExercises, name: 'synthetic-rights-exercises.csv' } : undefined
      open({ holdings: rightsDemo || mode === 'capital-returns' ? demoRightsHoldings : demoHoldings, prices: demoPrices, terms: demoTerms,
        dividends: mode === 'income' ? demoDividends : '', spinOffs: mode === 'spin-offs' ? demoSpinOffs : '',
        cashTerms: mode === 'spin-offs' ? demoCashTerms : '', basisTerms: mode === 'spin-offs' ? demoBasisTerms : '',
        successors: mode === 'successors' ? demoSuccessors : '',
        fx: mode === 'fx' ? demoFxRates : undefined,
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
        rightsCsv, exerciseCsv, capitalReturnsCsv, capitalBasisCsv, fxCsv] = await Promise.all([
        readReport(holdings, 2), prices ? readReport(prices, 2) : '', terms ? readReport(terms, 1) : '',
        dividends ? readReport(dividends, 1) : '', spinOffs ? readReport(spinOffs, 1) : '',
        cashTerms ? readReport(cashTerms, 1) : '', basisTerms ? readReport(basisTerms, 1) : '',
        successors ? readReport(successors, 1) : '',
        rights ? readReport(rights, 1) : '',
        exercises ? readReport(exercises, 1) : '',
        capitalReturns ? readReport(capitalReturns, 1) : '',
        capitalBasis ? readReport(capitalBasis, 1) : '',
        fxFile ? readReport(fxFile, 1) : '',
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
      if (fxFile && !fxCsv.trim()) throw new Error('Portfolio FX rates CSV contains no reports.')
      open({ holdings: holdingCsv, prices: priceCsv, terms: termCsv, dividends: dividendCsv,
        spinOffs: spinOffCsv, cashTerms: cashTermsCsv, basisTerms: basisTermsCsv, successors: successorCsv,
        fx: fxCsv || undefined,
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
          <button className="outline" onClick={() => startDemo('fx')} disabled={busy}>Load portfolio FX demo</button>
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
        <label>Portfolio FX rates CSV (optional)
          <input type="file" accept=".csv,text/csv"
            onChange={event => setFxFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={busy || !holdings || (needsPrices && !prices)}>Load portfolio reports</button>
      </form>
      {error && <p role="alert" className="warning replay-error">{error}</p>}
      {snapshot && source && <PortfolioResult snapshot={snapshot} core={core} source={source}
        membership={membership} demo={demo} effective={effective} known={known} />}
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

function PortfolioFxValues({ core, reports, effective, known, amounts }: {
  core: MarketCore; reports: string; effective: string; known: string; amounts: FxAmount[]
}) {
  const [currency, setCurrency] = useState('USD')
  const [reporting, setReporting] = useState('USD')
  const result = useMemo(() => {
    try {
      return { report: core.portfolioFxAsOf(reports, reporting, effective, known, amounts) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not translate portfolio subtotals.' }
    }
  }, [core, reports, reporting, effective, known, amounts])
  const report = result.report
  return <details className="research-details">
    <summary>Portfolio currency translation</summary>
    <section aria-label="Portfolio currency translation">
      <form className="universe-query" onSubmit={event => { event.preventDefault(); setReporting(currency) }}>
        <label>Reporting currency
          <input required pattern="[A-Z]{3}" maxLength={3} value={currency}
            onChange={event => setCurrency(event.target.value.toUpperCase())} />
        </label>
        <button className="outline" type="submit">Apply reporting currency</button>
      </form>
      {result.error && <p className="warning" role="alert">{result.error}</p>}
      {report && <>
        <p role="status">Known converted subtotal · {report.knownSubtotal === null ? 'Unavailable' : money(report.knownSubtotal) + ' ' + report.reportingCurrency}</p>
        <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Portfolio FX subtotals">
            <thead><tr><th scope="col">Source currency</th><th scope="col">Known subtotal</th>
              <th scope="col">Rate evidence</th><th scope="col">Conversion</th>
              <th scope="col">Rate (UTC)</th><th scope="col">Observed (UTC)</th>
              <th scope="col">Converted subtotal ({report.reportingCurrency})</th></tr></thead>
            <tbody>{report.rows.map(row => <tr key={row.currency}>
              <th scope="row">{row.currency}</th><td>{money(row.subtotal)}</td>
              <td>{row.rate ? money(row.rate.rateTicks) + ' ' + row.rate.quoteCurrency + '/' + row.rate.baseCurrency : '—'}</td>
              <td>{row.rate ? (row.rate.inverted ? 'Inverse' : 'Direct') : (row.converted === null ? 'FX unavailable' : 'Identity')}</td>
              <td>{row.rate ? utc(row.rate.rateAt) : '—'}</td><td>{row.rate ? utc(row.rate.observedAt) : '—'}</td>
              <td>{row.converted === null ? '—' : money(row.converted)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </section>
  </details>
}

function PortfolioResult({ snapshot, core, source, membership, demo, effective, known }: {
  snapshot: PortfolioSnapshot; core: MarketCore; source: Source; membership: string; demo: boolean; effective: string; known: string
}) {
  const count = snapshot.holdings.length
  const currencies = useMemo(() => {
    const base = new Map(snapshot.totals.map(row => [row.currency, row]))
    const incomeTotals = new Map(snapshot.income?.totals.map(row => [row.currency, row]))
    return [...new Set([...base.keys(), ...incomeTotals.keys()])].sort().map(currency => {
      const row = base.get(currency)
      const income = incomeTotals.get(currency)
      const shares = row?.sharesValue ?? 0n
      const delistingReceivable = row?.receivable ?? 0n
      const delistingCash = row?.cash ?? 0n
      const dividendReceivable = income?.receivable ?? 0n
      const dividendCash = income?.cash ?? 0n
      return { currency, shares, delistingReceivable, delistingCash, dividendReceivable, dividendCash,
        subtotal: shares + delistingReceivable + delistingCash + dividendReceivable + dividendCash }
    })
  }, [snapshot])
  return (
    <>
      <p role="status">{count} {count === 1 ? 'holding' : 'holdings'} · {snapshot.unvaluedPositions} without a value</p>
      {currencies.length > 0 && <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio currency subtotals">
          <thead><tr><th scope="col">Currency</th><th scope="col">Share value</th>
            <th scope="col">Delisting receivable</th><th scope="col">Delisting cash</th>
            {snapshot.income && <><th scope="col">Dividend receivable</th><th scope="col">Dividend cash</th></>}
            <th scope="col">Known subtotal</th></tr></thead>
          <tbody>{currencies.map(({ currency, shares, delistingReceivable, delistingCash, dividendReceivable, dividendCash, subtotal }) =>
            <tr key={currency}>
              <th scope="row">{currency}</th><td>{money(shares)}</td>
              <td>{money(delistingReceivable)}</td><td>{money(delistingCash)}</td>
              {snapshot.income && <><td>{money(dividendReceivable)}</td><td>{money(dividendCash)}</td></>}
              <td>{money(subtotal)}</td>
            </tr>
          )}</tbody>
        </table>
      </div>}
      {source.fx && <PortfolioFxValues core={core} reports={source.fx} effective={effective} known={known} amounts={currencies} />}
      <EquityConcentrationValues groups={snapshot.equityConcentration} core={core} source={source}
        membership={membership} effective={effective} known={known} />
      <EquityTargets core={core} source={source} membership={membership} demo={demo} effective={effective} known={known} />
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
