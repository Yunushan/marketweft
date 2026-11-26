import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DividendEvent, MarketCore, Split } from './market-core'
import { splitTimeline } from './split-events'
import {
  dividendName,
  dividendTimeline,
  type TimelineEvent,
} from './dividend-events'
import { DividendLedger } from './DividendLedger'
import { UniverseReplay } from './UniverseReplay'
import { FundamentalReplay } from './FundamentalReplay'
import { MacroReplay } from './MacroReplay'
import { OptionReplay } from './OptionReplay'
import { AlertReplay } from './AlertReplay'
import { PaperReplay } from './PaperReplay'
import { BacktestReplay } from './BacktestReplay'
import type { Asset } from './workspace'
import { Chart } from './Chart'
import { Icon, Mark } from './Icons'
import { price, utc } from './workspace'
import demoCalendar from '../../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv?raw'
import demoBars from '../../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv?raw'
import splitCalendar from '../../../crates/core/tests/fixtures/synthetic-split-sessions.csv?raw'
import splitBars from '../../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv?raw'
import splitActions from '../../../crates/core/tests/fixtures/synthetic-split-actions.csv?raw'
import dividendActions from '../../../crates/core/tests/fixtures/synthetic-cash-dividends.csv?raw'

const eventNames = {
  open: 'Session opened',
  bar: 'Bar observed',
  missing: 'Missing interval',
  close: 'Session closed',
  'split-notice': 'Split report observed',
  'split-effective': 'Split effective',
}
function eventLabel(event: TimelineEvent | undefined) {
  if (!event) return 'Ready to replay'
  if (event.kind !== 'dividend') return eventNames[event.kind]
  return event.dividends.length === 1
    ? dividendName[event.dividends[0].kind]
    : 'Dividend events'
}
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
  events: TimelineEvent[]
  counts: Uint32Array
  splits: Split[]
  dividends?: { events: DividendEvent[]; shares: number }
}

