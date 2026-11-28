import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './Chart'
import { quoteText } from './chart-export'
import { MAX_CHART_PRICE_TICKS } from './catalog-schema'
import { downloadFile } from './download'
import { fixed, parsePriceSize } from './fixed-point'
import { Mark } from './Icons'
import type { MarketCore, NotionalBar, RangeBar, TickBar, VolumeBar } from './market-core'
import type { Asset } from './workspace'

type Bars =
  { mode: 'tick'; bars: TickBar[] } | { mode: 'range'; bars: RangeBar[] } |
  { mode: 'volume'; bars: VolumeBar[] } | { mode: 'notional'; bars: NotionalBar[] }
type BarView = { version: number; fileName: string; cutoff: string } & Bars
type Props = { core: MarketCore; asset: Asset; close: () => void }
type SizeSettings = { savedSizeTicks?: number; saveSizeTicks?: (ticks: number) => Promise<void> }
const THRESHOLDS = {
  range: { name: 'Range size', label: 'Price range (price units)', defaultTicks: 1_000_000,
    error: 'Use a positive six-place price range.' },
  volume: { name: 'Volume target', label: 'Volume per bar', defaultTicks: 100_000_000,
    error: 'Use a positive six-place target volume.' },
  notional: { name: 'Notional target', label: 'Notional per bar (quote units)', defaultTicks: 1_000_000_000,
    error: 'Use a positive six-place notional target.' },
} as const

