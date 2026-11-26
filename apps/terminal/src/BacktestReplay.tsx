import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { BacktestConfig, BacktestResult, MarketCore, PaperConfig } from './market-core'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoCalendar from '../../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv?raw'
import demoBars from '../../../crates/core/tests/fixtures/synthetic-backtest-bars.csv?raw'

const defaults: BacktestConfig = {
  paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' },
  fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
  slippage: '0', limitBuffer: '2000', maxWait: '3',
}
const strategyFields: [Exclude<keyof BacktestConfig, 'paper'>, string][] = [
  ['fastWindow', 'Fast SMA'], ['slowWindow', 'Slow SMA'], ['targetShares', 'Target shares'],
  ['participation', 'Participation (bps)'], ['slippage', 'Adverse slippage (bps)'],
  ['limitBuffer', 'Limit buffer (bps)'], ['maxWait', 'Order life (observed bars)'],
]
const paperFields: [keyof PaperConfig, string][] = [
  ['startingCash', 'Starting cash'], ['positionLimit', 'Position limit (shares)'],
  ['exposureLimit', 'Committed cost limit'], ['feePerShare', 'Fee per share'], ['feePerOrder', 'Fee per order'],
]

type Book = { title: string; bars: string; calendar: string; interval: number; instrument: string; times: number[] }
type Query = { at: string; config: BacktestConfig }
const money = (amount: bigint) => fixed(amount, 6)

function Equity({ marks }: { marks: BacktestResult['marks'] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || marks.length === 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const ratio = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const padding = 14
      const [first] = marks
      const last = marks[marks.length - 1]
      let min = first.equity
      let max = first.equity
      for (const mark of marks) {
        if (mark.equity < min) min = mark.equity
        if (mark.equity > max) max = mark.equity
      }
      const spread = Number(max - min)
      context.strokeStyle = '#506063'
      context.beginPath()
      context.moveTo(padding, height - padding)
      context.lineTo(width - padding, height - padding)
      context.stroke()
      context.strokeStyle = '#78e0bb'
      context.fillStyle = '#78e0bb'
      context.lineWidth = 2
      context.beginPath()
      for (const [i, mark] of marks.entries()) {
        const x = padding + (width - 2 * padding) * ((mark.at - first.at) / Math.max(1, last.at - first.at))
        const fraction = spread ? Number(mark.equity - min) / spread : 0.5
        const y = height - padding - (height - 2 * padding) * fraction
        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
        if (marks.length === 1) context.fillRect(x - 2, y - 2, 4, 4)
      }
      context.stroke()
    }
    const resize = new ResizeObserver(draw)
    resize.observe(canvas)
    draw()
    return () => resize.disconnect()
  }, [marks])
  return <canvas ref={ref} className="backtest-equity" role="img" aria-label="Equity over observed bar closes" />
}

