import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CapitalReturnAmounts, CapitalReturnComparison, CapitalReturnCutoff, CapitalReturnObservation, MarketCore } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

type Source = { csv: string; basis: string; reportsName: string; holdingsName: string; basisName?: string }
type Cutoffs = { baseline: CapitalReturnCutoff; comparison: CapitalReturnCutoff }

const states: Record<CapitalReturnObservation['state'], string> = {
  'unknown-position': 'Holding unavailable', 'no-payment': 'No distribution', receivable: 'Receivable', paid: 'Paid',
}
const columns = [
  ['receivable', 'Receivable change', 'receivable'],
  ['cash', 'Cash change', 'cash'],
  ['basisReduction', 'Basis reduction change', 'basis_reduction'],
  ['aboveBasis', 'Cash above basis change', 'cash_above_basis'],
] as const
const pageSize = 100

function evidence(observation: CapitalReturnObservation | null) {
  if (!observation) return ['', '', '', '']
  return [
    observation.state, observation.currency, utc(observation.observedAt),
    observation.basisObservedAt === null ? '' : utc(observation.basisObservedAt),
  ]
}

function csvAmounts(amounts: CapitalReturnAmounts) {
  return columns.map(([key]) => {
    const value = amounts[key]
    return value === null ? '' : fixed(value, 6)
  })
}

function displayEvidence(row: CapitalReturnObservation | null) {
  if (!row) return 'No known report'
  return <>{states[row.state]} · {row.currency}<br />{utc(row.observedAt)}
    {row.basisObservedAt !== null && <><br />Basis {utc(row.basisObservedAt)}</>}</>
}

function signed(value: bigint | null) {
  if (value === null) return 'Unavailable'
  return (value > 0n ? '+' : '') + fixed(value, 6)
}

export function PortfolioCapitalReturnComparison({ core, membership, holdings, source, effective, known }: {
  core: MarketCore; membership: string; holdings: string; source: Source; effective: string; known: string
}) {
  const replayCutoff = { effectiveAt: effective, knownAt: known }
  const [draft, setDraft] = useState<Cutoffs>(() => ({ baseline: replayCutoff, comparison: replayCutoff }))
  const [result, setResult] = useState<{
    cutoffs: Cutoffs; rows: CapitalReturnComparison[]; membership: string; holdings: string; source: Source
  } | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const report = result?.source === source && result.membership === membership && result.holdings === holdings ? result : null
  const last = Math.max(0, Math.ceil((report?.rows.length ?? 0) / pageSize) - 1)
  const current = Math.min(page, last)

  function compare(event: FormEvent) {
    event.preventDefault()
    const trim = ({ effectiveAt, knownAt }: CapitalReturnCutoff) => ({ effectiveAt: effectiveAt.trim(), knownAt: knownAt.trim() })
    const cutoffs = { baseline: trim(draft.baseline), comparison: trim(draft.comparison) }
    try {
      const rows = core.comparePortfolioCapitalReturns(membership, holdings, source.csv, source.basis, cutoffs.baseline, cutoffs.comparison)
      setResult({ cutoffs, rows, membership, holdings, source })
      setPage(0)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare capital returns.')
    }
  }

  function download() {
    if (!report) return
    const { baseline, comparison } = report.cutoffs
    const prefix = [
      quoteText(source.reportsName), quoteText(source.holdingsName), source.basisName ? quoteText(source.basisName) : '',
      baseline.effectiveAt, baseline.knownAt, comparison.effectiveAt, comparison.knownAt,
    ]
    const header = [
      'capital_returns_source', 'holdings_source', 'basis_source', 'baseline_effective_utc', 'baseline_known_utc',
      'comparison_effective_utc', 'comparison_known_utc', 'action', 'listing', 'currency',
      ...['baseline', 'comparison'].flatMap(side => ['status', 'report_currency', 'observed_utc', 'basis_observed_utc'].map(key => side + '_' + key)),
      ...['baseline', 'comparison', 'change'].flatMap(side => columns.map(([, , key]) => side + '_' + key)),
    ].join(',')
    const rows = report.rows.map(row => [
      ...prefix, quoteText(row.actionId), quoteText(row.listingId), row.currency,
      ...evidence(row.baseline), ...evidence(row.comparison), ...csvAmounts(row.baselineAmounts),
      ...csvAmounts(row.comparisonAmounts), ...csvAmounts(row.change),
    ].join(','))
    downloadFile('portfolio-capital-return-comparison.csv', new Blob([
      [header, ...rows].join('\r\n') + '\r\n',
    ], { type: 'text/csv;charset=utf-8' }))
  }

  return <details className="research-details rank-comparison">
    <summary>Compare capital returns at two cutoffs</summary>
    <form className="universe-query" aria-label="Capital return comparison cutoffs" onSubmit={compare}>
      {(['baseline', 'comparison'] as const).map(side => {
        const label = side === 'baseline' ? 'Baseline' : 'Comparison'
        return <fieldset key={side}>
          <legend>{label}</legend>
          {([['effectiveAt', 'effective'], ['knownAt', 'known']] as const).map(([key, time]) => <label key={key}>
            {label} {time} (UTC)
            <input required value={draft[side][key]} spellCheck={false} autoComplete="off"
              onChange={event => setDraft({ ...draft, [side]: { ...draft[side], [key]: event.target.value } })} />
          </label>)}
          <button type="button" className="outline" onClick={() => setDraft({ ...draft, [side]: replayCutoff })}>
            Use replay cutoffs as {side}
          </button>
        </fieldset>
      })}
      <button className="outline">Compare capital returns</button>
    </form>
    {error && <p role="alert" className="warning">{error}</p>}
    {result && !report && <p role="status">The source reports changed. Run the comparison again.</p>}
    {report && <>
      <p>Baseline {report.cutoffs.baseline.effectiveAt} · Known {report.cutoffs.baseline.knownAt}</p>
      <p>Comparison {report.cutoffs.comparison.effectiveAt} · Known {report.cutoffs.comparison.knownAt}</p>
      {!report.rows.length ? <p role="status">No capital returns at either cutoff.</p> :
        <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable capital return comparison">
          <table aria-label="Capital return comparison" className="universe-table">
            <thead><tr>
              {['Action', 'Listing', 'Currency', 'Baseline report', 'Comparison report', ...columns.map(([, label]) => label)].map(label =>
                <th scope="col" key={label}>{label}</th>)}
            </tr></thead>
            <tbody>{report.rows.slice(current * pageSize, (current + 1) * pageSize).map(row => <tr key={row.listingId + '/' + row.actionId + '/' + row.currency}>
              <th scope="row">{row.actionId}</th><td>{row.listingId}</td><td>{row.currency}</td>
              <td>{displayEvidence(row.baseline)}</td><td>{displayEvidence(row.comparison)}</td>
              {columns.map(([key]) => <td key={key}>{signed(row.change[key])}</td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      {last > 0 && <div className="universe-query">
        <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous changes</button>
        <p>{current + 1} / {last + 1}</p>
        <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next changes</button>
      </div>}
      <button type="button" className="outline" onClick={download}>Download capital return comparison</button>
    </>}
  </details>
}
