import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DelistingValuation, MarketCore } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoTerms from '../../../crates/core/tests/fixtures/synthetic-delisting-terms.csv?raw'

const stateLabels = {
  unobserved: 'Listing unobserved',
  shares: 'Holding shares',
  'missing-proceeds': 'Proceeds unavailable',
  receivable: 'Cash receivable',
  paid: 'Cash settled',
}
type Position = { terms: string; listing: string; shares: number }

export function DelistingReplay({ core, membership, demo, effective, known }: {
  core: MarketCore; membership: string; demo: boolean; effective: string; known: string
}) {
  const [position, setPosition] = useState<Position | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [listing, setListing] = useState(demo ? 'BETA-001' : '')
  const [shares, setShares] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upload = useRef<HTMLInputElement>(null)
  const result = useMemo(() => {
    if (!position) return null
    try {
      return { value: core.delistingAsOf(membership, position.terms, position.listing, position.shares, effective, known) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not value the delisting.' }
    }
  }, [core, effective, known, membership, position])

  function apply(terms: string, id: string, quantity: number) {
    core.delistingAsOf(membership, terms, id, quantity, effective, known)
    setPosition({ terms, listing: id, shares: quantity })
    setError('')
  }

  function startDemo() {
    try {
      apply(demoTerms, 'BETA-001', 10)
      setListing('BETA-001')
      setShares('10')
      setFile(null)
      if (upload.current) upload.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the delisting demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      if (file && file.size > 1024 * 1024) throw new Error('Delisting terms CSV exceeds 1 MiB.')
      const terms = file ? new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) : position?.terms
      if (!terms) throw new Error('Supply a delisting terms report.')
      apply(terms, listing.trim(), Number(shares))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load delisting terms.')
    } finally {
      setBusy(false)
    }
  }

  const message = error || result?.error
  return (
    <section className="side-card replay-panel replay-results" aria-labelledby="delisting-title">
      <div className="replay-heading">
        <div><h2 id="delisting-title">Delisting proceeds</h2><p>Value an existing holding under the universe cutoffs.</p></div>
        {demo && <button className="outline" onClick={startDemo} disabled={busy}>Load delisting demo</button>}
      </div>
      <form className="universe-query" onSubmit={load}>
        <label>Listing ID
          <input required value={listing} onChange={event => setListing(event.target.value)} />
        </label>
        <label>Shares held before delisting
          <input required type="number" min="0" max="1000000" value={shares}
            onChange={event => setShares(event.target.value)} />
        </label>
        <label>Delisting terms CSV
          <input ref={upload} type="file" accept=".csv,text/csv"
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="outline" disabled={busy || (!file && !position)}>Apply delisting terms</button>
      </form>
      {message && <p className="warning replay-error" role="alert">{message}</p>}
      {result?.value && position && (
        <DelistingResult listing={position.listing} value={result.value}
          ledgerThrough={effective < known ? effective : known} />
      )}
    </section>
  )
}

function DelistingResult({ listing, value, ledgerThrough }: {
  listing: string; value: DelistingValuation; ledgerThrough: string
}) {
  const { offer, change, reference } = value
  return (
    <>
      <p role="status">{listing} · {stateLabels[value.state]}</p>
      <dl className="replay-times">
        <div><dt>Ordinary shares</dt><dd>{value.ordinaryShares}</dd></div>
        <div><dt>Entitled shares</dt><dd>{value.entitledShares}</dd></div>
        {change && <>
          <div><dt>Delisting effective (UTC)</dt><dd>{utc(change.effectiveAt)}</dd></div>
          <div><dt>Delisting observed (UTC)</dt><dd>{utc(change.observedAt)}</dd></div>
        </>}
        {value.termsAt !== undefined && <div><dt>Terms observed (UTC)</dt><dd>{utc(value.termsAt)}</dd></div>}
        <div><dt>Cash value</dt><dd>{offer ? fixed(offer.total, 6) + ' ' + offer.currency : 'Unavailable'}</dd></div>
        {offer && <div><dt>Pay date (UTC)</dt><dd>{offer.payAt === null ? 'Unscheduled' : utc(offer.payAt)}</dd></div>}
        {reference && <div><dt>Reference close</dt><dd>{fixed(reference.price, 6)} {reference.currency} · {utc(reference.at)}</dd></div>}
        <div><dt>Delisting return</dt><dd>{value.returnPctMicros === undefined ? 'Unavailable' : fixed(value.returnPctMicros, 6) + '%'}</dd></div>
      </dl>
      <h3>Cash postings through {ledgerThrough}</h3>
      {value.ledger.length === 0 ? <p>No cash postings through this cutoff.</p> : (
        <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Delisting cash postings">
            <thead><tr><th scope="col">Observed UTC</th><th scope="col">Currency</th>
              <th scope="col">Cash change</th><th scope="col">Cash balance</th></tr></thead>
            <tbody>{value.ledger.map(row => (
              <tr key={row.at + ':' + row.currency}>
                <th scope="row">{utc(row.at)}</th><td>{row.currency}</td>
                <td>{fixed(row.delta, 6)}</td><td>{fixed(row.balance, 6)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
