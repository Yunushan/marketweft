import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Heatmap, HeatmapComparison, HeatmapListing, MarketCore, ScreenCutoff, SectorGroup } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'

type Cutoffs = { before: ScreenCutoff; after: ScreenCutoff }
type Sources = { membership: string; prices: string; metadata: string; baseline: string }
type Report = Sources & HeatmapComparison & { beforeCutoff: ScreenCutoff; afterCutoff: ScreenCutoff }
type ClassifiedListing = { sector: string | null; evidence: HeatmapListing }

const PAGE_SIZE = 50
const sides = ['before', 'after'] as const

function percentage(value: number | bigint | null) {
  return value === null ? '—' : fixed(BigInt(value), 4) + '%'
}

function listingEvidence(map: Heatmap) {
  return new Map(map.groups.flatMap(group => group.listings.map(evidence =>
    [evidence.listingId, { sector: group.sector, evidence }] as const)))
}

function ListingEvidence({ listing }: { listing?: ClassifiedListing }) {
  if (!listing) return 'Out of universe'
  const { sector, evidence } = listing
  return <>
    <strong>{sector ?? 'Unclassified'}</strong>
    <br />Weight {percentage(evidence.weight)} · Return {percentage(evidence.returnUnits)}
    {evidence.effectiveAt !== null && evidence.observedAt !== null && <>
      <br />Effective {utc(evidence.effectiveAt)}
      <br />Known {utc(evidence.observedAt)}
    </>}
  </>
}

function SectorEvidence({ group }: { group?: SectorGroup }) {
  if (!group) return 'No members'
  return <>
    {percentage(group.coveredWeight)} of {percentage(group.knownWeight)} covered
    <br />Weighted return {percentage(group.weightedReturn)}
    <br />Contribution {percentage(group.contribution)}
  </>
}

export function SectorHeatmapComparison({ core, membership, prices, metadata, baseline, effective, known }:
  Sources & { core: MarketCore; effective: string; known: string }) {
  const [cutoffs, setCutoffs] = useState<Cutoffs>(() => ({ before: { effective, known }, after: { effective, known } }))
  const [comparison, setComparison] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const result = comparison?.membership === membership && comparison.prices === prices &&
    comparison.metadata === metadata && comparison.baseline === baseline ? comparison : null

  function compare(event: FormEvent) {
    event.preventDefault()
    const before = { effective: cutoffs.before.effective.trim(), known: cutoffs.before.known.trim() }
    const after = { effective: cutoffs.after.effective.trim(), known: cutoffs.after.known.trim() }
    try {
      const snapshots = core.compareSectorHeatmaps(membership, prices, metadata, baseline, before, after)
      setComparison({ ...snapshots, beforeCutoff: before, afterCutoff: after, membership, prices, metadata, baseline })
      setPage(0)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare sector heatmaps.')
    }
  }

  const beforeGroups = new Map(result?.before.groups.map(group => [group.sector, group]))
  const afterGroups = new Map(result?.after.groups.map(group => [group.sector, group]))
  const sectors = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])]
    .sort((left, right) => left === null ? 1 : right === null ? -1 : left.localeCompare(right, 'en'))
  const beforeListings = result && listingEvidence(result.before)
  const afterListings = result && listingEvidence(result.after)
  const listingIds = beforeListings && afterListings ? [...new Set([...beforeListings.keys(), ...afterListings.keys()])].sort() : []
  const first = page * PAGE_SIZE
  const last = Math.min(first + PAGE_SIZE, listingIds.length)

  return <details className="research-details sector-comparison">
    <summary>Compare sector heatmaps at two cutoffs</summary>
    <form className="universe-query" aria-label="Sector heatmap comparison cutoffs" onSubmit={compare}>
      {sides.map(side => {
        const heading = side === 'before' ? 'Before' : 'After'
        return <fieldset key={side}>
          <legend>{heading}</legend>
          {(['effective', 'known'] as const).map(time => <label key={time}>
            {heading} {time} (UTC)
            <input required value={cutoffs[side][time]} spellCheck={false} autoComplete="off"
              onChange={event => setCutoffs({ ...cutoffs, [side]: { ...cutoffs[side], [time]: event.target.value } })} />
          </label>)}
          <button type="button" className="outline" onClick={() => setCutoffs({ ...cutoffs, [side]: { effective, known } })}>
            Use current as {side}
          </button>
        </fieldset>
      })}
      <button className="outline">Compare sectors</button>
    </form>
    {error && <p role="alert" className="warning">{error}</p>}
    {comparison && !result && <p role="status">A source or the baseline changed. Run the comparison again.</p>}
    {result && <>
      <p>Baseline {result.baseline}</p>
      <p>Before {result.beforeCutoff.effective} · Known {result.beforeCutoff.known}</p>
      <p>After {result.afterCutoff.effective} · Known {result.afterCutoff.known}</p>
      <div className="replay-table-scroll">
        <table aria-label="Sector heatmap comparison" className="universe-table">
          <thead><tr>{['Sector', 'Before', 'After'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            <tr>
              <th scope="row">Universe total</th>
              {sides.map(side => <td key={side}>
                {percentage(result[side].coveredWeight)} of {percentage(result[side].knownWeight)} covered
                <br />Contribution {percentage(result[side].contribution)}
              </td>)}
            </tr>
            {sectors.map(sector => <tr key={sector ?? ''}>
              <th scope="row">{sector ?? 'Unclassified'}</th>
              <td><SectorEvidence group={beforeGroups.get(sector)} /></td>
              <td><SectorEvidence group={afterGroups.get(sector)} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {listingIds.length === 0 ? <p role="status">No members at either cutoff.</p> : <details className="research-details">
        <summary>Listing evidence</summary>
        <div className="replay-table-scroll">
          <table aria-label="Sector classification comparison" className="universe-table">
            <thead><tr>{['Listing', 'Instrument', 'Before', 'After'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{listingIds.slice(first, last).map(id => {
              const left = beforeListings?.get(id)
              const right = afterListings?.get(id)
              return <tr key={id}>
                <th scope="row">{id}</th>
                <td>{(left ?? right)?.evidence.instrument}</td>
                <td><ListingEvidence listing={left} /></td>
                <td><ListingEvidence listing={right} /></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {listingIds.length > PAGE_SIZE && <div className="replay-actions">
          <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous listings</button>
          <span role="status">{first + 1}–{last} of {listingIds.length} listings</span>
          <button className="outline" disabled={last >= listingIds.length} onClick={() => setPage(page + 1)}>Next listings</button>
        </div>}
      </details>}
    </>}
  </details>
}
