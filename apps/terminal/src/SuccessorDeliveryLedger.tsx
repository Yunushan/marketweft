import { useMemo, useState } from 'react'
import type { PaperSuccessorDeliveryPosting, PortfolioSuccessorDeliveryPosting } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { utc } from './workspace'

export function shareText(shares: PortfolioSuccessorDeliveryPosting['delta'] | null) {
  if (shares === null) return '—'
  return shares.denominator === 1 ? shares.numerator.toString() : shares.numerator + '/' + shares.denominator
}

type DeliveryPosting = PortfolioSuccessorDeliveryPosting | PaperSuccessorDeliveryPosting

export function SuccessorDeliveryLedger({ title, filename, calculate, effective, known, showPositionReceipt, sourceFields = [] }: {
  title: string; filename: string; calculate: () => DeliveryPosting[]; effective: string; known: string
  showPositionReceipt?: boolean; sourceFields?: [string, string][]
}) {
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(0)
  const ledger = useMemo(() => {
    if (!expanded) return null
    try {
      return { rows: calculate() }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not calculate the successor delivery ledger.' }
    }
  }, [expanded, calculate])
  const rows = ledger?.rows ?? []
  const pageSize = 100
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const currentPage = Math.min(lastPage, page)
  const postingTimes = (row: PortfolioSuccessorDeliveryPosting) => [
    utc(row.delistedAt), utc(row.delistingObservedAt), utc(row.positionEffectiveAt), utc(row.positionObservedAt),
    row.entitledShares, utc(row.termsObservedAt), utc(row.scheduledDeliveryAt),
  ]
  const receipt = (row: DeliveryPosting) => 'positionReceiptId' in row ? row.positionReceiptId : ''
  function download() {
    const header = 'effective_through_utc,known_through_utc,posted_utc,delisting,old_listing,successor_listing,delisting_utc,delisting_observed_utc,holding_effective_utc,holding_observed_utc,entitled_shares,terms_observed_utc,scheduled_delivery_utc,delta_numerator,delta_denominator,balance_numerator,balance_denominator'
    const columns = [...sourceFields.map(([key]) => key), header, ...(showPositionReceipt ? ['position_receipt_id'] : [])].join(',')
    const fields = sourceFields.map(([, value]) => quoteText(value))
    const csv = [columns, ...rows.map(row => [...fields, effective, known, utc(row.postedAt), quoteText(row.delisting),
      quoteText(row.listing), quoteText(row.successor), ...postingTimes(row), row.delta.numerator,
      row.delta.denominator, row.balance.numerator, row.balance.denominator,
      ...(showPositionReceipt ? [quoteText(receipt(row))] : [])].join(','))].join('\r\n') + '\r\n'
    downloadFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }
  return <details className="research-details" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{title}</summary>
    {ledger?.error && <p className="warning" role="alert">{ledger.error}</p>}
    {ledger?.rows && (rows.length === 0 ? <p>No successor share deliveries posted at these cutoffs.</p> : <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label={`Scrollable ${title.toLowerCase()}`}>
        <table className="universe-table" aria-label={title}>
          <thead><tr>{['Posted UTC', 'Delisting', 'Old listing', 'Successor listing', 'Delisted UTC', 'Delisting observed UTC',
            'Holding effective UTC', 'Holding observed UTC', 'Entitled shares', 'Terms observed UTC', 'Scheduled delivery UTC',
            'Share change', 'Delivered balance', ...(showPositionReceipt ? ['Position receipt'] : [])].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => (
            <tr key={`${row.postedAt}/${row.delisting}/${row.successor}`}>
              <th scope="row">{utc(row.postedAt)}</th><td>{row.delisting}</td><td>{row.listing}</td><td>{row.successor}</td>
              {postingTimes(row).map((value, index) => <td key={index}>{value}</td>)}
              <td>{shareText(row.delta)}</td><td>{shareText(row.balance)}</td>
              {showPositionReceipt && <td>{receipt(row)}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {lastPage > 0 && <div className="universe-query">
        <button type="button" className="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous postings</button>
        <p>{currentPage + 1} / {lastPage + 1}</p>
        <button type="button" className="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next postings</button>
      </div>}
      <button type="button" className="outline" onClick={download}>Download {title.toLowerCase()}</button>
    </>)}
  </details>
}
