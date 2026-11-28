import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import type { MarketCore, RecordedTradePrint } from './market-core'
import { utc } from './workspace'
import type { Asset } from './workspace'

const PAGE_SIZE = 50
const LEFT = 78
const RIGHT = 16
const SIDE = {
  buy: { label: 'Buy', color: '#68d7b1' },
  sell: { label: 'Sell', color: '#ec817e' },
  unknown: { label: 'Unknown', color: '#a2b4af' },
}

function TradePlot({ rows, active, select }: {
  rows: RecordedTradePrint[]
  active: number
  select: (index: number) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      if (width < LEFT + RIGHT + 16 || height < 72) return
      const scale = Math.min(window.devicePixelRatio || 1, 3)
      element.width = Math.round(width * scale)
      element.height = Math.round(height * scale)
      ctx.scale(scale, scale)
      const high = rows.reduce((value, row) => row.priceTicks > value ? row.priceTicks : value, rows[0].priceTicks)
      const low = rows.reduce((value, row) => row.priceTicks < value ? row.priceTicks : value, rows[0].priceTicks)
      const maxSize = Math.max(...rows.map(row => Number(row.sizeTicks)))
      const right = width - RIGHT
      const bottom = height - 28
      const top = 18
      const x = (index: number) => rows.length === 1 ? (LEFT + right) / 2
        : LEFT + index * (right - LEFT) / (rows.length - 1)
      const y = (price: bigint) => high === low ? (top + bottom) / 2
        : bottom - Number(price - low) / Number(high - low) * (bottom - top)

      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const value of high === low ? [high] : [high, low]) {
        const level = y(value)
        ctx.fillStyle = '#b4c0bc'
        ctx.fillText(fixed(value, 6), LEFT - 8, level, LEFT - 10)
        ctx.strokeStyle = '#394749'
        ctx.beginPath()
        ctx.moveTo(LEFT, level)
        ctx.lineTo(right, level)
        ctx.stroke()
      }
      for (const [index, row] of rows.entries()) {
        const radius = 3 + 4 * Math.sqrt(Number(row.sizeTicks) / maxSize)
        ctx.beginPath()
        ctx.arc(x(index), y(row.priceTicks), radius, 0, Math.PI * 2)
        ctx.fillStyle = SIDE[row.reportedSide].color
        ctx.fill()
        if (index === active) {
          ctx.strokeStyle = '#f7faf8'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }
      ctx.fillStyle = '#b4c0bc'
      ctx.textAlign = 'center'
      ctx.fillText('Capture order', (LEFT + right) / 2, height - 11)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [rows, active])
  return <canvas ref={canvas} className="flow-chart" role="img" aria-label="Recorded trade prices in capture order"
    onPointerDown={event => {
      const { left, width } = event.currentTarget.getBoundingClientRect()
      if (width <= LEFT + RIGHT) return
      const fraction = (event.clientX - left - LEFT) / (width - LEFT - RIGHT)
      select(Math.round(Math.min(1, Math.max(0, fraction)) * (rows.length - 1)))
    }} />
}

function tradeCsv(instrument: string, rows: RecordedTradePrint[]) {
  const header = 'instrument,executed_at,observed_at,sequence,price,size,aggressor'
  const records = rows.map(row => [
    instrument, utc(row.executedAt), utc(row.observedAt), row.sequence,
    fixed(row.priceTicks, 6), fixed(row.sizeTicks, 6), row.reportedSide,
  ].join(','))
  return [header, ...records].join('\r\n') + '\r\n'
}

export function TradePrintResearch({ core, asset, close }: { core: MarketCore; asset: Asset; close: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])
  const [file, setFile] = useState<File | null>(null)
  const [cutoff, setCutoff] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<{ rows: RecordedTradePrint[]; name: string; cutoff: string } | null>(null)
  const [page, setPage] = useState(0)
  const [active, setActive] = useState(0)
  const visible = useMemo(() => snapshot?.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [], [snapshot, page])
  const pages = Math.ceil((snapshot?.rows.length ?? 0) / PAGE_SIZE)

  async function apply() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('Trade CSV exceeds 8 MiB.')
      const known = cutoff.trim()
      const rows = core.recordedTradePrints(asset.id, await file.text(), known)
      setSnapshot({ rows, name: file.name, cutoff: known })
      setPage(0)
      setActive(0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the trade prints.')
    } finally {
      setBusy(false)
    }
  }

  function changePage(index: number) {
    setPage(index)
    setActive(0)
  }

  return <>
    <header className="app-header">
      <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
      <button className="outline" onClick={close}>Return to workspace</button>
    </header>
    <main className="replay-page">
      <div className="page-head"><h1 ref={title} tabIndex={-1}>Recorded time and sales</h1></div>
      <section className="replay-panel side-card">
        <h2>{asset.id}</h2>
        <form aria-label="Recorded trade prints" className="replay-controls"
          onSubmit={event => { event.preventDefault(); void apply() }}>
          <label>Trades CSV
            <input type="file" accept=".csv,text/csv" disabled={busy}
              onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label>Known through (UTC, optional)
            <input value={cutoff} onChange={event => setCutoff(event.target.value)}
              disabled={busy} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
          </label>
          <button className="primary" type="submit" disabled={busy || !file}>Show trade prints</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
      {snapshot && <section className="replay-panel side-card" aria-label="Recorded time and sales results">
        <p role="status">{snapshot.rows.length} {snapshot.rows.length === 1 ? 'print' : 'prints'} · {snapshot.name}
          {snapshot.cutoff && ' · Known through ' + snapshot.cutoff}</p>
        {visible.length > 0 && <>
          <TradePlot rows={visible} active={active} select={setActive} />
          <div className="replay-table-scroll" role="region" tabIndex={0} aria-label="Scrollable recorded trade prints">
            <table className="universe-table" aria-label="Recorded trade prints">
              <thead><tr><th scope="col">Capture sequence</th><th scope="col">Executed (UTC)</th>
                <th scope="col">Observed (UTC)</th><th scope="col">Price</th><th scope="col">Size</th>
                <th scope="col">Reported aggressor</th></tr></thead>
              <tbody>{visible.map((row, index) => <tr key={row.sequence.toString()}>
                <th scope="row"><button className="outline" type="button" aria-pressed={index === active}
                  onClick={() => setActive(index)}>{row.sequence.toString()}</button></th>
                <td>{utc(row.executedAt)}</td><td>{utc(row.observedAt)}</td><td>{fixed(row.priceTicks, 6)}</td>
                <td>{fixed(row.sizeTicks, 6)}</td><td>{SIDE[row.reportedSide].label}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {pages > 1 && <div className="replay-controls">
            <button className="outline" disabled={page === 0} onClick={() => changePage(page - 1)}>Previous prints</button>
            <span role="status">Page {page + 1} of {pages}</span>
            <button className="outline" disabled={page + 1 === pages} onClick={() => changePage(page + 1)}>Next prints</button>
          </div>}
          <button className="outline" type="button" onClick={() => {
            const filename = asset.id.replace(/[^A-Za-z0-9_-]/g, '-') + '-trade-prints.csv'
            downloadFile(filename, new Blob([tradeCsv(asset.id, snapshot.rows)], { type: 'text/csv;charset=utf-8' }))
          }}>Download trade prints</button>
        </>}
      </section>}
    </main>
  </>
}
