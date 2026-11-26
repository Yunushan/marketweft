import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { parseSignedProviderRevisionFixture, sourcePermissionRestriction } from './catalog-schema'
import type { SignedProviderRevisionFixture } from './catalog-schema'
import { Chart } from './Chart'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import { checkImportRows, type ImportPolicy } from './import-policy'
import type { MarketCore } from './market-core'
import { MAX_PROVIDER_VERIFICATION_BYTES } from './provider-signature'
import { utc, type Asset } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-provider-withdrawals.csv?raw'

type Source = { csv: string; name: string; fixture?: SignedProviderRevisionFixture }

const DEMO: Source = { csv: demo, name: 'Synthetic provider revisions' }
const DEFAULT_EFFECTIVE = '2025-06-02T14:02:00Z'
const DEFAULT_KNOWN = '2025-06-02T14:03:59Z'
const DEFAULT_BAR = '2025-06-02T14:00:00Z'
const PAGE_SIZE = 100
const OHLCV = ['open', 'high', 'low', 'close', 'volume'] as const
const EXPIRED_GRANT = 'The provider revision fixture grant has expired.'
const REPLAY_CSV_HEADER = 'provider,venue,symbol,bar_at,observed_at,open,high,low,close,volume'

export function ProviderRevisionResearch({ core, policy, close }: {
  core: MarketCore; policy: ImportPolicy; close: () => void
}) {
  const [source, setSource] = useState(DEMO)
  const [effective, setEffective] = useState(DEFAULT_EFFECTIVE)
  const [known, setKnown] = useState(DEFAULT_KNOWN)
  const [view, setView] = useState(() => ({
    ...core.providerHistoryAsOf(DEMO.csv, DEFAULT_EFFECTIVE, DEFAULT_KNOWN),
    effectiveAt: DEFAULT_EFFECTIVE,
    knownAt: DEFAULT_KNOWN,
    barAt: DEFAULT_BAR,
    observations: core.providerBarObservations(DEMO.csv, DEFAULT_BAR, DEFAULT_EFFECTIVE, DEFAULT_KNOWN),
  }))
  const [page, setPage] = useState(0)
  const [barTime, setBarTime] = useState(DEFAULT_BAR)
  const [observationPage, setObservationPage] = useState(0)
  const [inspectionProblem, setInspectionProblem] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [signed, setSigned] = useState(false)
  const [verificationFile, setVerificationFile] = useState<File | null>(null)
  const [grantExpired, setGrantExpired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  useEffect(() => {
    if (!source.fixture) return
    const expiresAt = Date.parse(source.fixture.permissions.expiresOn + 'T00:00:00Z') + 86_400_000
    let timer: number | undefined
    function checkGrant() {
      window.clearTimeout(timer)
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) setGrantExpired(true)
      else timer = window.setTimeout(checkGrant, Math.min(remaining, 2_147_483_647))
    }
    checkGrant()
    window.addEventListener('focus', checkGrant)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', checkGrant)
    }
  }, [source])
  const expired = grantExpired ||
    sourcePermissionRestriction(source.fixture?.permissions, 'display') === 'expired'
  const chart = useMemo<Asset | null>(() => {
    if (view.bars.length === 0) return null
    const [venue, symbol] = view.instrument.split(':')
    return {
      id: view.instrument, venue, symbol, name: view.instrument, source: 'import',
      bars: view.bars.map(bar => ({
        time: bar.at,
        open: Number(bar.open) / 1e6,
        high: Number(bar.high) / 1e6,
        low: Number(bar.low) / 1e6,
        close: Number(bar.close) / 1e6,
        volume: Number(bar.volume) / 1e6,
      })),
    }
  }, [view])

  function apply(history: Source) {
    if (sourcePermissionRestriction(history.fixture?.permissions, 'display') === 'expired') throw Error(EXPIRED_GRANT)
    const effectiveAt = effective.trim()
    const knownAt = known.trim()
    const snapshot = core.providerHistoryAsOf(history.csv, effectiveAt, knownAt)
    if (history.fixture && (history.fixture.provider !== snapshot.provider || history.fixture.instrument !== snapshot.instrument))
      throw Error('The provider revision CSV identity does not match the signed fixture.')
    const observations = core.providerBarObservations(history.csv, view.barAt, effectiveAt, knownAt)
    setSource(history)
    setGrantExpired(false)
    setView({ ...snapshot, effectiveAt, knownAt, barAt: view.barAt, observations })
    setPage(0)
    setObservationPage(0)
    setProblem('')
  }

  function exportReplay() {
    const restriction = sourcePermissionRestriction(source.fixture?.permissions, 'redistribution')
    if (restriction === 'expired') {
      setProblem(EXPIRED_GRANT)
      return
    }
    if (restriction === 'permission') {
      setProblem('Provider replay CSV export requires granted redistribution permission.')
      return
    }
    const [venue, symbol] = view.instrument.split(':')
    const rows = view.bars.map(bar => [
      view.provider, venue, symbol, utc(bar.at), utc(bar.observedAt),
      ...OHLCV.map(field => fixed(bar[field], 6)),
    ].join(','))
    const identity = (venue + '-' + symbol).replace(/[^A-Z0-9._-]/g, '_')
    const effective = view.effectiveAt.replace(/[-:]/g, '')
    const known = view.knownAt.replace(/[-:]/g, '')
    downloadFile(`${identity}-effective-${effective}-known-${known}.csv`,
      new Blob([[REPLAY_CSV_HEADER, ...rows, ''].join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    setProblem('')
  }

  function replay(event: FormEvent) {
    event.preventDefault()
    try {
      apply(source)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not replay provider revisions.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file || loading || (signed && !verificationFile)) return
    setLoading(true)
    try {
      if (file.size > policy.maxBytes)
        throw Error(`Choose a ${signed ? 'fixture' : 'CSV'} of at most ${policy.maxBytes.toLocaleString('en-US')} bytes.`)
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      let history: Source = { csv: text, name: file.name }
      if (signed && verificationFile) {
        if (verificationFile.size > MAX_PROVIDER_VERIFICATION_BYTES)
          throw Error('The provider verification file exceeds 64 KiB.')
        const fixture = await parseSignedProviderRevisionFixture(text, await verificationFile.text(), core)
        history = { csv: fixture.csv, name: file.name, fixture }
      }
      checkImportRows(history.csv, policy)
      apply(history)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load provider revisions.')
    } finally {
      setLoading(false)
    }
  }

  function inspect(event: FormEvent) {
    event.preventDefault()
    const barAt = barTime.trim()
    try {
      if (sourcePermissionRestriction(source.fixture?.permissions, 'display') === 'expired') throw Error(EXPIRED_GRANT)
      const observations = core.providerBarObservations(source.csv, barAt, view.effectiveAt, view.knownAt)
      setView({ ...view, barAt, observations })
      setObservationPage(0)
      setInspectionProblem('')
    } catch (error) {
      setInspectionProblem(error instanceof Error ? error.message : 'Could not inspect this bar.')
    }
  }

  const totalPages = Math.ceil(view.bars.length / PAGE_SIZE)
  const bars = view.bars.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const observationPages = Math.ceil(view.observations.length / PAGE_SIZE)
  const observations = view.observations.slice(observationPage * PAGE_SIZE, (observationPage + 1) * PAGE_SIZE)
  return <>
    <header className="app-header">
      <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
      <button className="outline" onClick={close}>Return to workspace</button>
    </header>
    <main className="replay-page">
      <div className="page-head"><h1 ref={title} tabIndex={-1}>Provider revisions</h1></div>
      <section className="side-card replay-panel" aria-label="Provider revision controls">
        <form className="universe-query" onSubmit={load}>
          <label>Provider revision input
            <select value={signed ? 'signed' : 'csv'} disabled={loading} onChange={event => {
              setSigned(event.target.value === 'signed')
              setFile(null)
              setVerificationFile(null)
              setProblem('')
            }}>
              <option value="csv">CSV file</option>
              <option value="signed">Signed provider revision fixture</option>
            </select>
          </label>
          <label>{signed ? 'Signed provider revision fixture' : 'Provider revisions CSV'}
            <input key={signed ? 'signed' : 'csv'} type="file" accept={signed ? '.json,application/json' : '.csv,text/csv'} disabled={loading}
              onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </label>
          {signed && <label>Provider revision verification key
            <input type="file" accept=".pem,.json,application/json" disabled={loading}
              onChange={event => setVerificationFile(event.target.files?.[0] ?? null)} />
          </label>}
          <button className="outline" disabled={!file || loading || (signed && !verificationFile)}>Load revisions</button>
        </form>
        <form className="universe-query" onSubmit={replay}>
          <label>Bars effective through (UTC)
            <input required disabled={loading} value={effective} onChange={event => setEffective(event.target.value)} />
          </label>
          <label>Revisions known through (UTC)
            <input required disabled={loading} value={known} onChange={event => setKnown(event.target.value)} />
          </label>
          <button className="primary" disabled={loading || expired}>Replay cutoffs</button>
        </form>
        {(problem || expired) && <p role="alert" className="warning">{problem || EXPIRED_GRANT}</p>}
      </section>
      {!expired && <section className="side-card replay-panel" aria-label="Observed provider history">
        <h2>{view.instrument}</h2>
        <p role="status">{view.provider} · {source.name} · {view.bars.length} observed {view.bars.length === 1 ? 'bar' : 'bars'}</p>
        {source.fixture && <p>Verified provider grant {source.fixture.grant} · Expires {source.fixture.permissions.expiresOn} UTC</p>}
        {source.fixture && <details className="provider-replay-verification">
          <summary>Verification details</summary>
          <dl>
            <dt>Source CSV SHA-256</dt><dd><code>{source.fixture.csvSha256}</code></dd>
            <dt>Signer key SHA-256</dt><dd><code>{source.fixture.keySha256}</code></dd>
          </dl>
        </details>}
        <p>Effective through {view.effectiveAt} · Known through {view.knownAt}</p>
        {view.bars.length > 0 && <div className="replay-controls">
          <button className="outline" disabled={loading} onClick={exportReplay}>Download replay CSV</button>
        </div>}
        {chart && <section aria-label="Provider replay chart">
          <Chart key={[view.instrument, view.effectiveAt, view.knownAt, view.bars.length].join('/')}
            asset={chart} sma={[]} ema={[]} observedAt={view.bars.map(bar => bar.observedAt)} />
        </section>}
        {bars.length === 0 ? <p>No bars meet these cutoffs.</p> : (
          <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable provider history">
            <table className="universe-table" aria-label="Provider history bars">
              <thead><tr>{['Bar UTC', 'Observed UTC', 'Open', 'High', 'Low', 'Close', 'Volume'].map(label =>
                <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{bars.map(bar => <tr key={bar.at}>
                <th scope="row">{utc(bar.at)}</th><td>{utc(bar.observedAt)}</td>
                {OHLCV.map(field => <td key={field}>{fixed(bar[field], 6)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && <div className="replay-controls">
          <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous bars</button>
          <p>{page + 1} / {totalPages}</p>
          <button className="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Next bars</button>
        </div>}
      </section>}
      {!expired && <section className="side-card replay-panel" aria-labelledby="provider-observation-heading">
        <h2 id="provider-observation-heading">Bar observation history</h2>
        <form className="universe-query" onSubmit={inspect}>
          <label>Bar timestamp (UTC)
            <input required disabled={loading} value={barTime} onChange={event => setBarTime(event.target.value)} />
          </label>
          <button className="outline" disabled={loading}>Inspect bar</button>
        </form>
        {inspectionProblem && <p role="alert" className="warning">{inspectionProblem}</p>}
        <p role="status">{view.observations.length} {view.observations.length === 1 ? 'observation' : 'observations'} for {view.barAt}</p>
        {observations.length === 0 ? <p>No bar observations meet these cutoffs.</p> : (
          <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable bar observations">
            <table className="universe-table" aria-label="Provider bar observations">
              <thead><tr>{['Observed UTC', 'Action', 'Open', 'High', 'Low', 'Close', 'Volume'].map(label =>
                <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{observations.map(({ observedAt, bar }) => <tr key={observedAt}>
                <th scope="row">{utc(observedAt)}</th>
                <td>{bar ? 'Upsert' : 'Withdraw'}</td>
                {OHLCV.map(field => <td key={field}>{bar ? fixed(bar[field], 6) : '—'}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        )}
        {observationPages > 1 && <div className="replay-controls">
          <button className="outline" disabled={observationPage === 0}
            onClick={() => setObservationPage(observationPage - 1)}>Previous observations</button>
          <p>{observationPage + 1} / {observationPages}</p>
          <button className="outline" disabled={observationPage + 1 >= observationPages}
            onClick={() => setObservationPage(observationPage + 1)}>Next observations</button>
        </div>}
      </section>}
    </main>
  </>
}