type ReplayView = 'universe' | 'fundamentals' | 'macro' | 'options' | 'alerts' | 'paper' | 'backtest'

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
  const [view, setView] = useState<ReplayView | null>(null)
  const universeButton = useRef<HTMLButtonElement>(null)
  const fundamentalsButton = useRef<HTMLButtonElement>(null)
  const macroButton = useRef<HTMLButtonElement>(null)
  const optionsButton = useRef<HTMLButtonElement>(null)
  const alertsButton = useRef<HTMLButtonElement>(null)
  const paperButton = useRef<HTMLButtonElement>(null)
  const backtestButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<ReplayView | null>(null)
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
  const [actionsFile, setActionsFile] = useState<File | null>(null)
  const [dividendFile, setDividendFile] = useState<File | null>(null)
  const [entitledShares, setEntitledShares] = useState('100')
  const [rawConfirmed, setRawConfirmed] = useState(false)
  const [basis, setBasis] = useState<'raw' | 'adjusted'>('raw')
  const terminal = useRef<HTMLHeadingElement>(null)
  const chart = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    terminal.current?.focus()
  }, [])
  useEffect(() => {
    if (active) chart.current?.focus()
  }, [active])
  useEffect(() => {
    if (view === null && returnFocus.current) {
      const buttons = {
        universe: universeButton,
        fundamentals: fundamentalsButton,
        macro: macroButton,
        options: optionsButton,
        alerts: alertsButton,
        paper: paperButton,
        backtest: backtestButton,
      }
      const button = buttons[returnFocus.current]
      returnFocus.current = null
      button.current?.focus()
    }
  }, [view])

  function start(
    asset: Asset,
    calendar: string,
    seconds: number,
    calendarName: string,
    inputs?: { splits?: string; dividends?: { csv: string; shares: number } },
  ) {
    const splits =
      inputs?.splits === undefined
        ? []
        : core.splitBook(asset.id, inputs.splits)
    const dividends = inputs?.dividends && {
      events: core.dividendLedger(
        asset.id,
        inputs.dividends.csv,
        inputs.dividends.shares,
      ),
      shares: inputs.dividends.shares,
    }
    const events = dividendTimeline(
      splitTimeline(core.replay(calendar, seconds, asset.bars), splits),
      dividends?.events ?? [],
    )
    const counts = new Uint32Array(events.length + 1)
    events.forEach((event, i) => {
      counts[i + 1] = counts[i] + Number(event.kind === 'bar')
    })
    setCursor(-1)
    setPlaying(false)
    setBasis('raw')
    setActive({ asset, calendarName, events, counts, splits, dividends })
  }

  function splitDemo() {
    setError('')
    try {
      start(
        {
          id: 'DEMO:SPLIT',
          venue: 'DEMO',
          symbol: 'SPLIT',
          name: 'Synthetic raw OHLCV',
          source: 'sample',
          bars: core.parseCsv(splitBars),
        },
        splitCalendar,
        600,
        'Synthetic market · Jun 2–3, 2025',
        { splits: splitActions },
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start the split demo.',
      )
    }
  }

  function dividendDemo() {
    setError('')
    try {
      start(
        {
          id: 'DEMO:DIVIDEND',
          venue: 'DEMO',
          symbol: 'DIVIDEND',
          name: 'Synthetic raw OHLCV',
          source: 'sample',
          bars: core.parseCsv(splitBars),
        },
        splitCalendar,
        600,
        'Synthetic market · 100 entitled shares',
        { dividends: { csv: dividendActions, shares: 100 } },
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start the dividend demo.',
      )
    }
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
      if (actionsFile && (!rawConfirmed || actionsFile.size > 1024 * 1024))
        throw Error(
          'Confirm a raw OHLCV source and choose a corporate actions CSV of at most 1 MiB.',
        )
      if (dividendFile && dividendFile.size > 1024 * 1024)
        throw Error('Cash dividends CSV exceeds 1 MiB.')
      const decoder = new TextDecoder('utf-8', { fatal: true })
      const calendar = decoder.decode(await calendarFile.arrayBuffer())
      const actions = actionsFile
        ? decoder.decode(await actionsFile.arrayBuffer())
        : undefined
      const dividends = dividendFile
        ? {
            csv: decoder.decode(await dividendFile.arrayBuffer()),
            shares: Number(entitledShares),
          }
        : undefined
      start(asset, calendar, Number(interval), calendarFile.name, {
        splits: actions,
        dividends,
      })
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
  const rawBars = useMemo(
    () => active?.asset.bars.slice(0, count) ?? [],
    [active, count],
  )
  const clock = event?.observedAt
  const { bars, adjustmentError } = useMemo(() => {
    if (
      basis === 'raw' ||
      !active ||
      active.splits.length === 0 ||
      clock === undefined ||
      rawBars.length === 0
    )
      return { bars: rawBars, adjustmentError: '' }
    try {
      return {
        bars: core.adjustSplits(rawBars, active.splits, clock),
        adjustmentError: '',
      }
    } catch (cause) {
      return {
        bars: [],
        adjustmentError:
          cause instanceof Error
            ? cause.message
            : 'Could not adjust the visible prefix.',
      }
    }
  }, [active, basis, clock, core, rawBars])
  const sma = useMemo(() => core.indicator('sma', 20, bars), [bars, core])
  const ema = useMemo(() => core.indicator('ema', 9, bars), [bars, core])

  if (view === 'universe')
    return (
      <UniverseReplay
        core={core}
        close={() => {
          setView(null)
        }}
      />
    )
  if (view === 'fundamentals')
    return <FundamentalReplay core={core} close={() => setView(null)} />
  if (view === 'macro')
    return <MacroReplay core={core} close={() => setView(null)} />
  if (view === 'options')
    return <OptionReplay core={core} close={() => setView(null)} />
  if (view === 'alerts')
    return <AlertReplay core={core} close={() => setView(null)} />
  if (view === 'paper')
    return <PaperReplay core={core} close={() => setView(null)} />
  if (view === 'backtest')
    return <BacktestReplay core={core} close={() => setView(null)} />

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
            <div className="replay-examples">
              <section className="side-card replay-panel">
                <h2>Session replay demo</h2>
                <p>
                  Replay synthetic 30-minute bars in the NYSE core session
                  calendar. Inspect the November clock change, an omitted bar
                  and the Thanksgiving early close.
                </p>
                <button className="primary" onClick={demo} disabled={busy}>
                  Start demo
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Stock split demo</h2>
                <p>
                  Compare raw and adjusted candles before and after a synthetic
                  2-for-1 split. Rewind to inspect what was known at each point.
                </p>
                <button className="primary" onClick={splitDemo} disabled={busy}>
                  Start split demo
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Cash dividend demo</h2>
                <p>
                  Follow receivables and cash through an ex-date, a changed pay
                  date and late reports in two currencies.
                </p>
                <button
                  className="primary"
                  onClick={dividendDemo}
                  disabled={busy}
                >
                  Start dividend demo
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Universe membership</h2>
                <p>
                  Inspect members and excluded listings at separate effective
                  and observation cutoffs.
                </p>
                <button
                  ref={universeButton}
                  className="primary"
                  onClick={() => {
                    returnFocus.current = 'universe'
                    setView('universe')
                  }}
                  disabled={busy}
                >
                  Open universe replay
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Financial statements</h2>
                <p>Compare annual filings, restatements and valuation at a historical cutoff.</p>
                <button ref={fundamentalsButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'fundamentals'
                    setView('fundamentals')
                  }}>
                  Open financial statements
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Economic calendar</h2>
                <p>Reconstruct release times, forecasts, published actuals and revisions.</p>
                <button ref={macroButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'macro'
                    setView('macro')
                  }}>
                  Open economic calendar
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Option chain</h2>
                <p>Reconstruct European option quotes and estimate implied volatility and Greeks.</p>
                <button ref={optionsButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'options'
                    setView('options')
                  }}>
                  Open option chain
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Replay alerts</h2>
                <p>Audit threshold and moving-average crossings and save notifications locally.</p>
                <button ref={alertsButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'alerts'
                    setView('alerts')
                  }}>
                  Open replay alerts
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Paper ledger</h2>
                <p>Replay simulated orders, fills and a local kill switch with an auditable cash ledger.</p>
                <button ref={paperButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'paper'
                    setView('paper')
                  }}>
                  Open paper ledger
                </button>
              </section>
              <section className="side-card replay-panel">
                <h2>Bar backtest</h2>
                <p>Replay an SMA crossover with delayed fills, volume limits and paper fees.</p>
                <button ref={backtestButton} className="primary" disabled={busy}
                  onClick={() => {
                    returnFocus.current = 'backtest'
                    setView('backtest')
                  }}>
                  Open bar backtest
                </button>
              </section>
            </div>
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
              <label>
                Corporate actions CSV (optional)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(event) => {
                    setActionsFile(event.target.files?.[0] ?? null)
                    setRawConfirmed(false)
                  }}
                />
              </label>
              {actionsFile && (
                <label className="replay-confirm-raw">
                  <input
                    type="checkbox"
                    required
                    checked={rawConfirmed}
                    disabled={busy}
                    onChange={(event) => setRawConfirmed(event.target.checked)}
                  />
                  My OHLCV contains raw prices and volume.
                </label>
              )}
              <details>
                <summary>Corporate actions format</summary>
                <p>
                  Use the selected instrument ID, exact UTC times and the
                  new-to-old share ratio. The latest report known at each replay
                  step is applied once effective. Keep the file with its source
                  and usage terms.
                </p>
                <pre>
                  instrument,announced_at,effective_at,observed_at,new_shares,old_shares
                  {'\n'}
                  DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
                </pre>
              </details>
              <label>
                Cash dividends CSV (optional)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(event) =>
                    setDividendFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              {dividendFile && (
                <label>
                  Entitled shares per distribution
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                    disabled={busy}
                    value={entitledShares}
                    onChange={(event) => setEntitledShares(event.target.value)}
                  />
                </label>
              )}
              <details>
                <summary>Cash dividends format</summary>
                <p>
                  Supply a stable ID, announcement, ex-date, pay date, report
                  observation time and a cash amount per entitled share. Define
                  each date as an exact UTC instant. Reuse the ID for revisions.
                </p>
                <pre>
                  instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
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
                {active.splits.length > 0 && (
                  <label>
                    Price basis
                    <select
                      value={basis}
                      onChange={(event) =>
                        setBasis(
                          event.target.value === 'adjusted'
                            ? 'adjusted'
                            : 'raw',
                        )
                      }
                    >
                      <option value="raw">Raw</option>
                      <option value="adjusted">Split-adjusted</option>
                    </select>
                  </label>
                )}
              </div>
              <div
                className="replay-state"
                aria-live={playing ? 'off' : 'polite'}
              >
                <div>
                  <strong>{eventLabel(event)}</strong>
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
                    {'split' in event ? (
                      <div>
                        <dt>Share ratio</dt>
                        <dd>
                          {event.split.newShares} for {event.split.oldShares}
                        </dd>
                      </div>
                    ) : 'sessionIndex' in event ? (
                      <div>
                        <dt>Session</dt>
                        <dd>
                          {event.sessionIndex + 1} ·{' '}
                          {event.earlyClose ? 'Early close' : 'Regular'} ·{' '}
                          {openingOffset(event.utcOffsetMinutes)} at open
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Event time</dt>
                      <dd>
                        <time dateTime={utc(event.eventTime)}>
                          {utc(event.eventTime)}
                        </time>
                      </dd>
                    </div>
                    {'split' in event && (
                      <div>
                        <dt>Effective at</dt>
                        <dd>
                          <time dateTime={utc(event.split.effectiveAt)}>
                            {utc(event.split.effectiveAt)}
                          </time>
                        </dd>
                      </div>
                    )}
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
            {active.dividends && (
              <DividendLedger
                events={active.dividends.events}
                shares={active.dividends.shares}
                cutoff={clock ?? -Infinity}
                current={event?.kind === 'dividend' ? event.dividends : []}
              />
            )}
            {adjustmentError ? (
              <p role="alert" className="warning replay-empty">
                {adjustmentError} Select Raw to inspect the original prefix.
              </p>
            ) : bars.length > 0 ? (
              <article className="chart-card replay-chart">
                <div className="plot-toolbar">
                  <div className="chart-kind">
                    <Icon name="chart" />
                    <b>
                      {basis === 'adjusted'
                        ? 'Split-adjusted candles'
                        : 'Observed candles'}
                    </b>
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
