import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { ListingRisk } from './ListingRisk'
import type { MarketCore, RelativeLegPoint, RelativePoint, UniverseListing } from './market-core'
import { utc } from './workspace'

type Pair = { left: string; right: string; baseline: string }
type Query = Pair & { effective: string; known: string }
const memberLabels = { member: 'Member', removed: 'Removed', delisted: 'Delisted' }
const PAGE_SIZE = 50
const LEFT_COLOR = '#74dbad'
const RIGHT_COLOR = '#e8ba70'

const units = (value: bigint | null) => value === null ? '' : fixed(value, 4)

function relativeCsv(query: Query, membershipSource: string, priceSource: string, rows: RelativePoint[]) {
  const header = 'left_listing_id,right_listing_id,baseline_utc,through_utc,known_utc,membership_source,price_source,point_utc,left_membership,left_close,left_close_observed_utc,left_return_pct,right_membership,right_close,right_close_observed_utc,right_return_pct,spread_pp'
  const prefix = [
    query.left, query.right, query.baseline, query.effective, query.known, membershipSource, priceSource,
  ].map(quoteText)
  const leg = ({ membership, close, returnUnits }: RelativeLegPoint) => [
    membership ?? '', close === null ? '' : fixed(close.ticks, 6), close === null ? '' : utc(close.observedAt),
    units(returnUnits),
  ]
  return [header, ...rows.map(row => [
    ...prefix, utc(row.effectiveAt), ...leg(row.left), ...leg(row.right), units(row.spreadUnits),
  ].join(','))].join('\r\n') + '\r\n'
}

