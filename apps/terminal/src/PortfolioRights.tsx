import { useState } from 'react'
import type { PortfolioRightsOffering } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { shareText } from './SuccessorDeliveryLedger'
import { utc } from './workspace'

const phases: Record<PortfolioRightsOffering['phase'], string> = {
  announced: 'Awaiting entitlement',
  'awaiting-open': 'Awaiting opening',
  open: 'Open',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

export function PortfolioRights({ rows, effective, known, reportsSource, holdingsSource }: {
  rows: PortfolioRightsOffering[]; effective: string; known: string; reportsSource: string; holdingsSource: string
}) {
  const [page, setPage] = useState(0)
  if (rows.length === 0) return <p>No subscription rights reported at these cutoffs.</p>
  const pageSize = 100
  const last = Math.ceil(rows.length / pageSize) - 1
  const current = Math.min(last, page)
  const money = (value: bigint, currency: string) => `${fixed(value, 6)} ${currency}`

  function download() {
    const header = 'rights_source,holdings_source,effective_through_utc,known_through_utc,offering,listing,observed_utc,phase,subscription_listing,announced_utc,entitlement_utc,opens_utc,expires_utc,ratio_numerator,ratio_denominator,currency,subscription_price,fraction_policy,holding_effective_utc,holding_observed_utc,held_shares,exact_numerator,exact_denominator,subscribable_shares,full_subscription_cost'
    const prefix = [quoteText(reportsSource), quoteText(holdingsSource), effective, known]
    const csvRows = rows.map(({ offeringId, listingId, observedAt, phase, terms, entitlement }) => [
      ...prefix, quoteText(offeringId), quoteText(listingId), utc(observedAt), phase,
      ...(terms ? [quoteText(terms.subscriptionListing), utc(terms.announcedAt), utc(terms.entitlementAt),
        utc(terms.opensAt), utc(terms.expiresAt), terms.numerator, terms.denominator, terms.currency,
        fixed(terms.subscriptionPrice, 6), terms.fractionPolicy] : Array<string>(10).fill('')),
      ...(entitlement ? [utc(entitlement.holdingEffectiveAt), utc(entitlement.holdingObservedAt), entitlement.heldShares,
        entitlement.exactShares.numerator, entitlement.exactShares.denominator, entitlement.subscribableShares,
        fixed(entitlement.fullSubscriptionCost, 6)] : Array<string>(7).fill('')),
    ].join(','))
    const csv = [header, ...csvRows].join('\r\n') + '\r\n'
    downloadFile('portfolio-rights-offerings.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return <>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable subscription rights">
      <table className="universe-table" aria-label="Portfolio subscription rights">
        <thead><tr>{['Offering', 'Eligible listing', 'Subscription listing', 'Phase', 'Observed UTC', 'Entitlement UTC',
          'Opens UTC', 'Expires UTC', 'Held shares', 'Exact entitlement', 'Subscribable shares', 'Fraction policy',
          'Subscription price', 'Full subscription cost'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.slice(current * pageSize, (current + 1) * pageSize).map(row => {
          const { terms, entitlement } = row
          const held = entitlement?.heldShares ?? (row.phase === 'announced' || row.phase === 'cancelled' ? '—' : 'Holding unavailable')
          return <tr key={row.offeringId}>
            <th scope="row">{row.offeringId}</th><td>{row.listingId}</td><td>{terms?.subscriptionListing ?? '—'}</td>
            <td>{phases[row.phase]}</td><td>{utc(row.observedAt)}</td><td>{terms ? utc(terms.entitlementAt) : '—'}</td>
            <td>{terms ? utc(terms.opensAt) : '—'}</td><td>{terms ? utc(terms.expiresAt) : '—'}</td><td>{held}</td>
            <td>{shareText(entitlement?.exactShares ?? null)}</td><td>{entitlement?.subscribableShares.toString() ?? '—'}</td>
            <td>{terms?.fractionPolicy ?? '—'}</td><td>{terms ? money(terms.subscriptionPrice, terms.currency) : '—'}</td>
            <td>{terms && entitlement ? money(entitlement.fullSubscriptionCost, terms.currency) : '—'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    {last > 0 && <div className="universe-query">
      <button type="button" className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous offerings</button>
      <p>{current + 1} / {last + 1}</p>
      <button type="button" className="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Next offerings</button>
    </div>}
    <button type="button" className="outline" onClick={download}>Download subscription rights</button>
  </>
}
