import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AlertCrossing, MarketCore } from './market-core'
import { readAlertInbox, readObservationGrant, saveAlerts, updateObservationGrant } from './alert-inbox'
import type { AlertInboxRecord } from './alert-inbox'
import type { History } from './catalog-schema'
import { downloadFile } from './download'
import { crossingAlertEvent, readObservationGrantFile, requireObservationAccess } from './crossing-alert-export'
import type { CrossingAlertSource, ObservationGrant } from './crossing-alert-export'
import { patternAlertEvent } from './pattern-alert-export'
import { patternNames, type PatternAlert } from './pattern-alert'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { sha256Bytes } from './sha256'
import { utc } from './workspace'
import demoRules from '../../../crates/core/tests/fixtures/synthetic-alert-rules.csv?raw'
import demoObservations from '../../../crates/core/tests/fixtures/synthetic-alert-observations.csv?raw'

type Query = { effective: string; known: string }
type Source = { rules: string; observations: string; title: string; demo: boolean; proof?: CrossingAlertSource }

function requireReplayAccess(grant: ObservationGrant, current: ObservationGrant | undefined) {
  requireObservationAccess(grant, current, 'display')
  requireObservationAccess(grant, current, 'automatedUse')
}

function PatternAlertRow({ row, download, exporting }: {
  row: PatternAlert
  download?: (alert: AlertInboxRecord) => void
  exporting?: boolean
}) {
  return (
    <tr>
      <th scope="row">{row.id}</th>
      <td>{row.rule.series}</td>
      <td>{patternNames[row.rule.pattern]}</td>
      <td>{utc(row.current.measuredAt)}</td>
      <td>{utc(row.current.observedAt)}</td>
      <td className="alert-evidence">
        <details>
          <summary>Show evidence</summary>
          <dl>
            <div><dt>Rule revision</dt><dd>{row.rule.revision}</dd></div>
            <div><dt>Replay context digest</dt><dd>{row.rule.contextDigest}</dd></div>
            <div><dt>Bar interval</dt><dd>{row.rule.interval} seconds</dd></div>
            {[row.previous, row.current].map((bar, index) => bar && (
              <div key={bar.measuredAt}>
                <dt>{index === 0 ? 'Previous' : 'Current'} OHLCV</dt>
                <dd>{utc(bar.measuredAt)} · known {utc(bar.observedAt)}</dd>
                <dd>{Object.values(bar.ticks).map(ticks => fixed(BigInt(ticks), 6)).join(' / ')}</dd>
              </div>
            ))}
          </dl>
          {download && <button className="outline" disabled={exporting} onClick={() => download(row)}>
            Download webhook event
          </button>}
        </details>
      </td>
    </tr>
  )
}

