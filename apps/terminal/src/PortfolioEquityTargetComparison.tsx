import { useMemo, useState } from 'react'
import type { EquityTargetChange, EquityTargetEvidence, MarketCore, PortfolioCutoff } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

const PAGE_SIZE = 100
const SIDE_COLUMNS = ['equity_state', 'actual_weight_micros', 'target_state', 'target_weight_micros',
  'target_effective_utc', 'target_observed_utc', 'drift_micros']
const points = (value: bigint | null) => value === null ? '—' : fixed(value, 6)

function exportSide(side: EquityTargetEvidence | null) {
  if (!side) return ['absent', '', '', '', '', '', '']
  const equityState = side.actualWeightMicros !== null ? 'weight-known' : side.inEquity ? 'weight-unavailable' : 'outside-equity'
  const targetState = side.target === null ? 'no-target' : side.target.weightMicros === null ? 'withdrawn' : 'reported'
  return [equityState, side.actualWeightMicros, targetState, side.target?.weightMicros,
    side.target ? utc(side.target.effectiveAt) : '', side.target ? utc(side.target.observedAt) : '', side.driftMicros]
}

function downloadComparison(rows: EquityTargetChange[], baseline: PortfolioCutoff, current: PortfolioCutoff) {
  const header = ['baseline_effective_utc', 'baseline_known_utc', 'current_effective_utc', 'current_known_utc',
    'listing_id', 'quote_currency', ...SIDE_COLUMNS.map(field => 'baseline_' + field),
    ...SIDE_COLUMNS.map(field => 'current_' + field), 'drift_change_micros'].join(',')
  const lines = rows.map(row => [baseline.effectiveAt, baseline.knownAt, current.effectiveAt, current.knownAt,
    quoteText(row.listing), row.currency, ...exportSide(row.before), ...exportSide(row.after), row.driftChangeMicros].join(','))
  downloadFile('portfolio-equity-target-comparison.csv',
    new Blob([[header, ...lines].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
}

function sideText(side: EquityTargetEvidence | null) {
  if (!side) return 'Absent'
  const actual = side.actualWeightMicros !== null ? points(side.actualWeightMicros) + '%' :
    side.inEquity ? 'Weight unavailable' : 'Outside equity'
  const target = side.target === null ? 'No target' : side.target.weightMicros === null ? 'Withdrawn' :
    points(side.target.weightMicros) + '%'
  return actual + ' · ' + target + ' · ' + points(side.driftMicros)
}

export function PortfolioEquityTargetComparison({ core, membership, source, active, effective, known, canCompare }: {
  core: MarketCore; membership: string; source: { holdings: string; prices: string; terms: string }
  active: { csv: string }; effective: string; known: string; canCompare: boolean
}) {
  const [saved, setSaved] = useState<{ active: { csv: string }; cutoff: PortfolioCutoff } | null>(null)
  const [page, setPage] = useState(0)
  const baseline = saved?.active === active ? saved.cutoff : null
  const current = useMemo(() => ({ effectiveAt: effective, knownAt: known }), [effective, known])
  const comparison = useMemo(() => {
    if (!baseline || !canCompare) return null
    try {
      return { rows: core.compareEquityTargets(membership, source.holdings, source.prices, source.terms,
        active.csv, baseline, current) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not compare equity targets.' }
    }
  }, [core, membership, source, active, baseline, current, canCompare])
  const rows = comparison?.rows
  const lastPage = Math.max(0, Math.ceil((rows?.length ?? 0) / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  return <>
    <div className="replay-controls">
      <button type="button" className="outline" disabled={!canCompare} onClick={() => {
        setSaved({ active, cutoff: current })
        setPage(0)
      }}>{baseline ? 'Replace target baseline' : 'Pin target baseline'}</button>
      {baseline && <button type="button" className="outline" onClick={() => setSaved(null)}>Clear target baseline</button>}
      {rows?.length && baseline ? <button type="button" className="outline"
        onClick={() => downloadComparison(rows, baseline, current)}>Download target comparison</button> : null}
    </div>
    {baseline && <p>Target baseline effective {baseline.effectiveAt} · Known {baseline.knownAt}</p>}
    {comparison?.error && <p className="warning replay-error" role="alert">{comparison.error}</p>}
    {rows && (rows.length === 0 ? <p>No equity or target reports at either cutoff.</p> :
      <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Equity target comparison">
          <thead><tr><th scope="col">Listing</th><th scope="col">Currency</th>
            <th scope="col">Baseline weight, target and drift</th><th scope="col">Current weight, target and drift</th>
            <th scope="col">Drift change (pp)</th></tr></thead>
          <tbody>{rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row =>
            <tr key={JSON.stringify([row.currency, row.listing])}>
              <th scope="row">{row.listing}</th><td>{row.currency ?? 'Unavailable'}</td>
              <td>{sideText(row.before)}</td><td>{sideText(row.after)}</td><td>{points(row.driftChangeMicros)}</td>
            </tr>)}</tbody>
        </table>
        {lastPage > 0 && <div className="replay-controls">
          <button type="button" className="outline" disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}>Previous comparison rows</button>
          <span>Page {currentPage + 1} of {lastPage + 1}</span>
          <button type="button" className="outline" disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}>Next comparison rows</button>
        </div>}
      </div>)}
  </>
}
