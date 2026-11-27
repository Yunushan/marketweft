import { useState } from 'react'
import type { PortfolioRightsExercise } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

const stages: Record<PortfolioRightsExercise['stage'], string> = {
  requested: 'Requested', allocated: 'Allocated', settled: 'Settled', cancelled: 'Cancelled',
}
const assessments: Record<PortfolioRightsExercise['assessment'], string> = {
  unavailable: 'Basic capacity unavailable',
  'outside-window': 'Outside the known exercise window',
  'within-capacity': 'Within basic capacity',
  'above-capacity': 'Above basic capacity',
}
const amount = (value: bigint, currency: string) => fixed(value, 6) + ' ' + currency
const pageSize = 100

export function PortfolioRightsExercises({ rows, effective, known, exerciseSource, rightsSource, holdingsSource }: {
  rows: PortfolioRightsExercise[]; effective: string; known: string
  exerciseSource: string; rightsSource: string; holdingsSource: string
}) {
  const [page, setPage] = useState(0)
  if (!rows.length) return <p>No subscription exercises reported at these cutoffs.</p>
  const last = Math.ceil(rows.length / pageSize) - 1
  const current = Math.min(last, page)

  function download() {
    const header = 'exercise_source,rights_source,holdings_source,effective_through_utc,known_through_utc,exercise,offering,status,requested_utc,effective_utc,observed_utc,requested_shares,request_assessment,basic_capacity,allocated_shares,currency,unit_price,settled_shares,cash_paid,cash_variance'
    const prefix = [quoteText(exerciseSource), quoteText(rightsSource), quoteText(holdingsSource), effective, known]
    const csvRows = rows.map(row => {
      const { allocation, settlement } = row
      return [
        ...prefix, quoteText(row.exerciseId), quoteText(row.offeringId), row.stage,
        utc(row.requestedAt), utc(row.effectiveAt), utc(row.observedAt),
        row.requestedShares, row.assessment, row.basicCapacity ?? '',
        allocation?.shares ?? '', allocation?.currency ?? '', allocation ? fixed(allocation.unitPrice, 6) : '',
        settlement?.shares ?? '', settlement ? fixed(settlement.cashPaid, 6) : '',
        settlement ? fixed(settlement.cashVariance, 6) : '',
      ].join(',')
    })
    const csv = [header, ...csvRows].join('\r\n') + '\r\n'
    downloadFile('portfolio-rights-exercises.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable subscription exercises">
      <table className="universe-table" aria-label="Portfolio subscription exercises">
        <thead><tr>{['Exercise', 'Offering', 'Status', 'Requested UTC', 'Effective UTC', 'Observed UTC',
          'Requested shares', 'Request assessment', 'Basic capacity', 'Allocated shares', 'Unit price',
          'Settled shares', 'Cash paid', 'Cash variance'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(row => {
          const { allocation, settlement } = row
          return <tr key={row.exerciseId}>
            <th scope="row">{row.exerciseId}</th><td>{row.offeringId}</td><td>{stages[row.stage]}</td>
            <td>{utc(row.requestedAt)}</td><td>{utc(row.effectiveAt)}</td><td>{utc(row.observedAt)}</td>
            <td>{row.requestedShares.toString()}</td><td>{assessments[row.assessment]}</td>
            <td>{row.basicCapacity?.toString() ?? '—'}</td><td>{allocation?.shares.toString() ?? '—'}</td>
            <td>{allocation ? amount(allocation.unitPrice, allocation.currency) : '—'}</td>
            <td>{settlement?.shares.toString() ?? '—'}</td>
            <td>{settlement && allocation ? amount(settlement.cashPaid, allocation.currency) : '—'}</td>
            <td>{settlement && allocation ? amount(settlement.cashVariance, allocation.currency) : '—'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    {last > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous exercises</button>
      <p>{current + 1} / {last + 1}</p>
      <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next exercises</button>
    </div>}
    <button type="button" className="outline" onClick={download}>Download subscription exercises</button>
  </>
}
