import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, ScreenPrice, UniverseListing } from './market-core'
import { utc } from './workspace'
import { fixed } from './fixed-point'
import { SectorHeatmap } from './SectorHeatmap'
import { RelativeReturns } from './RelativeReturns'
import { JointScenarios } from './JointScenarios'
import { CrossSectionReplay } from './CrossSectionReplay'
import demoPrices from '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv?raw'

function PriceCell({ price }: { price: ScreenPrice | null }) {
  return price === null ? 'Missing' : (
    <>
      {fixed(price.ticks, 6)}
      <br />
      <small>Known {utc(price.observedAt)}</small>
    </>
  )
}

export function UniverseScreen({
  core, membership, membershipSource, listings, demo, firstCutoff, effective, known, initialPrices,
}: {
  core: MarketCore
  membership: string
  membershipSource: string
  listings: UniverseListing[]
  demo: boolean
  firstCutoff: string
  effective: string
  known: string
  initialPrices?: { csv: string; source: string }
}) {
  const [prices, setPrices] = useState<{ csv: string; source: string } | null>(initialPrices ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [baseline, setBaseline] = useState(firstCutoff)
  const [draft, setDraft] = useState(firstCutoff)
  const [error, setError] = useState('')

  const report = useMemo(() => {
    if (!prices) return null
    try {
      return { rows: core.universeScreen(membership, prices.csv, baseline, effective, known) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not rank this universe.' }
    }
  }, [core, prices, membership, baseline, effective, known])

  function attach(csv: string, source: string) {
    // Validate the complete file even if the current view has no members or a later baseline.
    core.universeScreen(membership, csv, effective, effective, known)
    setPrices({ csv, source })
    setError('')
  }

  function loadDemo() {
    try {
      attach(demoPrices, 'Synthetic close prices')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load demo prices.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Universe prices CSV exceeds 2 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      attach(csv, file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load price reports.')
    } finally {
      setBusy(false)
    }
  }

  function setBase(event: FormEvent) {
    event.preventDefault()
    if (!prices) return
    const value = draft.trim()
    try {
      core.universeScreen(membership, prices.csv, value, effective, known)
      setBaseline(value)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set the screen baseline.')
    }
  }

  const rows = report?.rows
  const ranked = rows?.filter((row) => row.rank !== null).length
  return (
    <section className="side-card replay-panel replay-results" aria-labelledby="universe-screen">
      <div className="replay-heading">
        <div>
          <h2 id="universe-screen">Universe screen</h2>
          <p>Rank current members by price return between two exact UTC closes.</p>
        </div>
        {demo && (
          <button className="outline" disabled={busy} onClick={loadDemo}>Load demo prices</button>
        )}
      </div>
      <form className="universe-query" onSubmit={load}>
        <label>
          Universe prices CSV
          <input type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={!file || busy}>Load prices</button>
      </form>
      {prices && (
        <>
          <form className="universe-query" onSubmit={setBase}>
            <label>
              Baseline time (UTC)
              <input required value={draft} spellCheck={false} autoComplete="off"
                onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button className="outline">Set baseline</button>
          </form>
          {rows && (
            <>
              <p role="status">{ranked} ranked · {rows.length - (ranked ?? 0)} unranked</p>
              <p>{prices.source} · Baseline {baseline}</p>
              {rows.length === 0 ? <p>No members at these cutoffs.</p> : (
                <div className="replay-table-scroll">
                  <table aria-label="Universe price rankings" className="universe-table">
                    <thead>
                      <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Listing</th>
                        <th scope="col">Instrument</th>
                        <th scope="col">Price return</th>
                        <th scope="col">Baseline close</th>
                        <th scope="col">Target close</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.listingId}>
                          <td>{row.rank ?? 'Unranked'}</td>
                          <th scope="row">{row.listingId}</th>
                          <td>{row.instrument}</td>
                          <td>{row.returnUnits === null ? '—' : fixed(row.returnUnits, 4) + '%'}</td>
                          <td><PriceCell price={row.baseline} /></td>
                          <td><PriceCell price={row.current} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
      {(report?.error || error) && (
        <p className="warning" role="alert">{report?.error || error}</p>
      )}
      {prices && <RelativeReturns core={core} membership={membership} membershipSource={membershipSource}
        prices={prices.csv} priceSource={prices.source} listings={listings} firstCutoff={firstCutoff}
        effective={effective} known={known} />}
      {prices && <JointScenarios core={core} membership={membership} membershipSource={membershipSource}
        prices={prices.csv} priceSource={prices.source} listings={listings} firstCutoff={firstCutoff}
        effective={effective} known={known} />}
      {prices && <CrossSectionReplay core={core} membership={membership} membershipSource={membershipSource}
        prices={prices.csv} priceSource={prices.source} firstCutoff={firstCutoff}
        effective={effective} known={known} demo={initialPrices !== undefined} />}
      {prices && <SectorHeatmap core={core} membership={membership} prices={prices.csv}
        baseline={baseline} effective={effective} known={known} demo={demo} />}
    </section>
  )
}
