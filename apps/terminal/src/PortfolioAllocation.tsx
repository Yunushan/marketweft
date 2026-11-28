import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PortfolioAllocationQuery, PortfolioAllocationReport, UniverseListing } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'

const percentage = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 6 })
type Source = { csv: string; source: string }
type Selection = Pick<PortfolioAllocationQuery, 'from' | 'intervalSeconds' | 'maximumWeightBasisPoints'> & { listingIds: string[] }

function allocationCsv(report: PortfolioAllocationReport, query: PortfolioAllocationQuery, membership: Source, prices: Source) {
  const header = [
    'membership_source,prices_source,from_utc,through_utc,known_utc,interval_seconds',
    'expected_returns,common_returns,listing_id,known_returns,equal_basis_points,optimized_basis_points',
    'equal_mean_return,equal_volatility,optimized_mean_return,optimized_volatility,variance_gap,iterations',
    ...(query.maximumWeightBasisPoints === undefined ? [] : ['maximum_weight_basis_points']),
  ].join(',')
  const prefix = [quoteText(membership.source), quoteText(prices.source), query.from, query.through,
    query.known, query.intervalSeconds, report.expectedReturns, report.commonReturns]
  const stats = report.sample
  const lines = report.listings.map(row => [
    ...prefix, quoteText(row.listingId), row.knownReturns, row.equalBasisPoints, row.optimizedBasisPoints,
    stats?.equalMean, stats?.equalVolatility, stats?.optimizedMean, stats?.optimizedVolatility, stats?.varianceGap, stats?.iterations,
    ...(query.maximumWeightBasisPoints === undefined ? [] : [query.maximumWeightBasisPoints]),
  ].join(','))
  return [header, ...lines].join('\r\n') + '\r\n'
}

export function PortfolioAllocation({ core, membership, prices, listings, firstCutoff, effective, known }: {
  core: MarketCore; membership: Source; prices: Source; listings: UniverseListing[]
  firstCutoff: string; effective: string; known: string
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [start, setStart] = useState(firstCutoff)
  const [interval, setInterval] = useState('60')
  const [maximumWeight, setMaximumWeight] = useState('')
  const [accepted, setAccepted] = useState<Selection | null>(null)
  const [error, setError] = useState('')
  const available = new Map(listings.map(row => [row.listingId, row.instrument]))
  for (const id of selected) if (!available.has(id)) available.set(id, '')
  const search = filter.trim().toLowerCase()
  const matching = [...available].filter(([id, instrument]) =>
    selected.includes(id) || (id + ' ' + instrument).toLowerCase().includes(search))
  const visible = matching.filter(([id]) => selected.includes(id))
    .concat(matching.filter(([id]) => !selected.includes(id))).slice(0, 100)
  const membershipCsv = membership.csv
  const pricesCsv = prices.csv

  const result = useMemo(() => {
    if (!accepted) return null
    const query = {
      from: accepted.from, through: effective, known, intervalSeconds: accepted.intervalSeconds,
      maximumWeightBasisPoints: accepted.maximumWeightBasisPoints,
    }
    try {
      return { query, report: core.portfolioAllocation(membershipCsv, pricesCsv, accepted.listingIds, query) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not estimate the allocation.' }
    }
  }, [accepted, core, effective, known, membershipCsv, pricesCsv])

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!/^\d+$/.test(interval.trim())) {
      setError('Use a positive whole number for the price interval.')
      return
    }
    const limit = maximumWeight.trim()
    if (limit && !/^\d+$/.test(limit)) {
      setError('Use a whole maximum weight from 1 to 10,000 basis points.')
      return
    }
    const input = {
      listingIds: selected, from: start.trim(), intervalSeconds: Number(interval),
      maximumWeightBasisPoints: limit ? Number(limit) : undefined,
    }
    try {
      core.portfolioAllocation(membershipCsv, pricesCsv, input.listingIds, {
        from: input.from, through: effective, known, intervalSeconds: input.intervalSeconds,
        maximumWeightBasisPoints: input.maximumWeightBasisPoints,
      })
      setAccepted(input)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not estimate the allocation.')
    }
  }

  return <details className="research-details">
    <summary>Portfolio minimum variance</summary>
    <section aria-label="Portfolio minimum variance">
      <form className="universe-query" onSubmit={apply}>
        <fieldset>
          <legend>Choose 2 to 16 listings</legend>
          {available.size > 100 && <label>Find listings
            <input value={filter} onChange={event => setFilter(event.target.value)} />
          </label>}
          {matching.length > visible.length && <p>{visible.length} of {matching.length} matching listings shown</p>}
          <div className="replay-controls">
            {visible.map(([id, instrument]) => <label key={id}>
              <input type="checkbox" checked={selected.includes(id)} disabled={selected.length === 16 && !selected.includes(id)}
                onChange={event => setSelected(
                event.target.checked ? [...selected, id] : selected.filter(chosen => chosen !== id),
              )} />{id}{instrument ? ' · ' + instrument : ''}
            </label>)}
          </div>
        </fieldset>
        <label>Allocation sample start (UTC)
          <input required spellCheck={false} autoComplete="off" value={start} onChange={event => setStart(event.target.value)} />
        </label>
        <label>Allocation interval (seconds)
          <input required inputMode="numeric" value={interval} onChange={event => setInterval(event.target.value)} />
        </label>
        <label>Maximum weight per listing (bp)
          <input inputMode="numeric" placeholder="10000" value={maximumWeight} onChange={event => setMaximumWeight(event.target.value)} />
        </label>
        <button className="outline" type="submit">Estimate minimum variance</button>
      </form>
      {(error || result?.error) && <p className="warning" role="alert">{error || result?.error}</p>}
      {result?.report && <>
        {result.query.maximumWeightBasisPoints !== undefined &&
          <p>Maximum weight {result.query.maximumWeightBasisPoints} bp per listing.</p>}
        <AllocationResults report={result.report} />
        <button className="outline" type="button" onClick={() => {
          const csv = allocationCsv(result.report, result.query, membership, prices)
          downloadFile('portfolio-minimum-variance.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
        }}>Download minimum variance</button>
      </>}
    </section>
  </details>
}

function AllocationResults({ report }: { report: PortfolioAllocationReport }) {
  return <>
    <p role="status">{report.commonReturns} of {report.expectedReturns} common intervals</p>
    {report.sample ? <p>Historical volatility {percentage.format(report.sample.optimizedVolatility)} · Equal weights {percentage.format(report.sample.equalVolatility)}
      {' · Estimated variance gap '}{report.sample.varianceGap.toPrecision(4)}</p>
      : <p>At least two common returns are needed to estimate the allocation.</p>}
    <div className="replay-table-scroll">
      <table className="universe-table" aria-label="Minimum variance allocation by listing">
        <thead><tr><th scope="col">Listing</th><th scope="col">Observed returns</th>
          <th scope="col">Equal weight (bp)</th><th scope="col">Estimated weight (bp)</th></tr></thead>
        <tbody>{report.listings.map(row => <tr key={row.listingId}>
          <th scope="row">{row.listingId}</th><td>{row.knownReturns}</td>
          <td>{row.equalBasisPoints ?? '—'}</td><td>{row.optimizedBasisPoints ?? '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>
}
