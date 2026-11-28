import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, PortfolioVarianceQuery, PortfolioVarianceReport } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'

const percentage = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 6 })
const covariance = new Intl.NumberFormat('en-US', { maximumFractionDigits: 10, useGrouping: false })
type Pair = { left: string; right: string; baseline: string }

function allocations(sample: NonNullable<PortfolioVarianceReport['sample']>) {
  return [
    ['Minimum sample variance', sample.minimum], ['Equal weight', sample.equal],
    ['Left only', sample.left], ['Right only', sample.right],
  ] as const
}

function varianceCsv(report: PortfolioVarianceReport, pair: Pair, query: PortfolioVarianceQuery, sources: string[]) {
  const header = [
    'membership_source,prices_source,from_utc,through_utc,known_utc,interval_seconds,left_listing,right_listing',
    'expected_returns,left_returns,right_returns,paired_returns,sample_covariance,allocation',
    'left_basis_points,right_basis_points,mean_fractional_return,volatility_fractional_return',
  ].join(',')
  const prefix = [...sources.map(quoteText), query.from, query.through, query.known, query.intervalSeconds,
    quoteText(pair.left), quoteText(pair.right), report.expectedReturns, report.leftReturns, report.rightReturns,
    report.pairedReturns, report.sample?.covariance]
  const lines = report.sample ? allocations(report.sample).map(([label, row]) =>
    [...prefix, quoteText(label), row.leftBasisPoints, 10000 - row.leftBasisPoints, row.meanReturn, row.volatility].join(','))
    : [[...prefix, '', '', '', '', ''].join(',')]
  return [header, ...lines].join('\r\n') + '\r\n'
}

export function PortfolioVariance({ core, pair, membership, membershipSource, prices, priceSource, effective, known }: {
  core: MarketCore; pair: Pair; membership: string; membershipSource: string; prices: string; priceSource: string
  effective: string; known: string
}) {
  const [draft, setDraft] = useState('60')
  const [interval, setInterval] = useState<number | null>(null)
  const [error, setError] = useState('')
  const result = useMemo(() => {
    if (interval === null) return null
    const query = { from: pair.baseline, through: effective, known, intervalSeconds: interval }
    try {
      return { query, report: core.portfolioVariance(membership, prices, pair.left, pair.right, query) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not estimate portfolio variance.' }
    }
  }, [core, pair, membership, prices, effective, known, interval])

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!/^\d+$/.test(draft.trim())) {
      setError('Use a positive whole number for the price interval.')
      return
    }
    const value = Number(draft)
    try {
      core.portfolioVariance(membership, prices, pair.left, pair.right, {
        from: pair.baseline, through: effective, known, intervalSeconds: value,
      })
      setInterval(value)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not estimate portfolio variance.')
    }
  }

  return <details className="research-details">
    <summary>Two-listing minimum variance</summary>
    <section aria-label="Two-listing minimum variance">
      <form className="universe-query" onSubmit={apply}>
        <label>Portfolio interval (seconds)
          <input required inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} />
        </label>
        <button className="outline" type="submit">Estimate portfolio variance</button>
      </form>
      {(error || result?.error) && <p className="warning" role="alert">{error || result?.error}</p>}
      {result?.report && <VarianceResults report={result.report} pair={pair} download={() => {
        const csv = varianceCsv(result.report, pair, result.query, [membershipSource, priceSource])
        downloadFile('two-listing-portfolio-variance.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      }} />}
    </section>
  </details>
}

function VarianceResults({ report, pair, download }: { report: PortfolioVarianceReport; pair: Pair; download: () => void }) {
  return <>
    <p role="status">{report.pairedReturns} of {report.expectedReturns} paired intervals · {pair.left} {report.leftReturns} · {pair.right} {report.rightReturns}</p>
    {report.sample ? <>
      <p>Sample return covariance {covariance.format(report.sample.covariance)}</p>
      <div className="replay-table-scroll">
        <table className="universe-table" aria-label="Portfolio variance allocations">
          <thead><tr><th scope="col">Allocation</th><th scope="col">{pair.left} weight</th><th scope="col">{pair.right} weight</th>
            <th scope="col">Mean return per interval</th><th scope="col">Volatility per interval</th></tr></thead>
          <tbody>{allocations(report.sample).map(([label, row]) => <tr key={label}>
            <th scope="row">{label}</th><td>{percentage.format(row.leftBasisPoints / 10000)}</td>
            <td>{percentage.format(1 - row.leftBasisPoints / 10000)}</td>
            <td>{percentage.format(row.meanReturn)}</td><td>{percentage.format(row.volatility)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : <p>At least two paired returns are needed to estimate variance.</p>}
    <button className="outline" type="button" onClick={download}>Download portfolio variance</button>
  </>
}
