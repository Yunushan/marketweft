import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import type { FootprintQuery, MarketCore, PriceProfile, PriceProfileArea, TradeFlowVolume } from './market-core'

const PAGE_SIZE = 60

function total({ buy, sell, unknown }: TradeFlowVolume) {
  return buy + sell + unknown
}

function bracket(from: bigint, to: bigint) {
  return '[' + fixed(from, 6) + ', ' + fixed(to, 6) + ')'
}

function profileCsv(
  instrument: string, source: string, query: FootprintQuery, profile: PriceProfile,
  volume: PriceProfileArea, tpo: PriceProfileArea,
) {
  const header = 'instrument,source,bracket_seconds,price_increment,execution_from_utc,execution_through_utc,known_utc,value_area_target_pct,observed_brackets,price_from,price_to,buy_volume,sell_volume,unknown_volume,total_volume,trades,tpo_count,volume_poc_from,volume_poc_to,volume_value_from,volume_value_to,volume_area_covered,volume_area_total,tpo_poc_from,tpo_poc_to,tpo_value_from,tpo_value_to,tpo_area_covered,tpo_area_total'
  const prefix = [quoteText(instrument), quoteText(source), query.bucketSeconds, query.priceWidth,
    query.from, query.through, query.known, fixed(BigInt(profile.valueAreaBasisPoints), 2), profile.observedBrackets]
  const area = (area: PriceProfileArea, units: (value: bigint) => string) => [
    ...[area.pointOfControlFrom, area.pointOfControlTo, area.valueFrom, area.valueTo].map(value => fixed(value, 6)),
    units(area.covered), units(area.total),
  ]
  const suffix = [...area(volume, value => fixed(value, 6)), ...area(tpo, String)]
  const rows = profile.levels.map(row => [
    ...prefix, fixed(row.priceFrom, 6), fixed(row.priceTo, 6), fixed(row.volume.buy, 6),
    fixed(row.volume.sell, 6), fixed(row.volume.unknown, 6), fixed(total(row.volume), 6),
    row.volume.trades, row.opportunities, ...suffix,
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

function AreaReadout({ name, area, measure }: {
  name: string
  area: PriceProfileArea
  measure: (weight: bigint) => string
}) {
  return (
    <div role="group" aria-label={name}>
      <h4>{name}</h4>
      <dl className="replay-times">
        <div><dt>Point of control</dt><dd>{bracket(area.pointOfControlFrom, area.pointOfControlTo)}</dd></div>
        <div><dt>Value area</dt><dd>{bracket(area.valueFrom, area.valueTo)}</dd></div>
        <div><dt>Covered / total</dt><dd>{measure(area.covered)} / {measure(area.total)}</dd></div>
      </dl>
    </div>
  )
}

function ProfileRows({ profile }: { profile: PriceProfile }) {
  const [requestedPage, setPage] = useState(0)
  const lastPage = Math.ceil(profile.levels.length / PAGE_SIZE) - 1
  const page = Math.min(requestedPage, lastPage)
  const maxVolume = profile.levels.reduce((max, row) => Math.max(max, Number(total(row.volume))), 1)
  const maxTpo = profile.levels.reduce((max, row) => Math.max(max, row.opportunities), 1)
  return (
    <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable price profile bins">
        <table className="universe-table" aria-label="Price profile bins">
          <thead><tr>
            <th scope="col">Price bin</th><th scope="col">Total volume</th><th scope="col">Time opportunities</th>
            <th scope="col">Buy</th><th scope="col">Sell</th><th scope="col">Unknown</th><th scope="col">Trades</th>
          </tr></thead>
          <tbody>{profile.levels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => (
            <tr key={row.priceFrom.toString()}>
              <th scope="row">{bracket(row.priceFrom, row.priceTo)}</th>
              <td className="profile-histogram volume">
                <span aria-hidden="true" style={{ width: (Number(total(row.volume)) * 100 / maxVolume) + '%' }} />
                <b>{fixed(total(row.volume), 6)}</b>
              </td>
              <td className="profile-histogram tpo">
                <span aria-hidden="true" style={{ width: (row.opportunities * 100 / maxTpo) + '%' }} />
                <b>{row.opportunities}</b>
              </td>
              <td>{fixed(row.volume.buy, 6)}</td>
              <td>{fixed(row.volume.sell, 6)}</td>
              <td>{fixed(row.volume.unknown, 6)}</td>
              <td>{row.volume.trades}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {lastPage > 0 && (
        <div className="replay-controls">
          <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous profile bins</button>
          <span role="status">Page {page + 1} of {lastPage + 1}</span>
          <button className="outline" disabled={page === lastPage} onClick={() => setPage(page + 1)}>Next profile bins</button>
        </div>
      )}
    </>
  )
}

export function PriceProfiles({ core, instrument, source, query }: {
  core: MarketCore
  instrument: string
  source: { csv: string; name: string }
  query: FootprintQuery
}) {
  const [draft, setDraft] = useState('70')
  const [target, setTarget] = useState<number | null>(null)
  const [error, setError] = useState('')
  const result = useMemo(() => {
    if (target === null) return null
    try {
      return { profile: core.recordedPriceProfile(instrument, source.csv, query, target) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not calculate price profiles.' }
    }
  }, [core, instrument, source, query, target])

  function apply(event: FormEvent) {
    event.preventDefault()
    const value = draft.trim()
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) {
      setError('Use a value area from 0.01% to 100% with up to two fractional digits.')
      return
    }
    const [integer, fraction = ''] = value.split('.')
    const basis = Number(integer) * 100 + Number(fraction.padEnd(2, '0'))
    if (basis < 1 || basis > 10_000) {
      setError('Use a value area from 0.01% to 100%.')
      return
    }
    setError('')
    setTarget(basis)
  }

  const profile = result?.profile
  const volume = profile?.volume
  const tpo = profile?.timeOpportunities
  return (
    <details className="research-details">
      <summary>Price profiles</summary>
      <section aria-label="Price profiles">
        <form className="universe-query" onSubmit={apply}>
          <label>Value area target (%)
            <input required inputMode="decimal" value={draft} onChange={event => setDraft(event.target.value)} />
          </label>
          <button className="outline" type="submit">Calculate profiles</button>
        </form>
        {(error || result?.error) && <p className="warning" role="alert">{error || result?.error}</p>}
        {profile && volume && tpo ? (
          <>
            <p>{profile.observedBrackets} observed time brackets · {fixed(BigInt(profile.valueAreaBasisPoints), 2)}% value area target</p>
            <div className="profile-summaries">
              <AreaReadout name="Volume profile" area={volume} measure={value => fixed(value, 6)} />
              <AreaReadout name="Time-price opportunities" area={tpo} measure={String} />
            </div>
            <ProfileRows key={JSON.stringify([query, target])} profile={profile} />
            <button className="outline" onClick={() => {
              const csv = profileCsv(instrument, source.name, query, profile, volume, tpo)
              downloadFile('price-profiles.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            }}>Download price profiles</button>
          </>
        ) : profile && <p role="status">No price bins match these execution and observation cutoffs.</p>}
      </section>
    </details>
  )
}
