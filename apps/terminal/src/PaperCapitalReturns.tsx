import { useState } from 'react'
import type { CrossSectionReport } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

const columns = [
  ['row', 'Type'], ['listing', 'Listing'], ['action_id', 'Action'], ['ex_utc', 'Ex UTC'],
  ['pay_utc', 'Pay UTC'], ['observed_utc', 'Report UTC'], ['posted_utc', 'Posted UTC'],
  ['entitled_shares', 'Entitled shares'], ['currency', 'Currency'], ['state', 'State'],
  ['amount', 'Claim'], ['cash_change', 'Cash change'],
  ['position_receipt_id', 'Position receipt'], ['cash_receipt_id', 'Cash receipt'],
]

const pageSize = 100
const numericColumns = new Set(['entitled_shares', 'amount', 'cash_change'])

export function PaperCapitalReturns({ report, provenance }: {
  report: CrossSectionReport
  provenance: [string, string][]
}) {
  const [page, setPage] = useState(0)
  const rows = [
    ...report.capitalReturnClaims.map(row => [
      'Claim', row.listingId, row.actionId, utc(row.exAt), utc(row.payAt), utc(row.observedAt), '',
      row.shares.toString(), row.currency, row.state, fixed(row.amount, 6), '',
      row.positionReceiptId ?? '', '',
    ]),
    ...report.capitalReturnPostings.map(row => [
      'Cash movement', row.listingId, row.actionId, utc(row.exAt), utc(row.payAt), utc(row.observedAt), utc(row.postedAt),
      row.shares.toString(), row.currency, '', '', fixed(row.cashDelta, 6), '', row.receiptId ?? '',
    ]),
  ]
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const current = Math.min(page, lastPage)
  if (!rows.length) return <p>No known paper capital return claims or cash movements at these cutoffs.</p>

  function download() {
    const prefix = provenance.map(([, value]) => quoteText(value))
    const header = [...provenance.map(([column]) => column), ...columns.map(([column]) => column)].join(',')
    const records = rows.map(row => row.map((value, index) =>
      value && !numericColumns.has(columns[index][0]) ? quoteText(value) : value))
    const csv = [header, ...records.map(row => [...prefix, ...row].join(','))].join('\r\n') + '\r\n'
    downloadFile('paper-capital-returns.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable paper capital returns">
      <table className="universe-table" aria-label="Paper capital returns">
        <thead><tr>{columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(([kind, ...detail], index) =>
          <tr key={current * pageSize + index}><th scope="row">{kind}</th>
            {detail.map((value, column) => <td key={columns[column + 1][0]}>{value || '—'}</td>)}
          </tr>)}</tbody>
      </table>
    </div>
    {lastPage > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous capital return rows</button>
      <p>{current + 1} / {lastPage + 1}</p>
      <button type="button" className="outline" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next capital return rows</button>
    </div>}
    <button type="button" className="outline" onClick={download}>Download paper capital returns</button>
  </>
}