function AlertTable({ title, rows, download, exporting }: {
  title: string
  rows: AlertInboxRecord[]
  download?: (alert: AlertInboxRecord) => void
  exporting?: boolean
}) {
  return (
    <div className="replay-table-scroll">
      <table className="universe-table" aria-label={title}>
        <thead><tr><th scope="col">Alert</th><th scope="col">Series</th><th scope="col">Trigger</th>
          <th scope="col">Measured UTC</th><th scope="col">Observed UTC</th><th scope="col">Evidence</th></tr></thead>
        <tbody>
          {rows.map(row => 'type' in row ? <PatternAlertRow key={row.id} row={row} download={download} exporting={exporting} /> : (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              <td>{row.rule.series}</td>
              <td>Crossed {row.direction}</td>
              <td>{utc(row.current.measuredAt)}</td>
              <td>{utc(row.current.observedAt)}</td>
              <td className="alert-evidence">
                <details>
                  <summary>Show evidence</summary>
                  <dl>
                    <div><dt>Rule revision</dt><dd>{row.rule.revision}</dd></div>
                    <div><dt>Rule effective</dt><dd>{utc(row.rule.effectiveAt)}</dd></div>
                    <div><dt>Rule observed</dt><dd>{utc(row.rule.observedAt)}</dd></div>
                    <div><dt>Comparator</dt><dd>{row.rule.kind === 'sma'
                      ? row.rule.operand + '-sample SMA' : 'Threshold ' + fixed(BigInt(row.rule.operand), 6)}</dd></div>
                    {[row.previous, row.current].map((observation, index) => (
                      <div key={observation.id}>
                        <dt>{index === 0 ? 'Previous' : 'Current'} observation</dt>
                        <dd>{observation.id} · {fixed(BigInt(observation.ticks), 6)} · known {utc(observation.observedAt)}</dd>
                        <dd>Comparator {fixed(BigInt(observation.comparisonNumerator), 6)} ÷ {observation.comparisonCount}</dd>
                      </div>
                    ))}
                  </dl>
                  {download && row.source && <button className="outline" disabled={exporting} onClick={() => download(row)}>
                    Download webhook event
                  </button>}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AlertReplay({ core, close, readHistory }: {
  core: MarketCore
  close: () => void
  readHistory: (id: string) => Promise<History | undefined>
}) {
  const [source, setSource] = useState<Source | null>(null)
  const [draft, setDraft] = useState<Query>({ effective: '', known: '' })
  const [preview, setPreview] = useState<(Query & { alerts: AlertCrossing[] }) | null>(null)
  const [rulesFile, setRulesFile] = useState<File | null>(null)
  const [observationsFile, setObservationsFile] = useState<File | null>(null)
  const [observationGrantFile, setObservationGrantFile] = useState<File | null>(null)
  const [grantUpdateFile, setGrantUpdateFile] = useState<File | null>(null)
  const [updatingGrant, setUpdatingGrant] = useState(false)
  const [grantStatus, setGrantStatus] = useState('')
  const [inbox, setInbox] = useState<{ total: number; recent: AlertInboxRecord[] }>({ total: 0, recent: [] })
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [inboxError, setInboxError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  async function download(alert: AlertInboxRecord) {
    if (exporting || updatingGrant) return
    setExporting(true)
    setInboxError('')
    try {
      const event = 'type' in alert
        ? await patternAlertEvent(alert, readHistory)
        : await crossingAlertEvent(alert, readObservationGrant)
      const filename = 'type' in alert ? 'marketweft-candlestick-event.json' : 'marketweft-crossing-event.json'
      downloadFile(filename, new Blob([event], { type: 'application/json' }))
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Could not export the webhook event.')
    } finally {
      setExporting(false)
    }
  }

  async function applyGrant(event: FormEvent) {
    event.preventDefault()
    if (!grantUpdateFile || updatingGrant || exporting) return
    setUpdatingGrant(true)
    setGrantStatus('')
    setInboxError('')
    try {
      const grant = await readObservationGrantFile(grantUpdateFile)
      await updateObservationGrant(grant)
      setGrantStatus('Observation source grant updated.')
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Could not update the observation source grant.')
    } finally {
      setUpdatingGrant(false)
    }
  }

  async function refresh() {
    try {
      setInbox(await readAlertInbox())
      setInboxError('')
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Could not read the inbox.')
    }
  }

  useEffect(() => {
    heading.current?.focus()
    void refresh()
  }, [])

  function run(inputs: Source, cutoffs: Query) {
    const query = { effective: cutoffs.effective.trim(), known: cutoffs.known.trim() }
    const alerts = core.alertReplay(inputs.rules, inputs.observations, query.effective, query.known)
    setDraft(query)
    setPreview({ ...query, alerts })
    setSaved('')
    setError('')
  }

  function start(rules: string, observations: string, title: string, demo = false, proof?: CrossingAlertSource) {
    const lastObserved = core.alertIndex(rules, observations)
    const inputs = { rules, observations, title, demo, proof }
    const at = demo ? '2025-04-03T14:00:00Z' : utc(lastObserved)
    run(inputs, { effective: at, known: at })
    setSource(inputs)
  }

  function startDemo() {
    try {
      start(demoRules, demoObservations, 'Synthetic alert rules and observations', true, { kind: 'fixture' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the alert demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!rulesFile || !observationsFile) return
    setBusy(true)
    setError('')
    try {
      const read = (file: File) => {
        if (file.size > 1024 * 1024) throw new Error('Each alert CSV must fit within 1 MiB.')
        return file.arrayBuffer()
      }
      const [ruleBytes, observationBytes] = await Promise.all([read(rulesFile), read(observationsFile)])
      const decoder = new TextDecoder('utf-8', { fatal: true })
      const rules = decoder.decode(ruleBytes)
      const observations = decoder.decode(observationBytes)
      let proof: CrossingAlertSource | undefined
      if (observationGrantFile) {
        const grant = await readObservationGrantFile(observationGrantFile)
        if (await sha256Bytes(observationBytes) !== grant.digest)
          throw Error('The observation CSV does not match the source grant SHA-256.')
        requireReplayAccess(grant, grant)
        await updateObservationGrant(grant)
        proof = { kind: 'observations', grant }
      }
      start(rules, observations, rulesFile.name + ' · ' + observationsFile.name, false, proof)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load alert reports.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(query: Query) {
    if (!source || busy) return
    setBusy(true)
    try {
      if (source.proof?.kind === 'observations') {
        const { grant } = source.proof
        requireReplayAccess(grant, await readObservationGrant(grant))
      }
      run(source, query)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not replay alert rules.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!preview || saving) return
    setSaving(true)
    setInboxError('')
    setSaved('')
    try {
      const proof = source?.proof
      const inserted = await saveAlerts(proof ? preview.alerts.map(alert => ({ ...alert, source: proof })) : preview.alerts)
      setSaved(inserted + (inserted === 1 ? ' new alert saved.' : ' new alerts saved.'))
      await refresh()
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Could not save alert records.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Replay alerts</h1></div>
        {!source || !preview ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Alert demo</h2>
              <p>Follow a threshold crossing, an observation correction and a moving-average crossing.</p>
              <button className="primary" disabled={busy} onClick={startDemo}>Start alert demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open alert data</h2>
              <label>Alert rules CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={event => setRulesFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>Alert observations CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={event => setObservationsFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>Alert observation grant JSON (optional)
                <input type="file" accept=".json,application/json" disabled={busy}
                  onChange={event => setObservationGrantFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !rulesFile || !observationsFile}>Load alert data</button>
            </form>
          </div>
        ) : (
          <section className="side-card replay-panel replay-results" aria-labelledby="alert-preview">
            <div className="replay-heading">
              <div><h2 id="alert-preview">Alert preview</h2><p>{source.title}</p></div>
              <button className="outline" disabled={saving || busy} onClick={() => {
                setSource(null)
                setPreview(null)
                setRulesFile(null)
                setObservationsFile(null)
                setObservationGrantFile(null)
                setError('')
                setSaved('')
                heading.current?.focus()
              }}>Change alert data</button>
            </div>
            <form className="universe-query" onSubmit={event => { event.preventDefault(); void submit(draft) }}>
              <label>Effective time (UTC)
                <input required value={draft.effective} spellCheck={false} autoComplete="off"
                  onChange={event => setDraft({ ...draft, effective: event.target.value })} />
              </label>
              <label>Known time (UTC)
                <input required value={draft.known} spellCheck={false} autoComplete="off"
                  onChange={event => setDraft({ ...draft, known: event.target.value })} />
              </label>
              <button className="primary" disabled={saving || busy}>Run alert replay</button>
            </form>
            {source.demo && (
              <div className="replay-controls">
                {[
                  ['First crossing', '14:02:00'],
                  ['Correction observed', '14:03:00'],
                  ['Full alert replay', '14:08:00'],
                ].map(([label, time]) => {
                  const at = '2025-04-03T' + time + 'Z'
                  return <button className="outline" disabled={saving || busy} key={time}
                    onClick={() => void submit({ effective: at, known: at })}>{label}</button>
                })}
              </div>
            )}
            <p role="status">{preview.alerts.length} crossings · Effective {preview.effective} · Known {preview.known}</p>
            {preview.alerts.length > 100 && <p>Showing the first 100 crossings. Saving includes the full replay.</p>}
            {preview.alerts.length > 0 && <AlertTable title="Alert preview" rows={preview.alerts.slice(0, 100)} />}
            <button className="primary" disabled={saving || busy || !preview.alerts.length} onClick={() => void save()}>
              Save to alert inbox
            </button>
          </section>
        )}
        {error && <p className="warning replay-error" role="alert">{error}</p>}
        <section className="side-card replay-panel replay-results" aria-labelledby="alert-inbox">
          <div className="replay-heading">
            <div><h2 id="alert-inbox">Alert inbox</h2><p>{inbox.total} saved alerts</p></div>
            <button className="outline" disabled={saving} onClick={() => void refresh()}>Refresh inbox</button>
          </div>
          {saved && <p role="status">{saved}</p>}
          {inboxError && <p className="warning" role="alert">{inboxError}</p>}
          <details className="research-details">
            <summary>Manage observation source grant</summary>
            <form className="universe-query" onSubmit={applyGrant}>
              <label>Current observation grant JSON
                <input type="file" accept=".json,application/json" disabled={updatingGrant}
                  onChange={event => setGrantUpdateFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="outline" disabled={!grantUpdateFile || updatingGrant || exporting}>Apply observation grant</button>
            </form>
            {grantStatus && <p role="status">{grantStatus}</p>}
          </details>
          {inbox.total > inbox.recent.length && <p>Showing the 100 most recent alerts.</p>}
          {inbox.recent.length > 0 && <AlertTable title="Saved alerts" rows={inbox.recent} download={alert => void download(alert)} exporting={exporting || updatingGrant} />}
        </section>
      </main>
    </>
  )
}
