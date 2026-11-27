import { useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { Chart } from './Chart'
import { ChartExport } from './ChartExport'
import { DEFAULT_KAGI_TICKS, DEFAULT_POINT_FIGURE_TICKS, DEFAULT_RENKO_TICKS, MAX_CHART_PRICE_TICKS } from './catalog-schema'
import { fixed, parsePriceSize } from './fixed-point'
import type { KagiSegment, PointFigureBox, PriceMovement } from './market-core'
import type { TimeframeView } from './chart-export'
import type { MarketCore } from './market-core'

type Props = Omit<ComponentProps<typeof Chart>, 'sma' | 'ema' | 'timeframe' | 'displayBars' | 'priceMovements' | 'kagiSegments' | 'pointFigureBoxes' | 'pointFigureSize'> & {
  core: MarketCore
  activeSma?: boolean
  activeEma?: boolean
  renkoTicks?: number
  kagiTicks?: number
  pointFigureTicks?: number
  priceSizeSaving?: boolean
  onRenkoTicks?: (ticks: number) => void
  onKagiTicks?: (ticks: number) => void
  onPointFigureTicks?: (ticks: number) => void
}

function PriceSize({ ticks, saving, apply, type }: {
  ticks: number; saving?: boolean; apply: (ticks: number) => void; type: 'renko' | 'kagi' | 'point-and-figure'
}) {
  const label = type === 'renko' ? 'Brick size' : type === 'kagi' ? 'Reversal size' : 'Box size'
  const [error, setError] = useState('')
  return <form className="chart-export price-size-control" aria-label={type === 'renko' ? 'Renko brick settings' : type === 'kagi' ? 'Kagi reversal settings' : 'Point and Figure box settings'} onSubmit={event => {
    event.preventDefault()
    const ticks = parsePriceSize(String(new FormData(event.currentTarget).get('size')))
    if (ticks === null) {
      setError('Enter a positive ' + label.toLowerCase() + ' with up to six decimal places.')
      return
    }
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
  renkoTicks = DEFAULT_RENKO_TICKS, kagiTicks = DEFAULT_KAGI_TICKS, pointFigureTicks = DEFAULT_POINT_FIGURE_TICKS,
  priceSizeSaving, onRenkoTicks, onKagiTicks, onPointFigureTicks, ...chart }: Props) {
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
  const type = chart.type
  const sizeTicks = type === 'renko' ? renkoTicks : type === 'kagi' ? kagiTicks : pointFigureTicks
  const applySize = type === 'renko' ? onRenkoTicks : type === 'kagi' ? onKagiTicks : onPointFigureTicks
  const isSized = type === 'renko' || type === 'kagi' || type === 'point-and-figure'
  const transformed = useMemo<{
    priceMovements?: PriceMovement[]; kagiSegments?: KagiSegment[]; pointFigureBoxes?: PointFigureBox[]; error?: string;
  } | undefined>(() => {
    try {
      switch (type) {
        case 'renko': return { priceMovements: core.renko(display.bars, BigInt(sizeTicks)) }
        case 'three-line-break': return { priceMovements: core.threeLineBreak(display.bars) }
        case 'kagi': return { kagiSegments: core.kagi(display.bars, BigInt(sizeTicks)) }
        case 'point-and-figure': return { pointFigureBoxes: core.pointAndFigure(display.bars, BigInt(sizeTicks)) }
        default: return undefined
      }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not construct the chart.' }
    }
  }, [core, type, display.bars, sizeTicks])
  const count = transformed?.priceMovements?.length ?? transformed?.kagiSegments?.length ??
    transformed?.pointFigureBoxes?.length ?? 0
  const lastColumn = transformed?.kagiSegments?.at(-1)?.column ??
    transformed?.pointFigureBoxes?.at(-1)?.column ?? count - 1
  const priceChartKey = transformed ? type + ':' + count + ':' + lastColumn + ':' + (isSized ? sizeTicks : '') : 'bars'
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
      {isSized && applySize && <PriceSize key={type + ':' + sizeTicks} ticks={sizeTicks} saving={priceSizeSaving}
        type={type} apply={ticks => {
          onTimestamp?.(null)
          applySize(ticks)
        }} />}
      {transformed && !count ? <>
        {transformed.error ? <p role="alert">{transformed.error}</p> :
          <p role="status">{type === 'renko' ? 'No source close has moved far enough to form a brick at this size.' :
            type === 'kagi' ? 'No source close has reached the reversal size to start a line.' :
            type === 'point-and-figure' ? 'No source close has moved far enough to fill a box at this size.' :
            'No source close has moved beyond the first close to form a line.'}</p>}
        {chart.exportOptions && <ChartExport asset={display} visible={{ start: 0, end: display.bars.length }}
          metadata={chart.exportOptions.metadata} timeframe={timeframe}
          overlays={periods ? [
            { name: 'sma_' + periods.sma, series: sma },
            { name: 'ema_' + periods.ema, series: ema },
          ].filter(overlay => overlay.series.length > 0) : []} />}
      </> : <Chart {...chart} key={`${timeframe?.revision ?? 'source'}:${priceChartKey}`}
        asset={display} displayBars={displayBars} priceMovements={transformed?.priceMovements} kagiSegments={transformed?.kagiSegments}
        pointFigureBoxes={transformed?.pointFigureBoxes} pointFigureSize={sizeTicks / 1e6}
        sma={sma} ema={ema} periods={periods}
        timeframe={timeframe} onTimestamp={onTimestamp} />}
    </>
  )
}
