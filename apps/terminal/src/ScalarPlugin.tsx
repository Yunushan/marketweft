import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SourceRights } from './catalog-schema'
import { sourcePermissionRestriction } from './catalog-schema'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed, parsePriceSize } from './fixed-point'
import { MAX_SCALAR_PLUGIN_SERIES_BARS } from './market-core'
import type { MarketCore, ScalarPluginPoint } from './market-core'
import type { Asset } from './workspace'
import { utc } from './workspace'

type PluginResult = { name: string; digest: string; input: bigint; output: bigint }

async function loadScalarModule(file: File) {
  if (file.size > 64 * 1024) throw new Error('Scalar plugin exceeds 64 KiB.')
  const bytes = await file.arrayBuffer()
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
  return { name: file.name, digest, module: new Uint8Array(bytes) }
}

export function ScalarPlugin({ core }: { core: MarketCore }) {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PluginResult | null>(null)
  const [error, setError] = useState('')

  async function run(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const value = source.trim()
      const magnitude = parsePriceSize(value.replace(/^-/, ''))
      if (magnitude === null) throw new Error('Enter a signed number with up to six decimal places.')
      const input = value.startsWith('-') ? -magnitude : magnitude
      const { name, digest, module } = await loadScalarModule(file)
      const output = core.evaluateScalarPlugin(module, input)
      setResult({ name, digest, input, output })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not evaluate the scalar plugin.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="research-details">
    <summary>Scalar Wasm plugin</summary>
    <form className="formula-form" aria-label="Scalar Wasm plugin" onSubmit={run}>
      <p>Run a local plugin on one signed decimal value. The plugin runs with fixed memory and execution limits.</p>
      <div className="universe-query">
        <label>WebAssembly module
          <input type="file" accept=".wasm,application/wasm" required disabled={busy}
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <label>Plugin input
          <input value={source} maxLength={21} required disabled={busy}
            onChange={event => setSource(event.target.value)} />
        </label>
        <button className="outline" disabled={busy || !file}>Run scalar plugin</button>
      </div>
      {error && <p role="alert" className="warning">{error}</p>}
      {result && <div role="status">
        <p>{result.name} transformed {fixed(result.input, 6)} to <strong>{fixed(result.output, 6)}</strong>.</p>
        <p className="formula-source">SHA-256 {result.digest}</p>
      </div>}
    </form>
  </details>
}

type SeriesReport = {
  instrument: string
  source: string
  name: string
  digest: string
  from: string
  through: string
  sourceRights?: SourceRights
  rows: ScalarPluginPoint[]
}

function utcSecond(value: string) {
  const at = Date.parse(value) / 1000
  if (!Number.isSafeInteger(at) || utc(at) !== value)
    throw new Error('Use UTC timestamps like 2025-06-03T14:00:00Z.')
  return at
}

export function ScalarPluginSeries({ core, asset, sourceLabel, sourceRights }: {
  core: MarketCore
  asset: Asset
  sourceLabel: string
  sourceRights?: SourceRights
}) {
  const [file, setFile] = useState<File | null>(null)
  const [from, setFrom] = useState(() =>
    utc(asset.bars[Math.max(0, asset.bars.length - MAX_SCALAR_PLUGIN_SERIES_BARS)].time))
  const [through, setThrough] = useState(() => utc(asset.bars[asset.bars.length - 1].time))
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<SeriesReport | null>(null)
  const [error, setError] = useState('')

  async function run(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setReport(null)
    setError('')
    try {
      const restriction = sourcePermissionRestriction(sourceRights, 'automatedUse')
      if (restriction) throw new Error(restriction === 'permission'
        ? 'Plugin series evaluation requires granted automated-use permission.'
        : 'Plugin series evaluation is unavailable because the source grant has expired.')
      const start = utcSecond(from)
      const end = utcSecond(through)
      const { name, digest, module } = await loadScalarModule(file)
      const rows = core.evaluateScalarPluginSeries(module, asset.bars, start, end)
      setReport({ instrument: asset.id, source: sourceLabel, name, digest, from, through, sourceRights, rows })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not evaluate the scalar plugin series.')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!report) return
    const restriction = sourcePermissionRestriction(report.sourceRights, 'redistribution') ??
      sourcePermissionRestriction(sourceRights, 'redistribution')
    if (restriction) {
      setError(restriction === 'permission' ? 'Plugin CSV export requires a granted redistribution permission.'
        : 'Plugin CSV export is unavailable because the source grant has expired.')
      return
    }
    setError('')
    const evidence = [report.instrument, report.source, report.name, report.digest, report.from, report.through].map(quoteText)
    const rows = report.rows.map(row => [...evidence, utc(row.time), fixed(row.close, 6), fixed(row.value, 6)].join(','))
    const columns = 'instrument,source,module,module_sha256,from_utc,through_utc,observed_utc,close,plugin_value'
    downloadFile('scalar-plugin-closes.csv', new Blob([[columns, ...rows].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
  }

  return <details className="research-details">
    <summary>Scalar plugin on observed closes</summary>
    <form className="formula-form" aria-label="Scalar plugin on observed closes" onSubmit={run}>
      <p>Apply a local plugin independently to up to 256 closes in an inclusive UTC range.</p>
      <div className="universe-query">
        <label>Series WebAssembly module
          <input type="file" accept=".wasm,application/wasm" required disabled={busy}
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <label>Plugin from (UTC)<input value={from} required disabled={busy}
          onChange={event => setFrom(event.target.value)} /></label>
        <label>Plugin through (UTC)<input value={through} required disabled={busy}
          onChange={event => setThrough(event.target.value)} /></label>
        <button className="outline" disabled={busy || !file}>Run plugin on closes</button>
      </div>
      {error && <p role="alert" className="warning">{error}</p>}
    </form>
    {report && <section aria-label="Scalar plugin series results">
      <p role="status">{report.rows.length === 0 ? 'No observed closes in this UTC range.' :
        report.name + ' · ' + report.rows.length + ' observed closes'}</p>
      <p className="formula-source">SHA-256 {report.digest}</p>
      {report.rows.length > 0 && <>
        <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Plugin series values">
            <thead><tr><th>Observed UTC</th><th>Close</th><th>Plugin value</th></tr></thead>
            <tbody>{report.rows.map(row => <tr key={row.time}>
              <td>{utc(row.time)}</td><td>{fixed(row.close, 6)}</td><td>{fixed(row.value, 6)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <button type="button" className="outline" onClick={download}>Download plugin series CSV</button>
      </>}
    </section>}
  </details>
}
