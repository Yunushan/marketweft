import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import type { ListingDownsideRiskPoint, ListingRiskPoint, ListingRiskQuery, MarketCore } from './market-core'
import { utc } from './workspace'

type WindowSettings = Pick<ListingRiskQuery, 'intervalSeconds' | 'windowPeriods' | 'volatilityPeriods'>
type Pair = { left: string; right: string; baseline: string }
const PAGE_SIZE = 50

function riskCsv(
  rows: ListingDownsideRiskPoint[], query: ListingRiskQuery, pair: Pair, membershipSource: string, priceSource: string,
  showDownside: boolean,
) {
  const standardHeader = 'left_listing_id,right_listing_id,query_from_utc,query_through_utc,known_utc,interval_seconds,window_periods,volatility_scale_periods,membership_source,price_source,window_from_utc,window_through_utc,expected_returns,left_returns,right_returns,paired_returns,left_volatility_fraction,right_volatility_fraction,correlation'
  const header = standardHeader + (showDownside ? ',left_loss_returns,right_loss_returns,left_downside_fraction,right_downside_fraction' : '')
  const prefix = [
    ...[pair.left, pair.right, query.from, query.through, query.known].map(quoteText),
    query.intervalSeconds, query.windowPeriods, query.volatilityPeriods, quoteText(membershipSource), quoteText(priceSource),
  ]
  const records = rows.map(row => [
    ...prefix, utc(row.fromAt), utc(row.throughAt), row.expectedReturns, row.leftReturns,
    row.rightReturns, row.pairedReturns, row.leftVolatility ?? '', row.rightVolatility ?? '', row.correlation ?? '',
    ...(showDownside ? [row.leftLossReturns, row.rightLossReturns, row.leftDownside ?? '', row.rightDownside ?? ''] : []),
  ].join(','))
  return [header, ...records].join('\r\n') + '\r\n'
}

