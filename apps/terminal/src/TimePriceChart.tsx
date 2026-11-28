import { useMemo, useState } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import type { FootprintBar, FootprintQuery } from './market-core'
import { utc } from './workspace'

const TIME_PAGE_SIZE = 8
const PRICE_PAGE_SIZE = 24

type Column = { from: number; to: number; bar: FootprintBar | null }

function chartAxes(bars: readonly FootprintBar[], query: FootprintQuery) {
  const seconds = query.bucketSeconds
  const bracketStart = (value: string) => Math.floor(Date.parse(value) / (1000 * seconds)) * seconds
  const columns: Column[] = []
  const bins = new Map<bigint, bigint>()
  let edge = bracketStart(query.from)
  for (const bar of bars) {
    if (bar.startsAt > edge) columns.push({ from: edge, to: bar.startsAt, bar: null })
    columns.push({ from: bar.startsAt, to: bar.endsAt, bar })
    edge = bar.endsAt
    for (const level of bar.levels) bins.set(level.priceFrom, level.priceTo)
  }
  const end = bracketStart(query.through) + seconds
  if (edge < end) columns.push({ from: edge, to: end, bar: null })
  const prices = [...bins.entries()].sort(([left], [right]) => left > right ? -1 : left < right ? 1 : 0)
  return { columns, prices }
}

function Pages({ label, name, page, count, setPage }: {
  label: string; name: string; page: number; count: number; setPage: (page: number) => void
}) {
  if (count <= 1) return null
  return <div className="replay-controls">
    <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous {name}</button>
    <span role="status">{label} page {page + 1} of {count}</span>
    <button className="outline" disabled={page === count - 1} onClick={() => setPage(page + 1)}>Next {name}</button>
  </div>
}

export function TimePriceChart({ bars, instrument, query, source }: {
  bars: readonly FootprintBar[]; instrument: string; query: FootprintQuery; source: string
}) {
  const [timePage, setTimePage] = useState(0)
  const [pricePage, setPricePage] = useState(0)
  const { columns, prices } = useMemo(() => chartAxes(bars, query), [bars, query])
  const timeCount = Math.ceil(columns.length / TIME_PAGE_SIZE)
  const priceCount = Math.ceil(prices.length / PRICE_PAGE_SIZE)
  const currentTime = Math.min(timePage, timeCount - 1)
  const currentPrice = Math.min(pricePage, priceCount - 1)
  const visibleColumns = columns.slice(currentTime * TIME_PAGE_SIZE, (currentTime + 1) * TIME_PAGE_SIZE)
    .map(column => ({ ...column, occupied: new Set(column.bar?.levels.map(level => level.priceFrom)) }))

  function download() {
    const header = 'instrument,source,bracket_seconds,price_increment,execution_from_utc,execution_through_utc,known_utc,bracket_start_utc,bracket_end_exclusive_utc,price_from,price_to_exclusive,opportunity,trades'
    const queryFields = [quoteText(instrument), quoteText(source), query.bucketSeconds, query.priceWidth,
      query.from, query.through, query.known]
    const rows = bars.flatMap(bar => {
      const prefix = [...queryFields, utc(bar.startsAt), utc(bar.endsAt)]
      return bar.levels.map(level => [
        ...prefix, fixed(level.priceFrom, 6), fixed(level.priceTo, 6), 1, level.volume.trades,
      ].join(','))
    })
    downloadFile('time-price-brackets.csv', new Blob([[header, ...rows].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
  }

  return <section aria-label="Time-price bracket chart">
    <p>Each mark represents a price bin with at least one trade in that UTC bracket. A gap groups consecutive brackets with no observed trades.</p>
    <div className="replay-table-scroll" role="region" aria-label="Scrollable time-price chart" tabIndex={0}>
      <table className="universe-table time-price-chart" aria-label="Price bins by UTC execution bracket">
        <thead><tr><th scope="col">Price bin</th>{visibleColumns.map(column => <th scope="col" key={column.from}>
          {column.bar ? <time dateTime={utc(column.from)}>{utc(column.from)}</time> : <>
            Gap from <time dateTime={utc(column.from)}>{utc(column.from)}</time>
            <small>Until {utc(column.to)} (exclusive)</small>
          </>}
        </th>)}<th scope="col">Opportunities on page</th></tr></thead>
        <tbody>{prices.slice(currentPrice * PRICE_PAGE_SIZE, (currentPrice + 1) * PRICE_PAGE_SIZE).map(([from, to]) => {
          const occupancy = visibleColumns.map(column => column.occupied.has(from))
          return <tr key={from.toString()}><th scope="row">[{fixed(from, 6)}, {fixed(to, 6)})</th>
            {occupancy.map((present, index) => <td key={visibleColumns[index].from}
              className={present ? 'opportunity-present' : undefined}
              aria-label={present ? 'Observed opportunity' : 'No observed trade'}>{present ? '●' : '—'}</td>)}
            <td>{occupancy.filter(Boolean).length}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <Pages label="Time" name="time brackets" page={currentTime} count={timeCount} setPage={setTimePage} />
    <Pages label="Price" name="price bins" page={currentPrice} count={priceCount} setPage={setPricePage} />
    <button className="outline" onClick={download}>Download time-price brackets</button>
  </section>
}
