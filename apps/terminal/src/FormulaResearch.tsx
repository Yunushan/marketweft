import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { sourcePermissionRestriction, type SourceRights } from './catalog-schema'
import type { FormulaResult, MarketCore } from './market-core'
import type { Asset } from './workspace'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { MAX_FORMULA_LIBRARY_BYTES, parseFormulaLibrary } from './formula-library'
import { utc } from './workspace'
import { ScalarPlugin, ScalarPluginSeries } from './ScalarPlugin'

type Library = { name: string; bytes: ArrayBuffer; digest: string; manifest: ReturnType<typeof parseFormulaLibrary> }
type Report = FormulaResult & {
  source: string; through: string; times: number[]
  sourceLabel: string; sourceRights?: SourceRights; library: Library | null
}
const PAGE_SIZE = 60

function FormulaPlot({ values }: { values: (bigint | null)[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = ref.current
    const canvas = element?.getContext('2d')
    if (!element || !canvas) return
    const recent = values.slice(-512)
    const draw = () => {
      const { width, height } = element.getBoundingClientRect()
      const ratio = Math.min(devicePixelRatio || 1, 2)
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      canvas.setTransform(ratio, 0, 0, ratio, 0, 0)
      const finite = recent.filter(value => value !== null).map(Number)
      const low = Math.min(...finite), high = Math.max(...finite)
      const padding = 15
      const point = (value: bigint, i: number) => ({
        x: padding + i * (width - 2 * padding) / Math.max(1, recent.length - 1),
        y: high === low ? height / 2 : height - padding - (Number(value) - low) * (height - 2 * padding) / (high - low),
      })
      canvas.strokeStyle = '#516064'
      canvas.strokeRect(padding, padding, width - 2 * padding, height - 2 * padding)
      canvas.strokeStyle = '#78e0bb'
      canvas.fillStyle = '#78e0bb'
      canvas.beginPath()
      recent.forEach((value, i) => {
        if (value === null) return
        const { x, y } = point(value, i)
        if (i > 0 && recent[i - 1] !== null) canvas.lineTo(x, y)
        else canvas.moveTo(x, y)
      })
      canvas.stroke()
      recent.forEach((value, i) => {
        if (value === null || (i > 0 && recent[i - 1] !== null) ||
          (i + 1 < recent.length && recent[i + 1] !== null)) return
        const { x, y } = point(value, i)
        canvas.fillRect(x - 1.5, y - 1.5, 3, 3)
      })
    }
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    draw()
    return () => observer.disconnect()
  }, [values])
  return <canvas ref={ref} className="backtest-equity" role="img"
    aria-label={`Formula output for the latest ${Math.min(512, values.length)} observed bars`} />
}

