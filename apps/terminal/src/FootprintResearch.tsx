import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import { PriceProfiles } from './PriceProfiles'
import { TimePriceChart } from './TimePriceChart'
import { TradeClassificationResearch } from './TradeClassificationResearch'
import type { FootprintBar, FootprintQuery, MarketCore, TradeFlowVolume } from './market-core'
import { utc } from './workspace'
import type { Asset } from './workspace'
import demo from '../../../crates/core/tests/fixtures/synthetic-footprint.csv?raw'

type Settings = Omit<FootprintQuery, 'bucketSeconds'> & { bucketSeconds: string }
type Source = { csv: string; name: string }
type Report = { query: FootprintQuery; source: Source; bars: FootprintBar[] }
const PAGE_SIZE = 60

function delta({ buy, sell }: TradeFlowVolume) {
  return buy - sell
}

function volumeFields(volume: TradeFlowVolume) {
  return [fixed(volume.buy, 6), fixed(volume.sell, 6), fixed(volume.unknown, 6),
    fixed(volume.buy + volume.sell + volume.unknown, 6), fixed(delta(volume), 6), volume.trades]
}

function footprintCsv(instrument: string, { source, query, bars }: Report) {
  const header = 'instrument,source,interval_seconds,price_increment,execution_from_utc,execution_through_utc,known_utc,bucket_start_utc,bucket_end_utc,last_observed_utc,first_sequence,last_sequence,cumulative_delta,price_from,price_to,buy_volume,sell_volume,unknown_volume,total_volume,delta,trades'
  const prefix = [quoteText(instrument), quoteText(source.name), query.bucketSeconds,
    query.priceWidth, query.from, query.through, query.known]
  const rows = bars.flatMap(bar => {
    const fields = [...prefix, utc(bar.startsAt), utc(bar.endsAt), utc(bar.lastObservedAt),
      bar.firstSequence, bar.lastSequence, fixed(bar.cumulativeDelta, 6)]
    return bar.levels.map(level => [
      ...fields, fixed(level.priceFrom, 6), fixed(level.priceTo, 6), ...volumeFields(level.volume),
    ].join(','))
  })
  return [header, ...rows].join('\r\n') + '\r\n'
}

function DeltaPlot({ bars, selected }: { bars: FootprintBar[]; selected: FootprintBar }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const minAt = bars[0].startsAt
    const maxAt = bars[bars.length - 1].endsAt
    let low = 0
    let high = 0
    for (const bar of bars) {
      const value = Number(bar.cumulativeDelta) / 1e6
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
    if (low === high) { low = -1; high = 1 }
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      ctx.scale(dpr, dpr)
      const [axis, edge, top, bottom] = [72, width - 12, 15, height - 15]
      const x = (time: number) => axis + (edge - axis) * (time - minAt) / (maxAt - minAt)
      const y = (value: number) => top + (bottom - top) * (high - value) / (high - low)
      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const value of new Set([low, 0, high])) {
        if (value !== 0 && Math.abs(y(value) - y(0)) < 14) continue
        ctx.strokeStyle = value === 0 ? '#667d75' : '#303a3d'
        ctx.beginPath()
        ctx.moveTo(axis, y(value))
        ctx.lineTo(edge, y(value))
        ctx.stroke()
        ctx.fillStyle = '#a2b0a9'
        const label = Math.abs(value) >= 1000 ? value.toExponential(1) : String(value)
        ctx.fillText(label, axis - 8, y(value), axis - 12)
      }
      ctx.strokeStyle = '#74dbad'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(axis, y(0))
      let previous = 0
      for (const bar of bars) {
        const value = Number(bar.cumulativeDelta) / 1e6
        ctx.lineTo(x(bar.endsAt), y(previous))
        ctx.lineTo(x(bar.endsAt), y(value))
        previous = value
      }
      ctx.stroke()
      ctx.fillStyle = '#e8ba70'
      const selectedY = y(Number(selected.cumulativeDelta) / 1e6)
      ctx.fillRect(x(selected.endsAt) - 3, selectedY - 3, 6, 6)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [bars, selected])
  return <canvas ref={canvas} className="flow-chart" role="img" aria-label="Cumulative volume delta by UTC bucket. Exact values are shown below." />
}

