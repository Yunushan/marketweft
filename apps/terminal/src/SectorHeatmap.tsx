import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { MarketCore, SectorGroup } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import { SectorHeatmapComparison } from './SectorHeatmapComparison'
import demoSectors from '../../../crates/core/tests/fixtures/synthetic-universe-sectors.csv?raw'

function percent(units: bigint | number | null, missing = 'Missing'): string {
  return units === null ? missing : fixed(BigInt(units), 4) + '%'
}

function heat(value: bigint | null): string {
  if (value === null) return 'missing'
  if (value === 0n) return 'flat'
  return value > 0n ? 'gain' : 'loss'
}

function intensity(value: bigint | null): string {
  const magnitude = value === null ? 0n : value < 0n ? -value : value
  return Math.min(100, 28 + Number(magnitude > 100000n ? 100000n : magnitude) * 0.00072) + '%'
}

function SectorTiles({ group }: { group: SectorGroup }) {
  return (
    <section className="sector-group" aria-label={group.sector ?? 'Unclassified'}>
      <header className="sector-group-heading">
        <h4>{group.sector ?? 'Unclassified'}</h4>
        <p>{percent(group.coveredWeight)} of {percent(group.knownWeight)} weight covered</p>
        <p>Weighted return <strong>{percent(group.weightedReturn, '—')}</strong></p>
        <p>Contribution <strong>{percent(group.contribution, '—')}</strong></p>
      </header>
      <ul className="sector-tiles">
        {group.listings.map((listing) => (
          <li key={listing.listingId} className="sector-tile" data-return={heat(listing.returnUnits)}
            style={{
              '--tile-weight': listing.weight ?? 0,
              '--tile-intensity': intensity(listing.returnUnits),
            } as CSSProperties}>
            <details>
              <summary>
                <strong>{listing.instrument}</strong>
                <span>{percent(listing.returnUnits)} return</span>
                <span>{listing.listingId} · {percent(listing.weight)} weight</span>
              </summary>
              <dl>
                <div><dt>Screen rank</dt><dd>{listing.rank ?? 'Unranked'}</dd></div>
                <div><dt>Contribution</dt><dd>{percent(listing.contribution, '—')}</dd></div>
                {listing.effectiveAt !== null && listing.observedAt !== null && (
                  <>
                    <div><dt>Classification effective</dt><dd>{utc(listing.effectiveAt)}</dd></div>
                    <div><dt>Classification known</dt><dd>{utc(listing.observedAt)}</dd></div>
                  </>
                )}
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SectorHeatmap({ core, membership, prices, baseline, effective, known, demo }: {
  core: MarketCore
  membership: string
  prices: string
  baseline: string
  effective: string
  known: string
  demo: boolean
}) {
  const [metadata, setMetadata] = useState<{ csv: string; source: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const result = useMemo(() => {
    if (!metadata) return null
    try {
      return { map: core.sectorHeatmap(membership, prices, metadata.csv, baseline, effective, known) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not build the sector heatmap.' }
    }
  }, [core, membership, prices, metadata, baseline, effective, known])

  function attach(csv: string, source: string) {
    core.sectorHeatmap(membership, prices, csv, effective, effective, known)
    setMetadata({ csv, source })
  }

  function loadDemo() {
    setError('')
    try {
      attach(demoSectors, 'Synthetic sector and weight reports')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open demo sectors.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 1024 * 1024) throw new Error('Sector and weight CSV exceeds 1 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      attach(csv, file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sector reports.')
    } finally {
      setBusy(false)
    }
  }

  const map = result?.map
  const missingWeights = map?.groups.reduce(
    (count, group) => count + group.listings.filter((row) => row.weight === null).length, 0,
  )
  return (
    <section className="sector-heatmap" aria-labelledby="sector-heatmap-heading">
      <div className="replay-heading">
        <div>
          <h3 id="sector-heatmap-heading">Sector heatmap</h3>
          <p>Group the screened listings by their known sectors and weights.</p>
        </div>
        {demo && <button className="outline" disabled={busy} onClick={loadDemo}>Load demo sectors</button>}
      </div>
      <form className="universe-query" onSubmit={load}>
        <label>
          Sector and weight CSV
          <input type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={!file || busy}>Load sectors</button>
      </form>
      {metadata && <SectorHeatmapComparison core={core} membership={membership} prices={prices}
        metadata={metadata.csv} baseline={baseline} effective={effective} known={known} />}
      {(result?.error || error) && <p className="warning" role="alert">{result?.error || error}</p>}
      {map && (
        <>
          <p className="heatmap-totals" role="status">
            <span>Known weight <strong>{percent(map.knownWeight)}</strong></span>
            <span>Covered weight <strong>{percent(map.coveredWeight)}</strong></span>
            <span>Listings missing weight <strong>{missingWeights}</strong></span>
            <span>Observed contribution <strong>{percent(map.contribution, '—')}</strong></span>
          </p>
          <p>{metadata?.source}</p>
          <p>Tile width follows known weight. Color shows return and stripes mark a missing return.</p>
          {map.groups.length === 0 && <p>No members at these cutoffs.</p>}
          {map.groups.map((group) => <SectorTiles key={group.sector ?? ''} group={group} />)}
        </>
      )}
    </section>
  )
}