function CorrelationPlot({ rows }: { rows: ListingRiskPoint[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      ctx.scale(dpr, dpr)
      const [axis, right, top, bottom] = [36, width - 12, 12, height - 12]
      const x = (index: number) => rows.length === 1 ? (axis + right) / 2
        : axis + (right - axis) * index / (rows.length - 1)
      const y = (value: number) => top + (bottom - top) * (1 - value) / 2
      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const value of [-1, 0, 1]) {
        ctx.fillStyle = '#a2b0a9'
        ctx.fillText(String(value), axis - 7, y(value))
        ctx.strokeStyle = value === 0 ? '#667d75' : '#303a3d'
        ctx.beginPath()
        ctx.moveTo(axis, y(value))
        ctx.lineTo(right, y(value))
        ctx.stroke()
      }
      ctx.fillStyle = '#74dbad'
      for (const [index, row] of rows.entries()) {
        if (row.correlation !== null) ctx.fillRect(x(index) - 2, y(row.correlation) - 2, 4, 4)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [rows])
  return <canvas ref={canvas} className="flow-chart" role="img" aria-label="Rolling correlation over UTC. Missing windows are blank." />
}

function RiskRows({ rows, pair, showDownside }: { rows: ListingDownsideRiskPoint[]; pair: Pair; showDownside: boolean }) {
  const [requestedPage, setPage] = useState(0)
  const lastPage = Math.ceil(rows.length / PAGE_SIZE) - 1
  const page = Math.min(requestedPage, lastPage)
  const volatility = (value: number | null) => value === null ? '—' : (value * 100).toFixed(6) + '%'
  return (
    <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable rolling risk windows">
        <table className="universe-table" aria-label="Rolling listing risk">
          <thead><tr>
            <th scope="col">Window from (UTC)</th><th scope="col">Window through (UTC)</th>
            <th scope="col">{pair.left} returns</th><th scope="col">{pair.right} returns</th><th scope="col">Paired returns</th>
            <th scope="col">{pair.left} volatility</th><th scope="col">{pair.right} volatility</th><th scope="col">Correlation</th>
            {showDownside && <>
              <th scope="col">{pair.left} loss returns</th><th scope="col">{pair.right} loss returns</th>
              <th scope="col">{pair.left} downside deviation</th><th scope="col">{pair.right} downside deviation</th>
            </>}
          </tr></thead>
          <tbody>{rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => (
            <tr key={row.throughAt}>
              <td>{utc(row.fromAt)}</td><th scope="row">{utc(row.throughAt)}</th>
              <td>{row.leftReturns} / {row.expectedReturns}</td>
              <td>{row.rightReturns} / {row.expectedReturns}</td>
              <td>{row.pairedReturns} / {row.expectedReturns}</td>
              <td>{volatility(row.leftVolatility)}</td><td>{volatility(row.rightVolatility)}</td>
              <td>{row.correlation === null ? '—' : row.correlation.toFixed(6)}</td>
              {showDownside && <>
                <td>{row.leftLossReturns} / {row.leftReturns}</td><td>{row.rightLossReturns} / {row.rightReturns}</td>
                <td>{volatility(row.leftDownside)}</td><td>{volatility(row.rightDownside)}</td>
              </>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {lastPage > 0 && <div className="replay-controls">
        <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous risk windows</button>
        <span role="status">Page {page + 1} of {lastPage + 1}</span>
        <button className="outline" disabled={page === lastPage} onClick={() => setPage(page + 1)}>Next risk windows</button>
      </div>}
    </>
  )
}

export function ListingRisk({
  core, pair, membership, membershipSource, prices, priceSource, effective, known,
}: {
  core: MarketCore
  pair: Pair
  membership: string
  membershipSource: string
  prices: string
  priceSource: string
  effective: string
  known: string
}) {
  const [draft, setDraft] = useState({ intervalSeconds: '60', windowPeriods: '3', volatilityPeriods: '1' })
  const [settings, setSettings] = useState<WindowSettings | null>(null)
  const [showDownside, setShowDownside] = useState(false)
  const [error, setError] = useState('')
  const result = useMemo(() => {
    if (!settings) return null
    const query = { from: pair.baseline, through: effective, known, ...settings }
    try {
      return { query, rows: core.listingDownsideRisk(membership, prices, pair.left, pair.right, query) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not calculate rolling risk.' }
    }
  }, [core, pair, membership, prices, effective, known, settings])

  function apply(event: FormEvent) {
    event.preventDefault()
    const values = [draft.intervalSeconds, draft.windowPeriods, draft.volatilityPeriods].map(value => value.trim())
    if (values.some(value => !/^\d+$/.test(value))) {
      setError('Use whole numbers for the interval, window and volatility scale.')
      return
    }
    const [intervalSeconds, windowPeriods, volatilityPeriods] = values.map(Number)
    const proposed = { intervalSeconds, windowPeriods, volatilityPeriods }
    try {
      core.listingRisk(membership, prices, pair.left, pair.right, { from: pair.baseline, through: effective, known, ...proposed })
      setError('')
      setSettings(proposed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not calculate rolling risk.')
    }
  }

  return (
    <details className="research-details">
      <summary>Rolling risk</summary>
      <section aria-label="Rolling risk">
        <form className="universe-query" onSubmit={apply}>
          {([
            ['intervalSeconds', 'Price interval (seconds)'],
            ['windowPeriods', 'Returns per risk window'],
            ['volatilityPeriods', 'Periods for volatility scaling'],
          ] as const).map(([key, label]) => (
            <label key={key}>{label}
              <input required inputMode="numeric" value={draft[key]}
                onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
            </label>
          ))}
          <button className="outline" type="submit">Calculate risk</button>
        </form>
        <p>Use 1 for per-interval volatility. Correlation uses returns available for both listings on the same interval.</p>
        <label><input type="checkbox" checked={showDownside}
          onChange={event => setShowDownside(event.target.checked)} /> Show downside deviation</label>
        {showDownside && <p>Downside deviation measures returns below zero. Loss counts use the available returns for each listing.</p>}
        {(error || result?.error) && <p className="warning" role="alert">{error || result?.error}</p>}
        {result?.rows && (result.rows.length ? (
          <>
            {result.rows.some(row => row.correlation !== null) && <CorrelationPlot rows={result.rows} />}
            <RiskRows key={JSON.stringify([pair, result.query])} rows={result.rows} pair={pair} showDownside={showDownside} />
            <button className="outline" type="button" onClick={() => {
              const csv = riskCsv(result.rows, result.query, pair, membershipSource, priceSource, showDownside)
              downloadFile('rolling-listing-risk.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            }}>Download rolling risk</button>
          </>
        ) : <p role="status">The selected range is shorter than one risk window.</p>)}
      </section>
    </details>
  )
}