function FootprintRows({ bar }: { bar: FootprintBar }) {
  const [requestedPage, setPage] = useState(0)
  const lastPage = Math.ceil(bar.levels.length / PAGE_SIZE) - 1
  const page = Math.min(requestedPage, lastPage)
  return (
    <>
      <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable footprint price bins">
        <table className="universe-table" aria-label="Footprint price bins">
          <thead><tr>
            <th scope="col">Price from</th><th scope="col">Price to (exclusive)</th>
            <th scope="col">Buy</th><th scope="col">Sell</th><th scope="col">Unknown</th>
            <th scope="col">Total</th><th scope="col">Delta</th><th scope="col">Trades</th>
          </tr></thead>
          <tbody>{bar.levels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(level => (
            <tr key={level.priceFrom.toString()}>
              <th scope="row">{fixed(level.priceFrom, 6)}</th>
              <td>{fixed(level.priceTo, 6)}</td>
              {volumeFields(level.volume).map((value, i) => <td key={i}>{value}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {lastPage > 0 && <div className="replay-controls">
        <button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous price bins</button>
        <span role="status">Page {page + 1} of {lastPage + 1}</span>
        <button className="outline" disabled={page === lastPage} onClick={() => setPage(page + 1)}>Next price bins</button>
      </div>}
    </>
  )
}

export function FootprintResearch({ core, asset, close }: { core: MarketCore; asset: Asset; close: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    bucketSeconds: '60', priceWidth: '0.5', from: '', through: '', known: '',
  })
  const [report, setReport] = useState<Report | null>(null)
  const [bucket, setBucket] = useState(0)
  const [showTimePrice, setShowTimePrice] = useState(false)
  const [problem, setProblem] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])

  function calculate(input: Source, values: Settings) {
    if (!/^\d+$/.test(values.bucketSeconds.trim())) throw new Error('Use a positive whole-second footprint interval.')
    const query = {
      bucketSeconds: Number(values.bucketSeconds), priceWidth: values.priceWidth.trim(),
      from: values.from.trim(), through: values.through.trim(), known: values.known.trim(),
    }
    const bars = core.recordedFootprint(asset.id, input.csv, query)
    setReport({ query, source: input, bars })
    setSettings({ ...query, bucketSeconds: String(query.bucketSeconds) })
    setBucket(0)
    setProblem('')
  }

  function start(csv: string, name: string) {
    const bound = core.footprintWindow(asset.id, csv)
    calculate({ csv, name }, { ...settings, from: utc(bound.firstExecution),
      through: utc(bound.lastExecution), known: utc(bound.lastObserved) })
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      start(csv, file.name)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not load footprint trades.')
    } finally {
      setBusy(false)
    }
  }

  function run(event: FormEvent) {
    event.preventDefault()
    if (!report) return
    try {
      calculate(report.source, settings)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not calculate the footprint.')
    }
  }

  const bar = report?.bars[bucket]
  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to workspace</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={title} tabIndex={-1}>Recorded footprint</h1></div>
        <section className="side-card replay-panel" aria-labelledby="footprint-instrument">
          <div className="replay-heading">
            <h2 id="footprint-instrument">{asset.id}</h2>
            {asset.id === 'NASDAQ:NVDA' && <button className="outline" disabled={busy} onClick={() => {
              try { start(demo, 'Synthetic aggressor trades') }
              catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Could not load the footprint demo.') }
            }}>Load footprint demo</button>}
          </div>
          <form className="universe-query" onSubmit={load}>
            <label>Footprint trades CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                onChange={event => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="primary" type="submit" disabled={!file || busy}>Load footprint trades</button>
          </form>
          <details>
            <summary>Footprint CSV format</summary>
            <p>Supply buy, sell or unknown as the aggressor side. Unknown size contributes to total volume.</p>
            <pre>instrument,executed_at,observed_at,sequence,price,size,aggressor</pre>
          </details>
          {report && (
            <form className="universe-query" onSubmit={run}>
              {([
                ['bucketSeconds', 'Footprint interval (seconds)'],
                ['priceWidth', 'Price increment'],
                ['from', 'Execution from (UTC)'],
                ['through', 'Execution through (UTC)'],
                ['known', 'Footprint known time (UTC)'],
              ] as const).map(([key, label]) => (
                <label key={key}>{label}<input required disabled={busy} value={settings[key]}
                  onChange={event => setSettings({ ...settings, [key]: event.target.value })} /></label>
              ))}
              <button className="outline" type="submit" disabled={busy}>Query footprint</button>
            </form>
          )}
          {problem && <p role="alert" className="warning">{problem}</p>}
        </section>
        <section className="side-card replay-panel">
          <TradeClassificationResearch core={core} instrument={asset.id} plot={(csv, source, query) => {
            const { from, through, known } = query
            try { calculate({ csv, name: source }, { ...settings, from, through, known }) }
            catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Could not plot the classified trades.') }
          }} />
        </section>
        {report && (
          <section className="side-card replay-panel replay-results" aria-labelledby="footprint-results">
            <div className="replay-heading">
              <h2 id="footprint-results">Footprint and cumulative delta</h2>
              {bar && <button className="outline" onClick={() => downloadFile('recorded-footprint.csv',
                new Blob([footprintCsv(asset.id, report)], { type: 'text/csv;charset=utf-8' }))}>Download footprint</button>}
            </div>
            <p>{report.source.name} · Known through {report.query.known}</p>
            {bar ? (
              <>
                <DeltaPlot bars={report.bars} selected={bar} />
                <div className="replay-controls">
                  <button className="outline" disabled={bucket === 0} onClick={() => setBucket(bucket - 1)}>Previous bucket</button>
                  <span role="status">Bucket {bucket + 1} of {report.bars.length}</span>
                  <button className="outline" disabled={bucket + 1 === report.bars.length}
                    onClick={() => setBucket(bucket + 1)}>Next bucket</button>
                </div>
                <dl className="replay-times">
                  <div><dt>Bucket start</dt><dd>{utc(bar.startsAt)}</dd></div>
                  <div><dt>Bucket end</dt><dd>{utc(bar.endsAt)}</dd></div>
                  <div><dt>Last observed</dt><dd>{utc(bar.lastObservedAt)}</dd></div>
                  <div><dt>Trades</dt><dd>{bar.volume.trades}</dd></div>
                  <div><dt>Unknown volume</dt><dd>{fixed(bar.volume.unknown, 6)}</dd></div>
                  <div><dt>Delta</dt><dd>{fixed(delta(bar.volume), 6)}</dd></div>
                  <div><dt>Cumulative delta</dt><dd>{fixed(bar.cumulativeDelta, 6)}</dd></div>
                </dl>
                <FootprintRows key={JSON.stringify([bar.startsAt, report.query])} bar={bar} />
              </>
            ) : <p role="status">No trades match these execution and observation cutoffs.</p>}
            {bar && <details className="research-details" open={showTimePrice}
              onToggle={event => setShowTimePrice(event.currentTarget.open)}>
              <summary>Time-price bracket chart</summary>
              {showTimePrice && <TimePriceChart key={JSON.stringify([report.source.name, report.query])}
                bars={report.bars} instrument={asset.id} query={report.query} source={report.source.name} />}
            </details>}
            <PriceProfiles core={core} instrument={asset.id} source={report.source} query={report.query} />
          </section>
        )}
      </main>
    </>
  )
}
