import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { MarketCore, ReplayEvent } from './market-core'
import type { Asset } from './workspace'
import { Chart } from './Chart'
import { Icon, Mark } from './Icons'
import { price } from './workspace'
import demoCalendar from '../../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv?raw'
import demoBars from '../../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv?raw'

const eventNames = {
  open: 'Session opened',
  bar: 'Bar observed',
  missing: 'Missing interval',
  close: 'Session closed',
}
const utc = (time: number) =>
  new Date(time * 1000).toISOString().replace('.000Z', 'Z')
const openingOffset = (minutes: number) => {
  const magnitude = Math.abs(minutes)
  const part = (n: number) => String(n).padStart(2, '0')
  return (
    'UTC' +
    (minutes < 0 ? '−' : '+') +
    part(Math.floor(magnitude / 60)) +
    ':' +
    part(magnitude % 60)
  )
}

type ReplayRun = {
  asset: Asset
  calendarName: string
  events: ReplayEvent[]
  counts: Uint32Array
}

export function HistoricalReplay({
  core,
  assets,
  selected,
  close,
}: {
  core: MarketCore
  assets: Asset[]
  selected: string
  close: () => void
}) {
  const [active, setActive] = useState<ReplayRun | null>(null)
  const [cursor, setCursor] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(400)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [seriesId, setSeriesId] = useState(
    assets.some((item) => item.id === selected)
      ? selected
      : (assets[0]?.id ?? ''),
  )
  const [interval, setInterval] = useState('1800')
  const [calendarFile, setCalendarFile] = useState<File | null>(null)
  const terminal = useRef<HTMLHeadingElement>(null)
  const chart = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    terminal.current?.focus()
  }, [])
  useEffect(() => {
    if (active) chart.current?.focus()
  }, [active])

  function start(
    asset: Asset,
    calendar: string,
    seconds: number,
    calendarName: string,
  ) {
    const events = core.replay(calendar, seconds, asset.bars)
    const counts = new Uint32Array(events.length + 1)
    events.forEach((event, i) => {
      counts[i + 1] = counts[i] + Number(event.kind === 'bar')
    })
    setCursor(-1)
    setPlaying(false)
    setActive({ asset, calendarName, events, counts })
  }

  function demo() {
    setError('')
    try {
      start(
        {
          id: 'DEMO:REPLAY',
          symbol: 'REPLAY',
          venue: 'DEMO',
          name: 'Synthetic 30-minute OHLCV',
          source: 'sample',
          bars: core.parseCsv(demoBars),
        },
        demoCalendar,
        1800,
        'NYSE core equities · Oct–Nov 2025',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not start the replay.',
      )
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const asset = assets.find((item) => item.id === seriesId)
    if (!asset || !calendarFile) return
    setBusy(true)
    setError('')
    try {
      if (calendarFile.size > 1024 * 1024)
        throw Error('Session calendar exceeds 1 MiB.')
      const calendar = new TextDecoder('utf-8', { fatal: true }).decode(
        await calendarFile.arrayBuffer(),
      )
      start(asset, calendar, Number(interval), calendarFile.name)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not start the replay.',
      )
    } finally {
      setBusy(false)
    }
  }

  const end = (active?.events.length ?? 0) - 1
  useEffect(() => {
    if (!playing || cursor >= end) return
    const timer = window.setTimeout(() => {
      setCursor(cursor + 1)
      if (cursor + 1 === end) setPlaying(false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [cursor, delay, end, playing])

  const event = active?.events[cursor]
  const count = active?.counts[cursor + 1] ?? 0
  const bars = useMemo(
    () => active?.asset.bars.slice(0, count) ?? [],
    [active, count],
  )
  const sma = useMemo(() => core.indicator('sma', 20, bars), [bars, core])
  const ema = useMemo(() => core.indicator('ema', 9, bars), [bars, core])

  return (
    <>
      <header className="app-header">
        <div className="app-brand">
          <Mark />
          <strong>MarketWeft</strong>
        </div>
        <button className="outline" onClick={close}>
          Return to workspace
        </button>
      </header>
      <main className="replay-page">
        <div className="page-head">
          <h1 ref={terminal} tabIndex={-1}>
            Historical replay
          </h1>
        </div>
        {!active ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Session replay demo</h2>
              <p>
                Replay synthetic 30-minute bars in the NYSE core session
                calendar. Inspect the November clock change, an omitted bar and
                the Thanksgiving early close.
              </p>
              <button className="primary" onClick={demo} disabled={busy}>
                Start demo
              </button>
            </section>
            <form className="side-card replay-panel" onSubmit={submit}>
              <h2>Replay imported history</h2>
              <label>
                Instrument
                <select
                  value={seriesId}
                  onChange={(event) => setSeriesId(event.target.value)}
                  disabled={busy || assets.length === 0}
                  required
                >
                  {assets.length === 0 && (
                    <option value="">Import a history in the workspace</option>
                  )}
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session calendar CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    setCalendarFile(event.target.files?.[0] ?? null)
                  }
                  disabled={busy}
                  required
                />
              </label>
              <label>
                Bar interval in seconds
                <input
                  type="number"
                  min={1}
                  max={86400}
                  step={1}
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <details>
                <summary>Calendar format</summary>
                <p>
                  Supply each core session as a trading date, UTC opening and
                  closing timestamps, offset at open in minutes, and session
                  kind. Bar timestamps must label interval starts.
                </p>
                <pre>
                  date,open_utc,close_utc,utc_offset_minutes,kind{'\n'}
                  2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
                </pre>
              </details>
              <button className="primary" disabled={busy || !seriesId}>
                Start replay
              </button>
            </form>
            {error && (
              <p className="warning replay-error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
            <section
              className="side-card replay-panel replay-console"
              aria-label="Replay controls"
            >
              <div className="replay-heading">
                <div>
                  <h2 ref={chart} tabIndex={-1}>
                    {active.asset.id}
                  </h2>
                  <p>{active.calendarName}</p>
                </div>
                <button
                  className="outline"
                  onClick={() => {
                    setPlaying(false)
                    setActive(null)
                    terminal.current?.focus()
                  }}
                >
                  Change replay
                </button>
              </div>
              <div className="replay-controls">
                <button
                  className="outline"
                  disabled={cursor < 0}
                  onClick={() => {
                    setPlaying(false)
                    setCursor(-1)
                  }}
                >
                  Reset
                </button>
                <button
                  className="outline"
                  disabled={cursor < 0}
                  onClick={() => {
                    setPlaying(false)
                    setCursor((value) => value - 1)
                  }}
                >
                  Previous event
                </button>
                <button
                  className="primary"
                  disabled={cursor >= end}
                  onClick={() => setPlaying((value) => !value)}
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button
                  className="outline"
                  disabled={cursor >= end}
                  onClick={() => {
                    setPlaying(false)
                    setCursor((value) => Math.min(end, value + 1))
                  }}
                >
                  Next event
                </button>
                <label>
                  Speed{' '}
                  <select
                    value={delay}
                    onChange={(event) => setDelay(Number(event.target.value))}
                  >
                    <option value={1000}>1 event/sec</option>
                    <option value={400}>2.5 events/sec</option>
                    <option value={100}>10 events/sec</option>
                  </select>
                </label>
              </div>
              <div
                className="replay-state"
                aria-live={playing ? 'off' : 'polite'}
              >
                <div>
                  <strong>
                    {event ? eventNames[event.kind] : 'Ready to replay'}
                  </strong>
                  <p>
                    {cursor >= end
                      ? 'Replay complete'
                      : 'Event ' + (cursor + 1)}{' '}
                    ·{' '}
                    <span data-testid="replay-bar-count">
                      {count} {count === 1 ? 'observed bar' : 'observed bars'}
                    </span>
                  </p>
                </div>
                {event && (
                  <dl className="replay-times">
                    <div>
                      <dt>Session</dt>
                      <dd>
                        {event.sessionIndex + 1} ·{' '}
                        {event.earlyClose ? 'Early close' : 'Regular'} ·{' '}
                        {openingOffset(event.utcOffsetMinutes)} at open
                      </dd>
                    </div>
                    <div>
                      <dt>Event time</dt>
                      <dd>
                        <time dateTime={utc(event.eventTime)}>
                          {utc(event.eventTime)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Observed at</dt>
                      <dd>
                        <time dateTime={utc(event.observedAt)}>
                          {utc(event.observedAt)}
                        </time>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>
            {bars.length > 0 ? (
              <article className="chart-card replay-chart">
                <div className="plot-toolbar">
                  <div className="chart-kind">
                    <Icon name="chart" />
                    <b>Observed candles</b>
                  </div>
                  <strong data-testid="replay-last-close">
                    {price(bars.at(-1)!.close)}
                  </strong>
                </div>
                <div className="legend" aria-label="Chart legend">
                  <span>
                    <i className="candle-key" />
                    OHLCV
                  </span>
                  <span>
                    <i className="line-key sma" />
                    SMA 20
                  </span>
                  <span>
                    <i className="line-key ema" />
                    EMA 9
                  </span>
                </div>
                <Chart
                  key={bars.length}
                  asset={{ ...active.asset, bars }}
                  sma={sma}
                  ema={ema}
                />
              </article>
            ) : (
              <p className="replay-empty">
                The chart appears when the first bar is observed.
              </p>
            )}
          </>
        )}
      </main>
    </>
  )
}