export function BacktestReplay({ core, close }: { core: MarketCore; close: () => void }) {
  const [book, setBook] = useState<Book | null>(null)
  const [view, setView] = useState<{ query: Query; report: BacktestResult } | null>(null)
  const [draft, setDraft] = useState<Query>({ at: '', config: defaults })
  const [barsFile, setBarsFile] = useState<File | null>(null)
  const [calendarFile, setCalendarFile] = useState<File | null>(null)
  const [interval, setInterval] = useState('60')
  const [instrument, setInstrument] = useState('DEMO:SMA')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  function evaluate(source: Book, requested: Query) {
    const query = { ...requested, at: requested.at.trim() }
    const report = core.backtest(source.instrument, source.calendar, source.bars, source.interval, query.at, query.config)
    setDraft(query)
    setView({ query, report })
    setError('')
  }

  function start(calendar: string, bars: string, seconds: number, symbol: string, title: string) {
    const times = core.backtestIndex(calendar, bars, seconds)
    const source = { title, calendar, bars, interval: seconds, instrument: symbol, times }
    evaluate(source, { at: utc(times[0]), config: defaults })
    setBook(source)
  }

  function demo() {
    try {
      start(demoCalendar, demoBars, 60, 'DEMO:SMA', 'Synthetic SMA crossover')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the backtest demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!barsFile || !calendarFile) return
    setBusy(true)
    setError('')
    try {
      const read = async (file: File, max: number) => {
        if (file.size > max * 1024 * 1024) throw new Error(file.name + ' exceeds ' + max + ' MiB.')
        return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      }
      const [calendar, bars] = await Promise.all([read(calendarFile, 1), read(barsFile, 8)])
      start(calendar, bars, Number(interval), instrument.trim(), barsFile.name + ' · ' + calendarFile.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the backtest data.')
    } finally {
      setBusy(false)
    }
  }

  function submit(query: Query) {
    if (!book) return
    try {
      evaluate(book, query)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run the backtest.')
    }
  }

  const at = view ? Date.parse(view.query.at) / 1000 : null
  const times = book?.times ?? []
  const cursor = at === null ? 0 : times.findIndex(time => time >= at)
  const previous = cursor < 0 ? times.at(-1) : times[cursor - 1]
  const next = cursor < 0 ? undefined : times[cursor + Number(times[cursor] === at)]
  const marks = view?.report.marks ?? []
  const mark = marks.at(-1)
  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Bar backtest</h1></div>
        {!book || !view ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>SMA crossover demo</h2>
              <p>Follow a crossover through a missing bar and a volume-limited fill.</p>
              <button className="primary" onClick={demo} disabled={busy}>Start backtest demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open backtest data</h2>
              <label>Instrument
                <input required value={instrument} onChange={event => setInstrument(event.target.value)} />
              </label>
              <label>Bar interval (seconds)
                <input required type="number" min="1" max="86400" value={interval}
                  onChange={event => setInterval(event.target.value)} />
              </label>
              <label>Backtest session CSV
                <input required type="file" accept=".csv,text/csv"
                  onChange={event => setCalendarFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>Backtest bars CSV
                <input required type="file" accept=".csv,text/csv"
                  onChange={event => setBarsFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !barsFile || !calendarFile}>Load backtest data</button>
            </form>
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div><h2>{book.instrument}</h2><p>{book.title}</p></div>
                <button className="outline" onClick={() => {
                  setBook(null)
                  setView(null)
                  setFileState()
                  heading.current?.focus()
                }}>Change backtest data</button>
              </div>
              <form className="replay-panel backtest-settings" onSubmit={event => { event.preventDefault(); submit(draft) }}>
                <div className="universe-query">
                  <label>Observed through (UTC)
                    <input required value={draft.at} onChange={event => setDraft({ ...draft, at: event.target.value })} />
                  </label>
                  <button className="primary">Run bar backtest</button>
                </div>
                <details>
                  <summary>Strategy and account settings</summary>
                  <div className="universe-query">
                    {strategyFields.map(([key, label]) => (
                      <label key={key}>{label}
                        <input required inputMode="numeric" value={draft.config[key]}
                          onChange={event => setDraft({ ...draft, config: { ...draft.config, [key]: event.target.value } })} />
                      </label>
                    ))}
                    {paperFields.map(([key, label]) => (
                      <label key={key}>{label}
                        <input required inputMode="decimal" value={draft.config.paper[key]}
                          onChange={event => setDraft({ ...draft, config: { ...draft.config,
                            paper: { ...draft.config.paper, [key]: event.target.value } } })} />
                      </label>
                    ))}
                  </div>
                </details>
              </form>
              <div className="replay-controls">
                <button className="outline" disabled={previous === undefined}
                  onClick={() => previous !== undefined && submit({ at: utc(previous), config: view.query.config })}>Previous backtest cutoff</button>
                <button className="outline" disabled={next === undefined}
                  onClick={() => next !== undefined && submit({ at: utc(next), config: view.query.config })}>Next backtest cutoff</button>
                <button className="outline" disabled={next === undefined}
                  onClick={() => submit({ at: utc(book.times[book.times.length - 1]), config: view.query.config })}>Final backtest</button>
              </div>
            </section>
            <section className="side-card replay-panel replay-results" aria-labelledby="backtest-results">
              <h2 id="backtest-results">Backtest results</h2>
              <p role="status">{marks.length} observed bars · Known through {view.query.at}</p>
              <dl className="replay-times">
                <div><dt>Equity</dt><dd>{money(mark?.equity ?? view.report.ledger.cash)}</dd></div>
                <div><dt>Cash</dt><dd>{money(view.report.ledger.cash)}</dd></div>
                <div><dt>Reserved</dt><dd>{money(view.report.ledger.reserved)}</dd></div>
                <div><dt>Held shares</dt><dd>{mark?.shares.toString() ?? '0'}</dd></div>
                <div><dt>Realized profit and loss</dt><dd>{money(view.report.ledger.realized)}</dd></div>
                <div><dt>Maximum drawdown</dt><dd>{money(view.report.drawdown)}</dd></div>
              </dl>
              {marks.length > 0 && <Equity marks={marks} />}
              <div className="replay-table-scroll">
                <table className="universe-table" aria-label="Backtest signals">
                  <thead><tr><th scope="col">Signal UTC</th><th scope="col">Side</th></tr></thead>
                  <tbody>{view.report.signals.slice(-100).map(signal => (
                    <tr key={signal.at}><th scope="row">{utc(signal.at)}</th><td>{signal.side}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="replay-table-scroll">
                <table className="universe-table" aria-label="Backtest receipts">
                  <thead><tr><th scope="col">Event</th><th scope="col">Observed UTC</th><th scope="col">Action</th>
                    <th scope="col">Result</th><th scope="col">Shares</th><th scope="col">Price</th><th scope="col">Fee</th><th scope="col">Cash change</th></tr></thead>
                  <tbody>{view.report.ledger.receipts.slice(-100).map(receipt => (
                    <tr key={receipt.id}>
                      <th scope="row">{receipt.id}</th><td>{utc(receipt.observedAt)}</td><td>{receipt.kind}</td>
                      <td>{receipt.status.replaceAll('-', ' ')}</td><td>{receipt.shares?.toString() ?? '—'}</td>
                      <td>{receipt.price === null ? '—' : money(receipt.price)}</td>
                      <td>{money(receipt.fee)}</td><td>{money(receipt.cashDelta)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {error && <p role="alert" className="warning replay-error">{error}</p>}
      </main>
    </>
  )

  function setFileState() {
    setBarsFile(null)
    setCalendarFile(null)
    setError('')
  }
}