function tickCsv(instrument: string, bars: TickBar[]) {
  const header = 'instrument,first_observed_utc,available_utc,first_sequence,last_sequence,observed_trades,target_trades,open,high,low,close,volume'
  const id = quoteText(instrument)
  const rows = bars.map(({ bar, availableAt, firstSequence, lastSequence, observedTrades, targetTrades }) => [
    id, bar.time, availableAt, firstSequence, lastSequence, observedTrades, targetTrades,
    ...[bar.open, bar.high, bar.low, bar.close, bar.volume].map(value => fixed(BigInt(Math.round(value * 1e6)), 6)),
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

function rangeCsv(instrument: string, bars: RangeBar[]) {
  const header = 'instrument,first_observed_utc,available_utc,first_sequence,last_sequence,observed_trades,target_range,observed_range,complete,open,high,low,close,volume'
  const id = quoteText(instrument)
  const rows = bars.map(({ bar, availableAt, firstSequence, lastSequence, observedTrades, targetRangeTicks, observedRangeTicks, complete }) => [
    id, bar.time, availableAt, firstSequence, lastSequence, observedTrades,
    fixed(targetRangeTicks, 6), fixed(observedRangeTicks, 6), complete,
    ...[bar.open, bar.high, bar.low, bar.close, bar.volume].map(value => fixed(BigInt(Math.round(value * 1e6)), 6)),
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

function volumeCsv(instrument: string, bars: VolumeBar[]) {
  const header = 'instrument,first_observed_utc,available_utc,first_sequence,last_sequence,contributing_trades,first_contribution,last_contribution,target_volume,complete,open,high,low,close,volume'
  const id = quoteText(instrument)
  const rows = bars.map(({ bar, availableAt, firstSequence, lastSequence, contributingTrades,
    firstContributionTicks, lastContributionTicks, targetVolumeTicks, complete, volumeTicks }) => [
    id, bar.time, availableAt, firstSequence, lastSequence, contributingTrades,
    fixed(firstContributionTicks, 6), fixed(lastContributionTicks, 6), fixed(targetVolumeTicks, 6), complete,
    ...[bar.open, bar.high, bar.low, bar.close].map(value => fixed(BigInt(Math.round(value * 1e6)), 6)),
    fixed(volumeTicks, 6),
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

export function RangeBarsResearch(props: Props & SizeSettings) {
  return <TickBarsResearch {...props} mode="range" />
}

function notionalCsv(instrument: string, bars: NotionalBar[]) {
  const header = 'instrument,first_observed_utc,available_utc,first_sequence,last_sequence,observed_trades,target_notional,gross_notional,complete,open,high,low,close,volume'
  const id = quoteText(instrument)
  const rows = bars.map(({ bar, availableAt, firstSequence, lastSequence, observedTrades,
    targetNotionalTicks, grossNotionalTrillionths, complete, volumeTicks }) => [
    id, bar.time, availableAt, firstSequence, lastSequence, observedTrades,
    fixed(targetNotionalTicks, 6), fixed(grossNotionalTrillionths, 12), complete,
    ...[bar.open, bar.high, bar.low, bar.close].map(value => fixed(BigInt(Math.round(value * 1e6)), 6)),
    fixed(volumeTicks, 6),
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

export function VolumeBarsResearch(props: Props & SizeSettings) {
  return <TickBarsResearch {...props} mode="volume" />
}

export function NotionalBarsResearch(props: Props & SizeSettings) {
  return <TickBarsResearch {...props} mode="notional" />
}

export function TickBarsResearch({ core, asset, close, mode = 'tick', savedSizeTicks, saveSizeTicks }:
  Props & SizeSettings & { mode?: Bars['mode'] }) {
  const [file, setFile] = useState<File | null>(null)
  const threshold = mode === 'tick' ? undefined : THRESHOLDS[mode]
  const [size, setSize] = useState(threshold ? fixed(BigInt(savedSizeTicks ?? threshold.defaultTicks), 6) : '10')
  const [remembered, setRemembered] = useState(false)
  const [cutoff, setCutoff] = useState('')
  const [view, setView] = useState<BarView | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])
  const chartAsset = useMemo(() => view ? { ...asset, bars: view.bars.map(entry => entry.bar) } : asset, [asset, view])

  function sizeTicks() {
    const ticks = parsePriceSize(size)
    if (ticks === null || ticks <= 0n || ticks > MAX_CHART_PRICE_TICKS)
      throw new Error(threshold?.error)
    return ticks
  }

  async function remember() {
    if (!saveSizeTicks || busy) return
    setBusy(true)
    setProblem('')
    setRemembered(false)
    try {
      await saveSizeTicks(Number(sizeTicks()))
      setRemembered(true)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not save the selected size.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!file || busy) return
    setBusy(true)
    setProblem('')
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
      const knownAt = cutoff.trim()
      const csv = await file.text()
      const source = { fileName: file.name, cutoff: knownAt }
      let result: Bars
      switch (mode) {
        case 'tick':
          if (!/^\d+$/.test(size.trim())) throw new Error('Enter a whole number of trades per bar.')
          result = { mode, bars: core.recordedTickBars(asset.id, csv, Number(size), knownAt) }
          break
        case 'range': result = { mode, bars: core.recordedRangeBars(asset.id, csv, sizeTicks(), knownAt) }; break
        case 'volume': result = { mode, bars: core.recordedVolumeBars(asset.id, csv, sizeTicks(), knownAt) }; break
        case 'notional': result = { mode, bars: core.recordedNotionalBars(asset.id, csv, sizeTicks(), knownAt) }; break
      }
      setView({ ...source, ...result, version: ++version.current })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not build ' + mode + ' bars.')
    } finally {
      setBusy(false)
    }
  }

  function exportBars(result: BarView) {
    const instrument = (asset.venue + '-' + asset.symbol).replace(/[^A-Za-z0-9_-]/g, '_')
    let csv: string
    switch (result.mode) {
      case 'tick': csv = tickCsv(asset.id, result.bars); break
      case 'range': csv = rangeCsv(asset.id, result.bars); break
      case 'volume': csv = volumeCsv(asset.id, result.bars); break
      case 'notional': csv = notionalCsv(asset.id, result.bars); break
    }
    downloadFile(instrument + '-' + result.mode + '-bars.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  }

  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to workspace</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={title} tabIndex={-1}>Recorded {mode} bars</h1></div>
        <section className="side-card replay-panel">
          <h2>{asset.id}</h2>
          <form aria-label="Recorded trades" onSubmit={event => { event.preventDefault(); void apply() }}>
            <div className="replay-controls">
              <label>Trades CSV
                <input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] ?? null)}
                  disabled={busy} />
              </label>
              <label>{threshold?.label ?? 'Trades per bar'}
                <input inputMode={mode === 'tick' ? 'numeric' : 'decimal'} value={size}
                  onChange={event => { setSize(event.target.value); setRemembered(false) }}
                  disabled={busy} />
              </label>
              <label>Known through (UTC, optional)
                <input value={cutoff} onChange={event => setCutoff(event.target.value)} disabled={busy}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ" />
              </label>
              <button className="primary" type="submit" disabled={!file || busy}>Build {mode} bars</button>
              {saveSizeTicks && threshold && <button type="button" className="outline" disabled={busy}
                onClick={() => void remember()}>Save {threshold.name.toLowerCase()} for this pane</button>}
            </div>
          </form>
          <p>Use the CSV columns instrument, executed_at, observed_at, sequence, price and size.</p>
          {mode === 'range' && <p>A recorded trade completes the bar when its price brings the high-to-low range to the chosen size or above.</p>}
          {mode === 'volume' && <p>A trade can contribute to multiple bars when its size crosses a volume boundary.</p>}
          {mode === 'notional' && <p>A whole trade closes the bar once the sum of absolute price times size reaches the target.</p>}
          {remembered && threshold && <p role="status">{threshold.name} saved for this pane.</p>}
          {problem && <p role="alert">{problem}</p>}
        </section>
        {view && (view.bars.length > 0 ? (
          <section className="chart-card" aria-label={mode[0].toUpperCase() + mode.slice(1) + ' bar chart'}>
            <p className="replay-panel">Source {view.fileName} · {view.cutoff ? 'Known through ' + view.cutoff : 'All recorded trades'}</p>
            <Chart key={view.version} asset={chartAsset} sma={[]} ema={[]}
              ticks={view.mode === 'tick' ? view.bars : undefined} ranges={view.mode === 'range' ? view.bars : undefined}
              volumes={view.mode === 'volume' ? view.bars : undefined}
              notionals={view.mode === 'notional' ? view.bars : undefined} />
            <div className="replay-controls">
              <button className="outline" onClick={() => exportBars(view)}>Download {mode} bars</button>
            </div>
          </section>
        ) : <p role="status">No trades were observed by the selected cutoff.</p>)}
      </main>
    </>
  )
}
