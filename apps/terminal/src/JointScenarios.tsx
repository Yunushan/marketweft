import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import type { JointScenarioQuery, JointScenarioReport, MarketCore, ScenarioAllocation, UniverseListing } from './market-core'

type Parameters = Omit<JointScenarioQuery, 'through' | 'known'>
type Accepted = { allocations: ScenarioAllocation[]; settings: Parameters }

function simulationsCsv(
  report: JointScenarioReport, query: JointScenarioQuery, membershipSource: string, priceSource: string,
) {
  const blockColumns = report.blockSize > 1 ? ['moves_per_block', 'eligible_blocks'] : []
  const blockValues = report.blockSize > 1 ? [report.blockSize, report.eligibleBlocks] : []
  const header = [
    'source_membership,source_prices,execution_from_utc,execution_through_utc,known_utc,interval_seconds,starting_value,fee_basis_points,seed,horizon,listing_weights_basis_points,expected_vectors,eligible_vectors,path,ending_value,drawdown_percent,turnover_fees',
    ...blockColumns,
  ].join(',')
  const weights = report.coverage.map(row => row.listingId + '=' + row.weightBasisPoints).join('|')
  const prefix = [
    ...[membershipSource, priceSource, query.from, query.through, query.known].map(quoteText), query.intervalSeconds,
    query.startingValue, query.feeBasisPoints, query.seed, query.horizon, quoteText(weights),
    report.expectedVectors, report.eligibleVectors,
  ]
  const rows = report.paths.map((path, index) => [
    ...prefix, index + 1, fixed(path.endingValue, 6), fixed(path.drawdownMillionths, 4), fixed(path.fees, 6), ...blockValues,
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

export function JointScenarios({
  core, membership, membershipSource, prices, priceSource, listings, firstCutoff, effective, known,
}: {
  core: MarketCore
  membership: string
  membershipSource: string
  prices: string
  priceSource: string
  listings: UniverseListing[]
  firstCutoff: string
  effective: string
  known: string
}) {
  const [weights, setWeights] = useState([
    { row: 0, id: '', weight: '5000' }, { row: 1, id: '', weight: '5000' },
  ])
  const [nextRow, setNextRow] = useState(2)
  const [form, setForm] = useState({
    from: firstCutoff, intervalSeconds: '60', startingValue: '100', feeBasisPoints: '0',
    seed: '9007199254740993', paths: '10', horizon: '12', blockSize: '1',
  })
  const [accepted, setAccepted] = useState<Accepted | null>(null)
  const [error, setError] = useState('')
  const options = new Map(listings.map(row => [row.listingId, row.instrument]))
  for (const { id } of weights) {
    if (id && !options.has(id)) options.set(id, '')
  }

  const results = useMemo(() => {
    if (!accepted) return null
    const query = { ...accepted.settings, through: effective, known }
    try {
      return { query, report: core.portfolioScenarios(membership, prices, accepted.allocations, query) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not simulate the portfolio.' }
    }
  }, [core, membership, prices, effective, known, accepted])

  function apply(event: FormEvent) {
    event.preventDefault()
    const values = [form.intervalSeconds, form.feeBasisPoints, form.seed, form.paths, form.horizon, form.blockSize,
      ...weights.map(entry => entry.weight)]
    if (values.some(value => !/^\d+$/.test(value.trim()))) {
      setError('Use whole nonnegative scenario settings and weights.')
      return
    }
    const settings = {
      from: form.from.trim(), intervalSeconds: Number(form.intervalSeconds), startingValue: form.startingValue.trim(),
      feeBasisPoints: Number(form.feeBasisPoints), seed: BigInt(form.seed.trim()), paths: Number(form.paths),
      horizon: Number(form.horizon), blockSize: Number(form.blockSize),
    }
    const allocations = weights.map(entry => ({ listingId: entry.id, weightBasisPoints: Number(entry.weight) }))
    try {
      core.portfolioScenarios(membership, prices, allocations, { ...settings, through: effective, known })
      setAccepted({ settings, allocations })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not simulate the portfolio.')
    }
  }

  const report = results?.report
  const query = results?.query
  return (
    <details className="research-details">
      <summary>Correlated portfolio scenarios</summary>
      <section aria-label="Correlated portfolio scenarios">
        <form onSubmit={apply}>
          <div className="scenario-allocations">
            {weights.map((entry, index) => (
              <div className="universe-query" key={entry.row}>
                <label>Scenario listing {index + 1}
                  <select required value={entry.id} onChange={event => setWeights(weights.map(row =>
                    row.row === entry.row ? { ...row, id: event.target.value } : row))}>
                    <option value="">Choose a listing</option>
                    {[...options].map(([id, instrument]) => (
                      <option value={id} key={id}>{instrument ? id + ' · ' + instrument : id}</option>
                    ))}
                  </select>
                </label>
                <label>Listing {index + 1} weight (basis points)
                  <input required inputMode="numeric" value={entry.weight} onChange={event => setWeights(weights.map(row =>
                    row.row === entry.row ? { ...row, weight: event.target.value } : row))} />
                </label>
                {weights.length > 2 && (
                  <button type="button" className="outline" onClick={() => setWeights(weights.filter(row => row.row !== entry.row))}>
                    Remove listing {index + 1}
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="outline" disabled={weights.length >= 16} onClick={() => {
              setWeights([...weights, { row: nextRow, id: '', weight: '' }])
              setNextRow(nextRow + 1)
            }}>Add scenario listing</button>
          </div>
          <div className="universe-query">
            {([
              ['from', 'Scenario baseline (UTC)', 'text'], ['intervalSeconds', 'Scenario interval (seconds)', 'numeric'],
              ['startingValue', 'Starting portfolio value', 'decimal'], ['feeBasisPoints', 'Rebalance fee (basis points)', 'numeric'],
              ['seed', 'Portfolio scenario seed', 'numeric'], ['paths', 'Portfolio scenario paths', 'numeric'],
              ['horizon', 'Moves per portfolio path', 'numeric'],
              ['blockSize', 'Moves per sampled block', 'numeric'],
            ] as const).map(([key, label, inputMode]) => (
              <label key={key}>{label}
                <input required inputMode={inputMode} value={form[key]} maxLength={key === 'seed' ? 20 : undefined}
                  onChange={event => setForm({ ...form, [key]: event.target.value })} />
              </label>
            ))}
            <button type="submit" className="outline">Run portfolio scenarios</button>
          </div>
        </form>
        {(error || results?.error) && <p className="warning" role="alert">{error || results?.error}</p>}
        {report && query && (
          <>
            <p role="status">{report.eligibleVectors} / {report.expectedVectors} complete return vectors · {report.lossPaths} / {report.paths.length} paths ended below starting value</p>
            {report.blockSize > 1 && <p>Eligible historical blocks of {report.blockSize} moves · {report.eligibleBlocks}</p>}
            <p>Effective through {query.through} · Known through {query.known} · Seed {query.seed.toString()}</p>
            <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable scenario listing coverage">
              <table className="universe-table" aria-label="Portfolio scenario coverage">
                <thead><tr><th scope="col">Listing</th><th scope="col">Weight</th><th scope="col">Known returns</th></tr></thead>
                <tbody>{report.coverage.map(row => (
                  <tr key={row.listingId}>
                    <th scope="row">{row.listingId}</th>
                    <td>{fixed(BigInt(row.weightBasisPoints), 2)}%</td>
                    <td>{row.knownReturns} / {report.expectedVectors}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable scenario outcome percentiles">
              <table className="universe-table" aria-label="Portfolio scenario percentiles">
                <thead><tr><th scope="col">Metric</th><th scope="col">5th percentile</th>
                  <th scope="col">Median</th><th scope="col">95th percentile</th></tr></thead>
                <tbody>{([
                  ['Ending portfolio value', report.endingValue, 6, ''],
                  ['Peak-to-trough drawdown', report.drawdownMillionths, 4, '%'],
                  ['Turnover fees', report.fees, 6, ''],
                ] as const).map(([name, statistics, decimals, unit]) => (
                  <tr key={name}><th scope="row">{name}</th>
                    {statistics.map((value, index) => <td key={index}>{fixed(value, decimals) + unit}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <button type="button" className="outline" onClick={() => {
              const csv = simulationsCsv(report, query, membershipSource, priceSource)
              downloadFile('portfolio-scenarios.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            }}>Download scenario paths</button>
          </>
        )}
      </section>
    </details>
  )
}
