import { useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { Chart } from './Chart'
import { ChartExport } from './ChartExport'
import { DEFAULT_RENKO_TICKS, MAX_RENKO_TICKS } from './catalog-schema'
import { fixed } from './fixed-point'
import type { PriceMovement } from './market-core'
import type { TimeframeView } from './chart-export'
import type { MarketCore } from './market-core'

type Props = Omit<ComponentProps<typeof Chart>, 'sma' | 'ema' | 'timeframe' | 'displayBars' | 'priceMovements'> & {
  core: MarketCore
  activeSma?: boolean
  activeEma?: boolean
  renkoTicks?: number
  renkoSaving?: boolean
  onRenkoTicks?: (ticks: number) => void
}

function RenkoSize({ ticks, saving, apply }: { ticks: number; saving?: boolean; apply: (ticks: number) => void }) {
  const [error, setError] = useState('')
  return <form className="chart-export renko-control" aria-label="Renko brick settings" onSubmit={event => {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('brickSize')).trim()
    const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value)
    if (!parts) {
      setError('Enter a positive brick size with up to six decimal places.')
      return
    }
    const ticks = BigInt(parts[1]) * 1_000_000n + BigInt((parts[2] ?? '').padEnd(6, '0'))
    if (ticks <= 0n || ticks > MAX_RENKO_TICKS) {
      setError('Brick size must be between 0.000001 and 2,000,000,000.')
      return
    }
    setError('')
    apply(Number(ticks))
  }}>
    <label>Brick size (price units)
      <input name="brickSize" inputMode="decimal" maxLength={19} defaultValue={fixed(BigInt(ticks), 6)}
        disabled={saving} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit" disabled={saving}>Apply brick size</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

export function TimeframeChart({ core, activeSma, activeEma, asset, periods, onTimestamp,
  renkoTicks = DEFAULT_RENKO_TICKS, renkoSaving, onRenkoTicks, ...chart }: Props) {
  const initialSource = asset.source === 'sample' ? '86400' : ''
  const [source, setSource] = useState(initialSource)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [calendar, setCalendar] = useState<File | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rolled, setRolled] = useState<(TimeframeView & { sourceBars: typeof asset.bars; revision: number }) | null>(null)
  const revision = useRef(0)
  const timeframe = rolled?.sourceBars === asset.bars ? rolled : undefined
  const display = useMemo(() => timeframe ?
    { ...asset, bars: timeframe.buckets.map(entry => entry.bar) } : asset, [asset, timeframe])
  const displayBars = useMemo(() => chart.type === 'heikin-ashi' ?
    core.heikinAshi(display.bars) : undefined, [core, chart.type, display.bars])
  const isRenko = chart.type === 'renko'
  const priceMovements = useMemo<{ lines: PriceMovement[]; error?: string } | undefined>(() => {
    if (!isRenko && chart.type !== 'three-line-break') return undefined
    try {
      return { lines: isRenko ? core.renko(display.bars, BigInt(renkoTicks)) : core.threeLineBreak(display.bars) }
    } catch (cause) {
      return { lines: [], error: cause instanceof Error ? cause.message : 'Could not construct the chart.' }
    }
  }, [core, chart.type, display.bars, isRenko, renkoTicks])
  const sma = useMemo(() => activeSma && periods ?
    core.indicator('sma', periods.sma, display.bars) : [], [core, activeSma, periods?.sma, display.bars])
  const ema = useMemo(() => activeEma && periods ?
    core.indicator('ema', periods.ema, display.bars) : [], [core, activeEma, periods?.ema, display.bars])

  async function apply() {
    if (busy) return
    setBusy(true)
    try {
      if (!/^\d+$/.test(source.trim()) || !/^\d+$/.test(target.trim())) {
        throw new Error('Enter both durations in whole seconds.')
      }
      const sourceSeconds = Number(source)
      const targetSeconds = Number(target)
      if (calendar && calendar.size > 1024 * 1024) throw new Error('Session calendar exceeds 1 MiB.')
      const common = { sourceSeconds, targetSeconds }
      const timeframe: TimeframeView = calendar ? {
        ...common, mode: 'session', calendarName: calendar.name,
        buckets: core.aggregateSessionTimeframe(await calendar.text(), asset.bars, sourceSeconds, targetSeconds),
      } : { ...common, mode: 'utc', buckets: core.aggregateTimeframe(asset.bars, sourceSeconds, targetSeconds) }
      onTimestamp?.(null)
      setRolled({ ...timeframe, sourceBars: asset.bars, revision: ++revision.current })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not aggregate this timeframe.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <details className="chart-export timeframe-control" onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary>{timeframe ? (timeframe.mode === 'session' ? 'Session timeframe' : 'Timeframe') +
          ' · ' + timeframe.targetSeconds + ' seconds' : 'Timeframe'}</summary>
        <form aria-label="Fixed-duration timeframe" onSubmit={event => {
          event.preventDefault()
          void apply()
        }}>
          <label>Source interval (seconds)
            <input inputMode="numeric" value={source} disabled={busy} onChange={event => setSource(event.target.value)} />
          </label>
          <label>Target interval (seconds)
            <input inputMode="numeric" value={target} disabled={busy} onChange={event => setTarget(event.target.value)} />
          </label>
          {expanded && <label>Session calendar CSV (optional)
            <input type="file" accept=".csv,text/csv" disabled={busy}
              onChange={event => setCalendar(event.target.files?.[0] ?? null)} />
          </label>}
          {calendar && <button className="outline" type="button" disabled={busy} onClick={event => {
            const picker = event.currentTarget.form?.querySelector<HTMLInputElement>('input[type=file]')
            if (picker) picker.value = ''
            setCalendar(null)
          }}>Remove calendar · {calendar.name}</button>}
          <button className="outline" type="submit" disabled={busy}>Apply timeframe</button>
          {timeframe && <button className="outline" type="button" disabled={busy} onClick={() => {
            setRolled(null)
            setError('')
            onTimestamp?.(null)
          }}>Show source bars</button>}
          {error && <p role="alert">{error}</p>}
        </form>
      </details>
      {isRenko && onRenkoTicks && <RenkoSize key={renkoTicks} ticks={renkoTicks} saving={renkoSaving}
        apply={ticks => {
          onTimestamp?.(null)
          onRenkoTicks(ticks)
        }} />}
      {priceMovements && !priceMovements.lines.length ? <>
        {priceMovements.error ? <p role="alert">{priceMovements.error}</p> :
          <p role="status">{isRenko ? 'No source close has moved far enough to form a brick at this size.' :
            'No source close has moved beyond the first close to form a line.'}</p>}
        {chart.exportOptions && <ChartExport asset={display} visible={{ start: 0, end: display.bars.length }}
          metadata={chart.exportOptions.metadata} timeframe={timeframe}
          overlays={periods ? [
            { name: 'sma_' + periods.sma, series: sma },
            { name: 'ema_' + periods.ema, series: ema },
          ].filter(overlay => overlay.series.length > 0) : []} />}
      </> : <Chart {...chart} key={`${timeframe?.revision ?? 'source'}:${priceMovements ? chart.type + ':' + priceMovements.lines.length : 'bars'}:${isRenko ? renkoTicks : ''}`}
        asset={display} displayBars={displayBars} priceMovements={priceMovements?.lines} sma={sma} ema={ema} periods={periods}
        timeframe={timeframe} onTimestamp={onTimestamp} />}
    </>
  )
}