function RelativePlot({ rows, leftId, rightId }: { rows: RelativePoint[]; leftId: string; rightId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const [baseline, end] = [rows[0].effectiveAt, rows[rows.length - 1].effectiveAt]
    let low = 0
    let high = 0
    for (const { left, right } of rows) {
      for (const { returnUnits } of [left, right]) {
        if (returnUnits === null) continue
        const value = Number(returnUnits) / 10_000
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    }
    if (low === high) {
      low = -1
      high = 1
    }
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      ctx.scale(dpr, dpr)
      const [axis, edge, top, bottom] = [72, width - 12, 14, height - 12]
      const x = (at: number) => baseline === end
        ? (axis + edge) / 2 : axis + (edge - axis) * (at - baseline) / (end - baseline)
      const y = (value: number) => top + (bottom - top) * (high - value) / (high - low)
      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const value of new Set([low, high, 0])) {
        if (value !== 0 && Math.abs(y(value) - y(0)) < 14) continue
        const label = Math.abs(value) >= 1000 ? value.toExponential(1) : String(value)
        ctx.strokeStyle = value === 0 ? '#667d75' : '#303a3d'
        ctx.beginPath()
        ctx.moveTo(axis, y(value))
        ctx.lineTo(edge, y(value))
        ctx.stroke()
        ctx.fillStyle = '#a2b0a9'
        ctx.fillText(label + '%', axis - 8, y(value), axis - 12)
      }
      for (const [side, color, size] of [
        ['right', RIGHT_COLOR, 6], ['left', LEFT_COLOR, 3],
      ] as const) {
        ctx.fillStyle = color
        for (const row of rows) {
          const { returnUnits } = row[side]
          if (returnUnits === null) continue
          ctx.fillRect(x(row.effectiveAt) - size / 2, y(Number(returnUnits) / 10_000) - size / 2, size, size)
        }
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [rows])

  return (
    <figure className="relative-plot">
      <figcaption>
        <span className="relative-left">{leftId}</span>
        <span className="relative-right">{rightId}</span>
      </figcaption>
      <canvas ref={canvas} role="img" aria-label="Observed returns over UTC time. Exact values are in the table." />
    </figure>
  )
}

function LegCells({ leg }: { leg: RelativeLegPoint }) {
  return (
    <>
      <td>{leg.membership ? memberLabels[leg.membership] : 'Unavailable'}</td>
      <td>{leg.close ? (
        <>{fixed(leg.close.ticks, 6)}<br /><small>Known {utc(leg.close.observedAt)}</small></>
      ) : 'Missing'}</td>
      <td>{leg.returnUnits === null ? '—' : units(leg.returnUnits) + '%'}</td>
    </>
  )
}

function RelativeTable({ left, right, rows }: { left: string; right: string; rows: RelativePoint[] }) {
  const [requestedPage, setPage] = useState(0)
  const pageCount = Math.ceil(rows.length / PAGE_SIZE)
  const page = Math.min(requestedPage, pageCount - 1)
  return (
    <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable relative returns">
        <table className="universe-table" aria-label="Aligned relative returns">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Point (UTC)</th>
              <th scope="colgroup" colSpan={3}>{left}</th>
              <th scope="colgroup" colSpan={3}>{right}</th>
              <th scope="col" rowSpan={2}>Spread (pp)</th>
            </tr>
            <tr>
              <th scope="col">Status</th><th scope="col">Close</th><th scope="col">Return</th>
              <th scope="col">Status</th><th scope="col">Close</th><th scope="col">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => (
              <tr key={row.effectiveAt}>
                <th scope="row">{utc(row.effectiveAt)}</th>
                <LegCells leg={row.left} />
                <LegCells leg={row.right} />
                <td>{row.spreadUnits === null ? '—' : units(row.spreadUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="replay-controls">
          <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous points</button>
          <span role="status">Page {page + 1} of {pageCount}</span>
          <button className="outline" disabled={page + 1 === pageCount} onClick={() => setPage(page + 1)}>Next points</button>
        </div>
      )}
    </>
  )
}

export function RelativeReturns({
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
  const [draft, setDraft] = useState<Pair>({ left: '', right: '', baseline: firstCutoff })
  const [pair, setPair] = useState<Pair | null>(null)
  const [error, setError] = useState('')
  const options = new Map(listings.map(row => [row.listingId, row.instrument]))
  for (const id of [draft.left, draft.right]) {
    if (id && !options.has(id)) options.set(id, '')
  }
  const report = useMemo(() => {
    if (!pair) return null
    try {
      return { rows: core.relativeSeries(membership, prices, pair.left, pair.right, pair.baseline, effective, known) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not compare the selected listings.' }
    }
  }, [pair, core, membership, prices, effective, known])

  function apply(event: FormEvent) {
    event.preventDefault()
    const value = { ...draft, baseline: draft.baseline.trim() }
    try {
      core.relativeSeries(membership, prices, value.left, value.right, value.baseline, effective, known)
      setPair(value)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare the selected listings.')
    }
  }

  const rows = report?.rows
  const knownReturns = rows?.some(row => row.left.returnUnits !== null || row.right.returnUnits !== null)
  return (
    <details className="research-details">
      <summary>Relative returns</summary>
      <section aria-label="Relative returns">
        <form className="universe-query" onSubmit={apply}>
          {(['left', 'right'] as const).map(side => (
            <label key={side}>{side === 'left' ? 'Left listing' : 'Right listing'}
              <select required value={draft[side]} onChange={event => setDraft({ ...draft, [side]: event.target.value })}>
                <option value="">Choose a listing</option>
                {[...options].map(([id, instrument]) => (
                  <option key={id} value={id}>{instrument ? id + ' · ' + instrument : id}</option>
                ))}
              </select>
            </label>
          ))}
          <label>Comparison baseline (UTC)
            <input required value={draft.baseline} spellCheck={false} autoComplete="off"
              onChange={event => setDraft({ ...draft, baseline: event.target.value })} />
          </label>
          <button type="submit" className="outline">Compare returns</button>
        </form>
        {options.size < 2 && <p>Set an effective and known time with at least two listings to choose from.</p>}
        {(report?.error || error) && <p className="warning" role="alert">{error || report?.error}</p>}
        {pair && rows && (
          <>
            <p>Baseline {pair.baseline} · Effective through {effective} · Known through {known} · {priceSource}</p>
            {knownReturns ? <RelativePlot rows={rows} leftId={pair.left} rightId={pair.right} />
              : <p>No price returns are available at these cutoffs.</p>}
            <RelativeTable key={JSON.stringify([pair, effective, known])} left={pair.left} right={pair.right} rows={rows} />
            <button type="button" className="outline" onClick={() => {
              const csv = relativeCsv({ ...pair, effective, known }, membershipSource, priceSource, rows)
              downloadFile('relative-returns.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            }}>Download relative returns</button>
            <ListingRisk core={core} pair={pair} membership={membership} membershipSource={membershipSource}
              prices={prices} priceSource={priceSource} effective={effective} known={known} />
          </>
        )}
      </section>
    </details>
  )
}
