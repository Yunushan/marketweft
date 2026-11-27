import { useState } from 'react'
import type { PortfolioCapitalReturn } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

const states: Record<PortfolioCapitalReturn['state'], string> = {
  'unknown-position': 'Holding unavailable', 'no-payment': 'No distribution', receivable: 'Receivable', paid: 'Paid',
}
const money = (value: bigint) => fixed(value, 6)
const pageSize = 100

export function PortfolioCapitalReturns({ rows, effective, known, reportsSource, holdingsSource, basisSource }: {
  rows: PortfolioCapitalReturn[]; effective: string; known: string
  reportsSource: string; holdingsSource: string; basisSource?: string
}) {
  const [page, setPage] = useState(0)
  if (!rows.length) return <p>No capital returns reported at these cutoffs.</p>
  const last = Math.ceil(rows.length / pageSize) - 1
  const current = Math.min(last, page)

  function download() {
    const header = 'capital_returns_source,holdings_source,basis_source,effective_through_utc,known_through_utc,action,listing,announced_utc,ex_utc,pay_utc,observed_utc,status,currency,amount_per_share,entitled_shares,distribution,basis_observed_utc,basis_before,basis_reduction,basis_remaining,cash_above_basis'
    const prefix = [quoteText(reportsSource), quoteText(holdingsSource), basisSource ? quoteText(basisSource) : '', effective, known]
    const values = rows.map(row => [
      ...prefix, quoteText(row.actionId), quoteText(row.listingId), utc(row.announcedAt), utc(row.exAt),
      utc(row.payAt), utc(row.observedAt), row.state, row.currency, money(row.amountPerShare),
      row.entitledShares ?? '', row.amount === null ? '' : money(row.amount),
      ...(row.basis ? [utc(row.basis.observedAt), money(row.basis.before), money(row.basis.reduction),
        money(row.basis.remaining), money(row.basis.excess)] : Array<string>(5).fill('')),
    ].join(','))
    const csv = [header, ...values].join('\r\n') + '\r\n'
    downloadFile('portfolio-capital-returns.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable portfolio capital returns">
      <table className="universe-table" aria-label="Portfolio capital returns">
        <thead><tr>{['Action', 'Listing', 'Ex UTC', 'Pay UTC', 'Observed UTC', 'Status', 'Entitled shares',
          'Currency', 'Amount per share', 'Distribution', 'Basis observed UTC', 'Basis before', 'Basis reduction',
          'Basis remaining', 'Cash above basis'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(row => (
          <tr key={row.listingId + '/' + row.actionId}>
            <th scope="row">{row.actionId}</th><td>{row.listingId}</td><td>{utc(row.exAt)}</td>
            <td>{utc(row.payAt)}</td><td>{utc(row.observedAt)}</td><td>{states[row.state]}</td>
            <td>{row.entitledShares ?? '—'}</td><td>{row.currency}</td><td>{money(row.amountPerShare)}</td>
            <td>{row.amount === null ? '—' : money(row.amount)}</td>
            <td>{row.basis ? utc(row.basis.observedAt) : '—'}</td>
            <td>{row.basis ? money(row.basis.before) : row.state === 'paid' ? 'Basis unavailable' : '—'}</td>
            <td>{row.basis ? money(row.basis.reduction) : '—'}</td>
            <td>{row.basis ? money(row.basis.remaining) : '—'}</td>
            <td>{row.basis ? money(row.basis.excess) : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    {last > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous capital returns</button>
      <p>{current + 1} / {last + 1}</p>
      <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next capital returns</button>
    </div>}
    <button type="button" className="outline" onClick={download}>Download capital returns</button>
  </>
}