export function FormulaResearch({ core, asset, sourceLabel, sourceRights, close }: {
  core: MarketCore; asset: Asset; sourceLabel: string; sourceRights?: SourceRights; close: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const [source, setSource] = useState('close - sma(close, 3)')
  const [through, setThrough] = useState(() => utc(asset.bars[asset.bars.length - 1].time))
  const [report, setReport] = useState<Report | null>(null)
  const [library, setLibrary] = useState<Library | null>(null)
  const [libraryFile, setLibraryFile] = useState<File | null>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { title.current?.focus() }, [])
  const endPage = Math.max(0, Math.ceil((report?.values.length ?? 0) / PAGE_SIZE) - 1)
  const unavailable = report?.values.filter(value => value === null).length ?? 0
  const current = Math.min(page, endPage)
  const offset = current * PAGE_SIZE

  async function loadLibrary() {
    if (!libraryFile) return
    setLoading(true)
    try {
      if (libraryFile.size > MAX_FORMULA_LIBRARY_BYTES) throw new Error('Formula function library exceeds 48 KiB.')
      const bytes = await libraryFile.arrayBuffer()
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const manifest = parseFormulaLibrary(text, core)
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
      const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
      setLibrary({ name: libraryFile.name, bytes, digest, manifest })
      setLibraryFile(null)
      if (libraryInput.current) libraryInput.current.value = ''
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the formula function library.')
    } finally {
      setLoading(false)
    }
  }

  function run(event: FormEvent) {
    event.preventDefault()
    const restriction = sourcePermissionRestriction(sourceRights, 'automatedUse')
    if (restriction) {
      setReport(null)
      setError(restriction === 'permission'
        ? 'Formula evaluation requires granted automated-use permission.'
        : 'Formula evaluation is unavailable because the source grant has expired.')
      return
    }
    try {
      const cutoff = through.trim()
      const second = Date.parse(cutoff) / 1000
      if (!Number.isSafeInteger(second) || utc(second) !== cutoff) {
        throw new Error('Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.')
      }
      const after = asset.bars.findIndex(bar => bar.time > second)
      const bars = after < 0 ? asset.bars : asset.bars.slice(0, after)
      const output = core.evaluateFormula(source.trim(), bars, library?.manifest.functions)
      setReport({ ...output, source: source.trim(), through: cutoff,
        times: bars.map(bar => bar.time), sourceLabel, sourceRights, library })
      setPage(Math.max(0, Math.ceil(output.values.length / PAGE_SIZE) - 1))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not evaluate the formula.')
    }
  }

  function download() {
    if (!report) return
    const restriction = sourcePermissionRestriction(report.sourceRights, 'redistribution')
    if (restriction) {
      setError(restriction === 'permission'
        ? 'Formula CSV export requires a granted redistribution permission.'
        : 'Formula CSV export is unavailable because the source grant has expired.')
      return
    }
    const prefix = [asset.id, report.sourceLabel, report.through, report.source].map(quoteText)
    const fields = report.library ? [quoteText(report.library.name), report.library.digest] : []
    const header = 'instrument,source,known_through_utc,formula,language_version,bar_utc,value'
    const rows = report.values.map((value, index) => [...prefix, report.version, utc(report.times[index]),
      value === null ? '' : fixed(value, 6), ...fields].join(','))
    downloadFile('time-series-formula.csv', new Blob([
      [header + (report.library ? ',function_library,function_library_sha256' : ''), ...rows].join('\r\n') + '\r\n',
    ], { type: 'text/csv;charset=utf-8' }))
  }

  function downloadLibrary() {
    const accepted = report?.library
    if (accepted) downloadFile(accepted.name, new Blob([accepted.bytes], { type: 'application/json;charset=utf-8' }))
  }

  return <>
    <header className="app-header">
      <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
      <button className="outline" onClick={close}>Return to workspace</button>
    </header>
    <main className="replay-page">
      <div className="page-head"><h1 ref={title} tabIndex={-1}>Time-series formulas</h1></div>
      <section className="side-card replay-panel" aria-label="Formula inputs">
        <h2>{asset.id}</h2>
        <details className="research-details">
          <summary>Custom formula functions</summary>
          <div className="universe-query">
            <label>Formula function library
              <input ref={libraryInput} type="file" accept=".json,application/json" disabled={loading}
                onChange={event => setLibraryFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className="outline" disabled={loading || !libraryFile}
              onClick={loadLibrary}>Load function library</button>
            {library && <button type="button" className="outline" disabled={loading}
              onClick={() => { setLibrary(null); setError('') }}>Clear function library</button>}
          </div>
          {library && <p className="formula-source">{library.name} · {library.manifest.functions.map(item =>
            item.name + '(' + item.parameters.join(', ') + ')').join(', ')}</p>}
        </details>
        <ScalarPlugin core={core} />
        <ScalarPluginSeries core={core} asset={asset} sourceLabel={sourceLabel} sourceRights={sourceRights} />
        <form className="formula-form" onSubmit={run}>
          <label>Formula
            <textarea value={source} maxLength={2048} rows={4} required spellCheck={false}
              onChange={event => setSource(event.target.value)} />
          </label>
          <small>Fields are open, high, low, close and volume. Functions include lag, sma, ema, lowest, highest, abs, if and coalesce.</small>
          <div className="universe-query">
            <label>Formula observed through (UTC)
              <input required value={through} onChange={event => setThrough(event.target.value)} />
            </label>
            <button className="primary" disabled={loading}>Evaluate formula</button>
          </div>
        </form>
        {error && <p role="alert" className="warning">{error}</p>}
      </section>
      {report && <section className="side-card replay-panel" aria-label="Formula results">
        <p role="status">{report.values.length - unavailable} values · {unavailable} unavailable · Language v{report.version}</p>
        <pre className="formula-source">{report.source}</pre>
        {report.values.length > unavailable && <FormulaPlot values={report.values} />}
        {report.values.length > 0 && <>
          <div className="replay-table-scroll">
            <table className="universe-table" aria-label="Formula values">
              <thead><tr><th scope="col">Bar UTC</th><th scope="col">Value</th></tr></thead>
              <tbody>{report.values.slice(offset, offset + PAGE_SIZE).map((value, i) => {
                const time = report.times[offset + i]
                return <tr key={time}><th scope="row">{utc(time)}</th>
                  <td>{value === null ? 'Unavailable' : fixed(value, 6)}</td></tr>
              })}</tbody>
            </table>
          </div>
          {endPage > 0 && <div className="replay-controls">
            <button className="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous formula rows</button>
            <p>{current + 1} / {endPage + 1}</p>
            <button className="outline" disabled={current >= endPage} onClick={() => setPage(current + 1)}>Next formula rows</button>
          </div>}
          <button className="outline" onClick={download}>Download formula values</button>
          {report.library && <button className="outline" onClick={downloadLibrary}>Download evaluated function library</button>}
        </>}
      </section>}
    </main>
  </>
}
