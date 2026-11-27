import { useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, ScreenComparisonLeg, ScreenComparisonRow, ScreenCutoff, ScreenPrice } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

type Cutoffs = { before: ScreenCutoff; after: ScreenCutoff }
type Comparison = Cutoffs & { baseline: string; membership: string; membershipSource: string;
  prices: string; priceSource: string; rows: ScreenComparisonRow[] }

const isMember = (leg: ScreenComparisonLeg) => leg.membership?.state === 'member'

function movement(row: ScreenComparisonRow) {
  if (!isMember(row.before)) return 'Added'
  if (isMember(row.after)) return 'Retained'
  return row.after.membership?.state === 'delisted' ? 'Delisted' : 'Removed'
}

function rankLabel(leg: ScreenComparisonLeg) {
  if (leg.rank !== null) return String(leg.rank)
  if (!isMember(leg)) return leg.membership?.state === 'delisted' ? 'Delisted' :
    leg.membership?.state === 'removed' ? 'Removed' : 'Out of universe'
  return 'Unranked'
}

function missingClose(leg: ScreenComparisonLeg) {
  if (!isMember(leg) || leg.rank !== null) return undefined
  if (!leg.baseline && !leg.current) return 'Missing both closes'
  return !leg.baseline ? 'Missing baseline close' : 'Missing target close'
}

function RankCell({ leg }: { leg: ScreenComparisonLeg }) {
  const missing = missingClose(leg)
  return <td>
    {rankLabel(leg)}
    {leg.returnUnits !== null && <><br /><small>{fixed(leg.returnUnits, 4)}%</small></>}
    {missing && <><br /><small>{missing}</small></>}
  </td>
}

const columns = ['status', 'change_id', 'membership_effective_at', 'membership_known_at', 'rank',
  'return_pct', 'baseline_close', 'baseline_known_at', 'target_close', 'target_known_at']

function evidence(leg: ScreenComparisonLeg) {
  const report = leg.membership
  const close = (value: ScreenPrice | null) => value ? [fixed(value.ticks, 6), utc(value.observedAt)] : ['', '']
  return [report?.state ?? '', report ? quoteText(report.changeId) : '', report ? utc(report.effectiveAt) : '',
    report ? utc(report.observedAt) : '', leg.rank ?? '',
    leg.returnUnits === null ? '' : fixed(leg.returnUnits, 4), ...close(leg.baseline), ...close(leg.current)]
}

function exportComparison(report: Comparison) {
  const header = ['listing_id', 'instrument', 'baseline_at', 'before_effective_at', 'before_known_at',
    'after_effective_at', 'after_known_at', 'membership_source', 'price_source', 'transition', 'rank_move',
    ...['before', 'after'].flatMap(side => columns.map(column => side + '_' + column))]
  const rows = report.rows.map(row => [
    quoteText(row.listingId), quoteText(row.instrument), report.baseline, report.before.effective, report.before.known,
    report.after.effective, report.after.known, quoteText(report.membershipSource), quoteText(report.priceSource),
    movement(row).toLowerCase(), row.rankMove ?? '', ...evidence(row.before), ...evidence(row.after),
  ].join(','))
  downloadFile('universe-rank-comparison.csv', new Blob([
    [header.join(','), ...rows].join('\r\n') + '\r\n',
  ], { type: 'text/csv;charset=utf-8' }))
}

export function RankComparison({ core, membership, membershipSource, prices, priceSource, baseline, effective, known }: {
  core: MarketCore
  membership: string
  membershipSource: string
  prices: string
  priceSource: string
  baseline: string
  effective: string
  known: string
}) {
  const [draft, setDraft] = useState<Cutoffs>(() => ({ before: { effective, known }, after: { effective, known } }))
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState('')
  const report = comparison?.membership === membership && comparison.prices === prices &&
    comparison.baseline === baseline && comparison.membershipSource === membershipSource &&
    comparison.priceSource === priceSource ? comparison : null

  function compare(event: FormEvent) {
    event.preventDefault()
    const before = { effective: draft.before.effective.trim(), known: draft.before.known.trim() }
    const after = { effective: draft.after.effective.trim(), known: draft.after.known.trim() }
    try {
      const rows = core.compareUniverseRanks(membership, prices, baseline, before, after)
      setComparison({ before, after, baseline, membership, membershipSource, prices, priceSource, rows })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare universe ranks.')
    }
  }

  return <details className="research-details rank-comparison">
    <summary>Compare ranks at two cutoffs</summary>
    <form className="universe-query" aria-label="Rank comparison cutoffs" onSubmit={compare}>
      {(['before', 'after'] as const).map(side => {
        const heading = side === 'before' ? 'Before' : 'After'
        return <fieldset key={side}>
          <legend>{heading}</legend>
          {(['effective', 'known'] as const).map(time => <label key={time}>
            {heading} {time} (UTC)
            <input required value={draft[side][time]} spellCheck={false} autoComplete="off"
              onChange={event => setDraft({ ...draft, [side]: { ...draft[side], [time]: event.target.value } })} />
          </label>)}
          <button type="button" className="outline" onClick={() => setDraft({ ...draft, [side]: { effective, known } })}>
            Use current as {side}
          </button>
        </fieldset>
      })}
      <button className="outline">Compare ranks</button>
    </form>
    {error && <p role="alert" className="warning">{error}</p>}
    {comparison && !report && <p role="status">The prices, membership or baseline changed. Run the comparison again.</p>}
    {report && <>
      <p>Baseline {report.baseline}</p>
      <p>Before {report.before.effective} · Known {report.before.known}</p>
      <p>After {report.after.effective} · Known {report.after.known}</p>
      {!report.rows.length ? <p role="status">No members at either cutoff.</p> :
        <div className="replay-table-scroll">
          <table aria-label="Universe rank comparison" className="universe-table">
            <thead><tr>
              {['Listing', 'Instrument', 'Transition', 'Before rank', 'After rank', 'Places gained'].map(label =>
                <th scope="col" key={label}>{label}</th>)}
            </tr></thead>
            <tbody>{report.rows.map(row => <tr key={row.listingId}>
              <th scope="row">{row.listingId}</th>
              <td>{row.instrument}</td>
              <td>{movement(row)}</td>
              <RankCell leg={row.before} />
              <RankCell leg={row.after} />
              <td>{row.rankMove === null ? '—' : row.rankMove > 0 ? '+' + row.rankMove : row.rankMove}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <button type="button" className="outline" onClick={() => exportComparison(report)}>
        Download rank comparison CSV
      </button>
    </>}
  </details>
}
