import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './Chart'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import type { MarketCore, TickBar } from './market-core'
import type { Asset } from './workspace'

type TickView = { bars: TickBar[]; version: number; fileName: string; cutoff: string }

function tickCsv(instrument: string, bars: TickBar[]) {
  const header = 'instrument,first_observed_utc,available_utc,first_sequence,last_sequence,observed_trades,target_trades,open,high,low,close,volume'
  const id = quoteText(instrument)
  const rows = bars.map(({ bar, availableAt, firstSequence, lastSequence, observedTrades, targetTrades }) => [
    id, bar.time, availableAt, firstSequence, lastSequence, observedTrades, targetTrades,
    ...[bar.open, bar.high, bar.low, bar.close, bar.volume].map(value => fixed(BigInt(Math.round(value * 1e6)), 6)),
  ].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}

export function TickBarsResearch({ core, asset, close }: { core: MarketCore; asset: Asset; close: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [count, setCount] = useState('10')
  const [cutoff, setCutoff] = useState('')
  const [view, setView] = useState<TickView | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])
  const chartAsset = useMemo(() => view ? { ...asset, bars: view.bars.map(entry => entry.bar) } : asset, [asset, view])

  async function apply() {
    if (!file || busy) return
    setBusy(true)
    setProblem('')
    try {
      if (!/^\d+$/.test(count.trim())) throw new Error('Enter a whole number of trades per bar.')
      if (file.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
      const knownAt = cutoff.trim()
      const bars = core.recordedTickBars(asset.id, await file.text(), Number(count), knownAt)
      setView({ bars, version: ++version.current, fileName: file.name, cutoff: knownAt })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not build tick bars.')
    } finally {
      setBusy(false)
    }
  }

  function exportBars(bars: TickBar[]) {
    const instrument = (asset.venue + '-' + asset.symbol).replace(/[^A-Za-z0-9_-]/g, '_')
    downloadFile(instrument + '-tick-bars.csv', new Blob([tickCsv(asset.id, bars)], { type: 'text/csv;charset=utf-8' }))
  }

  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to workspace</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={title} tabIndex={-1}>Recorded tick bars</h1></div>
        <section className="side-card replay-panel">
          <h2>{asset.id}</h2>
          <form aria-label="Recorded trades" onSubmit={event => { event.preventDefault(); void apply() }}>
            <div className="replay-controls">
              <label>Trades CSV
                <input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] ?? null)}
                  disabled={busy} />
              </label>
              <label>Trades per bar
                <input inputMode="numeric" value={count} onChange={event => setCount(event.target.value)}
                  disabled={busy} />
              </label>
              <label>Known through (UTC, optional)
                <input value={cutoff} onChange={event => setCutoff(event.target.value)} disabled={busy}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ" />
              </label>
              <button className="primary" type="submit" disabled={!file || busy}>Build tick bars</button>
            </div>
          </form>
          <p>Use the CSV columns instrument, executed_at, observed_at, sequence, price and size.</p>
          {problem && <p role="alert">{problem}</p>}
        </section>
        {view && (view.bars.length > 0 ? (
          <section className="chart-card" aria-label="Tick bar chart">
            <p className="replay-panel">Source {view.fileName} · {view.cutoff ? 'Known through ' + view.cutoff : 'All recorded trades'}</p>
            <Chart key={view.version} asset={chartAsset} sma={[]} ema={[]} ticks={view.bars} />
            <div className="replay-controls">
              <button className="outline" onClick={() => exportBars(view.bars)}>Download tick bars</button>
            </div>
          </section>
        ) : <p role="status">No trades were observed by the selected cutoff.</p>)}
      </main>
    </>
  )
}
