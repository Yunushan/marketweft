import { useMemo, useState } from 'react'
import type { RightsSettlementPosting } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

const pageSize = 100
const amount = (value: bigint, asset: RightsSettlementPosting['asset']) =>
  asset.kind === 'shares' ? value.toString() : fixed(value, 6)

export function PortfolioRightsSettlementJournal({ calculate, effective, known, exerciseSource, rightsSource }: {
  calculate: () => RightsSettlementPosting[]; effective: string; known: string; exerciseSource: string; rightsSource: string
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const rows = useMemo(() => open ? calculate() : [], [open, calculate])
  const last = Math.ceil(rows.length / pageSize) - 1
  const current = Math.max(0, Math.min(last, page))

  function download() {
    const header = 'exercise_source,rights_source,effective_through_utc,known_through_utc,exercise,offering,effective_utc,observed_utc,status,asset,currency,change,balance'
    const prefix = [quoteText(exerciseSource), quoteText(rightsSource), effective, known]
    const values = rows.map(row => [
      ...prefix, quoteText(row.exerciseId), quoteText(row.offeringId), utc(row.effectiveAt), utc(row.observedAt), row.stage,
      row.asset.kind, row.asset.kind === 'cash' ? row.asset.currency : '', amount(row.delta, row.asset), amount(row.balance, row.asset),
    ].join(','))
    const csv = [header, ...values].join('\r\n') + '\r\n'
    downloadFile('subscription-settlement-journal.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Subscription settlement journal</summary>
    {open && (rows.length === 0 ? <p>No settlement changes at these cutoffs.</p> : <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable subscription settlement journal">
        <table className="universe-table" aria-label="Subscription settlement journal">
          <thead><tr>{['Exercise', 'Offering', 'Effective UTC', 'Observed UTC', 'Status', 'Asset', 'Change', 'Balance']
            .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(row => (
            <tr key={[row.exerciseId, row.observedAt, row.asset.kind, row.asset.kind === 'cash' ? row.asset.currency : ''].join('/')}>
              <th scope="row">{row.exerciseId}</th><td>{row.offeringId}</td><td>{utc(row.effectiveAt)}</td><td>{utc(row.observedAt)}</td>
              <td>{row.stage[0].toUpperCase() + row.stage.slice(1)}</td>
              <td>{row.asset.kind === 'shares' ? 'Shares' : row.asset.currency}</td>
              <td>{amount(row.delta, row.asset)}</td><td>{amount(row.balance, row.asset)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {last > 0 && <div className="universe-query">
        <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous postings</button>
        <p>{current + 1} / {last + 1}</p>
        <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next postings</button>
      </div>}
      <button type="button" className="outline" onClick={download}>Download settlement journal</button>
    </>)}
  </details>
}
