import { useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { Chart } from './Chart'
import { ChartExport } from './ChartExport'
import { DEFAULT_KAGI_TICKS, DEFAULT_RENKO_TICKS, MAX_CHART_PRICE_TICKS } from './catalog-schema'
import { fixed } from './fixed-point'
import type { KagiSegment, PriceMovement } from './market-core'
import type { TimeframeView } from './chart-export'
import type { MarketCore } from './market-core'

type Props = Omit<ComponentProps<typeof Chart>, 'sma' | 'ema' | 'timeframe' | 'displayBars' | 'priceMovements' | 'kagiSegments'> & {
  core: MarketCore
  activeSma?: boolean
  activeEma?: boolean
  renkoTicks?: number
  kagiTicks?: number
  priceSizeSaving?: boolean
  onRenkoTicks?: (ticks: number) => void
  onKagiTicks?: (ticks: number) => void
}

function PriceSize({ ticks, saving, apply, type }: {
  ticks: number; saving?: boolean; apply: (ticks: number) => void; type: 'renko' | 'kagi'
}) {
  const label = type === 'renko' ? 'Brick size' : 'Reversal size'
  const [error, setError] = useState('')
  return <form className="chart-export price-size-control" aria-label={type === 'renko' ? 'Renko brick settings' : 'Kagi reversal settings'} onSubmit={event => {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('size')).trim()
    const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value)
    if (!parts) {
      setError('Enter a positive ' + label.toLowerCase() + ' with up to six decimal places.')
      return
    }
    const ticks = BigInt(parts[1]) * 1_000_000n + BigInt((parts[2] ?? '').padEnd(6, '0'))
    if (ticks <= 0n || ticks > MAX_CHART_PRICE_TICKS) {
      setError(label + ' must be between 0.000001 and 2,000,000,000.')
      return
    }
    setError('')
    apply(Number(ticks))
  }}>
    <label>{label} (price units)
      <input name="size" inputMode="decimal" maxLength={19} defaultValue={fixed(BigInt(ticks), 6)}
        disabled={saving} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit" disabled={saving}>Apply {label.toLowerCase()}</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

export function TimeframeChart({ core, activeSma, activeEma, asset, periods, onTimestamp,
  renkoTicks = DEFAULT_RENKO_TICKS, kagiTicks = DEFAULT_KAGI_TICKS, priceSizeSaving, onRenkoTicks, onKagiTicks, ...chart }: Props) {
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
  const kagi = useMemo<{ segments: KagiSegment[]; error?: string } | undefined>(() => {
    if (chart.type !== 'kagi') return undefined
    try {
      return { segments: core.kagi(display.bars, BigInt(kagiTicks)) }
    } catch (cause) {
      return { segments: [], error: cause instanceof Error ? cause.message : 'Could not construct the chart.' }
    }
  }, [core, chart.type, display.bars, kagiTicks])
  const applySize = isRenko ? onRenkoTicks : chart.type === 'kagi' ? onKagiTicks : undefined
  const sizeTicks = isRenko ? renkoTicks : kagiTicks
  const empty = (priceMovements && priceMovements.lines.length === 0) || (kagi && kagi.segments.length === 0)
  const priceChartError = priceMovements?.error ?? kagi?.error
  const priceChartKey = kagi ? 'kagi:' + kagiTicks + ':' + kagi.segments.length :
    priceMovements ? chart.type + ':' + priceMovements.lines.length + ':' + (isRenko ? renkoTicks : '') : 'bars'
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
      {applySize && <PriceSize key={chart.type + ':' + sizeTicks} ticks={sizeTicks} saving={priceSizeSaving}
        type={isRenko ? 'renko' : 'kagi'} apply={ticks => {
          onTimestamp?.(null)
          applySize(ticks)
        }} />}
      {empty ? <>
        {priceChartError ? <p role="alert">{priceChartError}</p> :
          <p role="status">{isRenko ? 'No source close has moved far enough to form a brick at this size.' :
            kagi ? 'No source close has reached the reversal size to start a line.' :
            'No source close has moved beyond the first close to form a line.'}</p>}
        {chart.exportOptions && <ChartExport asset={display} visible={{ start: 0, end: display.bars.length }}
          metadata={chart.exportOptions.metadata} timeframe={timeframe}
          overlays={periods ? [
            { name: 'sma_' + periods.sma, series: sma },
            { name: 'ema_' + periods.ema, series: ema },
          ].filter(overlay => overlay.series.length > 0) : []} />}
      </> : <Chart {...chart} key={`${timeframe?.revision ?? 'source'}:${priceChartKey}`}
        asset={display} displayBars={displayBars} priceMovements={priceMovements?.lines} kagiSegments={kagi?.segments} sma={sma} ema={ema} periods={periods}
        timeframe={timeframe} onTimestamp={onTimestamp} />}
    </>
  )
}
