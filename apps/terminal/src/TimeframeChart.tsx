import { useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { formatAnnotationAnchor, parseAnnotationAnchor } from './chart-annotations'
import { Chart } from './Chart'
import type { RegressionDrawingView } from './Chart'
import { ChartExport } from './ChartExport'
import { DEFAULT_KAGI_TICKS, DEFAULT_POINT_FIGURE_TICKS, DEFAULT_RENKO_TICKS, DEFAULT_SWING_SETTINGS, MAX_CHART_PRICE_TICKS, validChartIntervalSeconds, validSwingSide } from './catalog-schema'
import type { SwingSettings } from './catalog-schema'
import { fixed, parsePriceSize, tickPrice } from './fixed-point'
import type { KagiSegment, PointFigureBox, PriceMovement } from './market-core'
import type { AnchoredVwapSeries, CloseChangeSeries, CloseDistributionSeries, DrawdownSeries, RebasedReturnSeries, SwingSeries, TimeframeView } from './chart-export'
import type { Bar, MarketCore } from './market-core'
import { computeStudies, studyOverlays } from './studies'
import type { StudySet } from './studies'

type Props = Omit<ComponentProps<typeof Chart>, 'sma' | 'ema' | 'studies' | 'timeframe' | 'displayBars' | 'priceMovements' | 'kagiSegments' | 'pointFigureBoxes' | 'pointFigureSize' | 'closeChanges' | 'bandSeconds' | 'rebasedReturns' | 'drawdowns' | 'swings' | 'closeDistributions' | 'anchoredVwaps' | 'sourceObservationTimes' | 'regressionDrawings'> & {
  core: MarketCore
  activeSma?: boolean
  activeEma?: boolean
  studySettings?: StudySet
  renkoTicks?: number
  kagiTicks?: number
  pointFigureTicks?: number
  priceSizeSaving?: boolean
  onBaselineTicks?: (ticks: number) => void
  closeChangeSeconds?: number
  onCloseChangeSeconds?: (seconds: number) => void
  highLowSeconds?: number
  onHighLowSeconds?: (seconds: number) => void
  rebaseTime?: number
  onRebaseTime?: (time: number | null) => void
  swingSettings?: SwingSettings
  onSwingSettings?: (settings: SwingSettings) => void
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

function BaselinePrice({ ticks, saving, apply }: {
  ticks: number; saving?: boolean; apply: (ticks: number) => void
}) {
  const [error, setError] = useState('')
  return <form className="chart-export price-size-control" aria-label="Baseline settings" onSubmit={event => {
    event.preventDefault()
    try {
      const price = String(new FormData(event.currentTarget).get('baseline'))
      apply(parseAnnotationAnchor('price', price))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid baseline price.')
    }
  }}>
    <label>Baseline price
      <input name="baseline" inputMode="decimal" maxLength={19} defaultValue={fixed(BigInt(ticks), 6)}
        disabled={saving} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit" disabled={saving}>Apply baseline</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

function ChartInterval({ label, seconds, saving, apply }: {
  label: string; seconds?: number; saving?: boolean; apply: (seconds: number) => void
}) {
  const [error, setError] = useState('')
  return <form className="chart-export price-size-control" aria-label={label + ' settings'} onSubmit={event => {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('interval')).trim()
    if (!/^\d+$/.test(value) || !validChartIntervalSeconds(Number(value))) {
      setError('Enter a positive whole-second interval within the supported range.')
      return
    }
    setError('')
    apply(Number(value))
  }}>
    <label>{label} interval (seconds)
      <input name="interval" inputMode="numeric" maxLength={10} defaultValue={seconds}
        disabled={saving} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit" disabled={saving}>Apply interval</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

function RebaseAnchor({ time, custom, saving, apply }: {
  time?: number; custom: boolean; saving?: boolean; apply: (time: number | null) => void
}) {
  const [error, setError] = useState('')
  return <form className="chart-export price-size-control" aria-label="Rebased chart settings" onSubmit={event => {
    event.preventDefault()
    try {
      apply(parseAnnotationAnchor('time', String(new FormData(event.currentTarget).get('time'))))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid UTC anchor.')
    }
  }}>
    <label>Rebase at (UTC)
      <input name="time" defaultValue={time === undefined ? '' : formatAnnotationAnchor('time', time)}
        maxLength={20} spellCheck={false} autoComplete="off" disabled={saving} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit" disabled={saving}>Apply anchor</button>
    {custom && <button className="outline" type="button" disabled={saving} onClick={() => {
      setError('')
      apply(null)
    }}>Use first close</button>}
    {error && <p role="alert">{error}</p>}
  </form>
}

function SwingWindow({ settings, defaultSeconds, targetSeconds, saving, apply }: {
  settings: SwingSettings; defaultSeconds?: number; targetSeconds?: number
  saving?: boolean; apply: (settings: SwingSettings) => void
}) {
  const [error, setError] = useState('')
  return <form aria-label="Swing window" className="chart-export price-size-control" onSubmit={event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const left = Number(fields.get('left'))
    const right = Number(fields.get('right'))
    const interval = String(fields.get('seconds') ?? '').trim()
    const seconds = targetSeconds !== undefined ? settings.seconds : interval ? Number(interval) : undefined
    if (!validSwingSide(left) || !validSwingSide(right) ||
        (seconds !== undefined && !validChartIntervalSeconds(seconds))) {
      setError('Enter 1–1,000 bars per side and a positive whole-second interval.')
      return
    }
    setError('')
    apply(seconds === undefined ? { left, right } : { left, right, seconds })
  }}>
    <label>Left bars <input name="left" type="number" min={1} max={1000} step={1} required
      defaultValue={settings.left} disabled={saving} onChange={() => setError('')} /></label>
    <label>Right bars <input name="right" type="number" min={1} max={1000} step={1} required
      defaultValue={settings.right} disabled={saving} onChange={() => setError('')} /></label>
    <label>Swing interval (seconds) <input name="seconds" type="number" min={1} max={0xffff_ffff} step={1}
      defaultValue={targetSeconds ?? settings.seconds ?? defaultSeconds}
      disabled={saving || targetSeconds !== undefined} onChange={() => setError('')} /></label>
    <button className="outline" type="submit" disabled={saving}>Apply swing window</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

function SwingCutoff({ cutoff, apply }: { cutoff?: number; apply: (cutoff?: number) => void }) {
  const [error, setError] = useState('')
  return <form aria-label="Swing history cutoff" className="chart-export price-size-control" onSubmit={event => {
    event.preventDefault()
    try {
      const value = String(new FormData(event.currentTarget).get('cutoff')).trim()
      apply(value ? parseAnnotationAnchor('time', value) : undefined)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid UTC cutoff.')
    }
  }}>
    <label>Known through (UTC)
      <input name="cutoff" placeholder="Latest" maxLength={20} spellCheck={false} autoComplete="off"
        defaultValue={cutoff === undefined ? '' : formatAnnotationAnchor('time', cutoff)} onChange={() => setError('')} />
    </label>
    <button className="outline" type="submit">Apply cutoff</button>
    {cutoff !== undefined && <button className="outline" type="button" onClick={() => apply()}>Show latest</button>}
    {error && <p role="alert">{error}</p>}
  </form>
}

function timeframeSourceWindows(source: readonly Bar[], timeframe: TimeframeView) {
  let next = 0
  return timeframe.buckets.map((bucket, index) => {
    const start = bucket.bar.time
    const end = timeframe.mode === 'session' ? timeframe.buckets[index].closeTime : start + timeframe.targetSeconds
    while (next < source.length && source[next].time < start) next++
    const first = next
    while (next < source.length && source[next].time < end) next++
    return { first, last: next - 1 }
  })
}

export function TimeframeChart({ core, activeSma, activeEma, studySettings, asset, periods, onTimestamp,
  renkoTicks = DEFAULT_RENKO_TICKS, kagiTicks = DEFAULT_KAGI_TICKS, pointFigureTicks = DEFAULT_POINT_FIGURE_TICKS,
  baselineTicks = 0, priceSizeSaving, onBaselineTicks, onRenkoTicks, onKagiTicks, onPointFigureTicks,
  closeChangeSeconds, onCloseChangeSeconds, highLowSeconds, onHighLowSeconds, rebaseTime, onRebaseTime,
  swingSettings = DEFAULT_SWING_SETTINGS, onSwingSettings, ...chart }: Props) {
  const initialSource = asset.source === 'sample' ? '86400' : ''
  const [source, setSource] = useState(initialSource)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [calendar, setCalendar] = useState<File | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rolled, setRolled] = useState<(TimeframeView & { sourceBars: typeof asset.bars; revision: number }) | null>(null)
  const revision = useRef(0)
  const type = chart.type
  const [swingCutoff, setSwingCutoff] = useState<number>()
  const cutoff = type === 'confirmed-swings' ? swingCutoff : undefined
  const timeframe = useMemo(() => {
    if (!rolled || rolled.sourceBars !== asset.bars) return undefined
    if (cutoff === undefined) return rolled
    if (rolled.mode === 'session')
      return { ...rolled, buckets: rolled.buckets.filter(entry => entry.closeTime <= cutoff) }
    return { ...rolled, buckets: rolled.buckets.filter(entry => entry.bar.time + rolled.targetSeconds <= cutoff) }
  }, [rolled, asset.bars, cutoff])
  const display = useMemo(() => {
    if (timeframe) return { ...asset, bars: timeframe.buckets.map(entry => entry.bar) }
    if (cutoff === undefined) return asset
    return { ...asset, bars: asset.bars.filter(bar => bar.time <= cutoff) }
  }, [asset, timeframe, cutoff])
  const displayBars = useMemo(() => chart.type === 'heikin-ashi' ?
    core.heikinAshi(display.bars) : undefined, [core, chart.type, display.bars])
  const declaredInterval = /^(\d+) seconds?$/i.exec(chart.exportOptions?.metadata?.barInterval ?? '')?.[1]
  const defaultInterval = validChartIntervalSeconds(Number(declaredInterval)) ?
    Number(declaredInterval) : asset.source === 'sample' ? 86_400 : undefined
  const sourceInterval = (type === 'high-low-band' ? highLowSeconds : closeChangeSeconds) ?? defaultInterval
  const changeInterval = timeframe?.targetSeconds ?? sourceInterval
  const changes = useMemo<{ series?: CloseChangeSeries; error?: string }>(() => {
    if (type !== 'close-change' || changeInterval === undefined) return {}
    try {
      const values = core.closeChanges(changeInterval, display.bars)
      if (timeframe) {
        timeframe.buckets.forEach((bucket, index) => {
          if (bucket.observedBars < bucket.expectedBars ||
            (index > 0 && timeframe.buckets[index - 1].observedBars < timeframe.buckets[index - 1].expectedBars))
            values[index] = null
        })
      }
      return { series: { intervalSeconds: changeInterval, values } }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not calculate close changes.' }
    }
  }, [core, type, changeInterval, display.bars, timeframe])
  const rebased = useMemo<{ series?: RebasedReturnSeries; status?: string; error?: string }>(() => {
    if (type !== 'rebased-percent') return {}
    const buckets = timeframe?.buckets
    const index = rebaseTime === undefined ?
      (buckets ? buckets.findIndex(bucket => bucket.observedBars === bucket.expectedBars) : 0) :
      display.bars.findIndex(bar => bar.time === rebaseTime)
    const base = display.bars[index]
    const bucket = buckets?.[index]
    if (!base || (bucket && bucket.observedBars !== bucket.expectedBars))
      return { series: { anchorAt: rebaseTime, values: [] },
        status: 'Choose a UTC anchor with a complete observed close.' }
    const series = { anchorAt: base.time, baseClose: base.close }
    if (base.close === 0)
      return { series: { ...series, values: [] }, status: 'Choose a nonzero close to calculate percent change.' }
    try {
      const values = core.rebasedPercentChanges(base.time, display.bars)
      buckets?.forEach((entry, position) => {
        if (entry.observedBars !== entry.expectedBars) values[position] = null
      })
      return { series: { ...series, values } }
    } catch (cause) {
      return { series: { ...series, values: [] },
        error: cause instanceof Error ? cause.message : 'Could not calculate rebased changes.' }
    }
  }, [core, type, rebaseTime, display.bars, timeframe])
  const drawdown = useMemo<{ series?: DrawdownSeries; error?: string }>(() => {
    if (type !== 'drawdown') return {}
    try {
      const buckets = timeframe?.buckets
      if (!buckets) return { series: core.observedDrawdown(display.bars) }
      const complete = buckets.map(bucket => bucket.observedBars === bucket.expectedBars)
      const values = core.observedDrawdown(display.bars.filter((_, index) => complete[index]))
      let next = 0
      return { series: complete.map(included => included ? values[next++] : null) }
    } catch (cause) {
      return { series: [], error: cause instanceof Error ? cause.message : 'Could not calculate drawdown.' }
    }
  }, [core, type, display.bars, timeframe])
  const swingSeconds = timeframe?.targetSeconds ?? swingSettings.seconds ?? defaultInterval
  const { left: swingLeft, right: swingRight } = swingSettings
  const swing = useMemo<{ series?: SwingSeries; error?: string }>(() => {
    if (type !== 'confirmed-swings' || swingSeconds === undefined) return {}
    const buckets = timeframe?.buckets
    const complete = buckets?.map(bucket => bucket.observedBars === bucket.expectedBars)
    const availableAt = (index: number) => timeframe?.mode === 'session' ? timeframe.buckets[index].closeTime :
      display.bars[index].time + (timeframe?.targetSeconds ?? 0)
    const config = { left: swingLeft, right: swingRight, seconds: swingSeconds,
      cutoff: cutoff ?? (display.bars.length ? availableAt(display.bars.length - 1) : undefined) }
    try {
      const input = complete ? display.bars.filter((_, index) => complete[index]) : display.bars
      const values = core.confirmedCloseSwings(swingLeft, swingRight, swingSeconds, input)
      let next = 0
      return { series: { ...config, values: complete ? complete.map((included, index) => {
        if (!included) return null
        const point = values[next++]
        return point && { ...point, confirmedAt: availableAt(index) }
      }) : values } }
    } catch (cause) {
      return { series: { ...config, values: [] }, error: cause instanceof Error ? cause.message : 'Could not calculate swings.' }
    }
  }, [core, type, swingSeconds, swingLeft, swingRight, cutoff, display.bars, timeframe])
  const closeDistributions = useMemo<{ series?: CloseDistributionSeries; error?: string }>(() => {
    if (type !== 'close-distribution') return {}
    try {
      const complete = timeframe?.buckets.map(bucket => bucket.observedBars === bucket.expectedBars)
      const input = complete ? display.bars.filter((_, index) => complete[index]) : display.bars
      const size = 5
      const groups = core.observedCloseDistributions(input, size)
      const byLast = new Map(groups.map(point => [point.lastAt, point]))
      return { series: { size, values: display.bars.map(bar => byLast.get(bar.time) ?? null) } }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not calculate close distributions.' }
    }
  }, [core, type, display.bars, timeframe])
  const drawingTools = type === 'close-change' || type === 'rebased-percent' || type === 'drawdown' ?
    undefined : chart.drawingTools
  const annotations = drawingTools?.annotations
  const sourceWindows = useMemo(() => timeframe ? timeframeSourceWindows(asset.bars, timeframe) : undefined,
    [asset.bars, timeframe])
  const sourceObservationTimes = useMemo(() => sourceWindows?.map(({ first }) => asset.bars[first].time),
    [sourceWindows, asset.bars])
  const sourceLength = sourceWindows ? (sourceWindows.at(-1)?.last ?? -1) + 1 : display.bars.length
  const sourceBars = useMemo(() => sourceLength === asset.bars.length ? asset.bars : asset.bars.slice(0, sourceLength),
    [asset.bars, sourceLength])
  const anchoredVwaps = useMemo<AnchoredVwapSeries[]>(() => annotations?.flatMap(annotation => {
    if (annotation.kind !== 'anchored-vwap') return []
    const values = core.anchoredVwap(annotation.time, sourceBars)
    const pointAt = (index: number) => {
      const value = values[index]
      return value ? { ...value, observedAt: sourceBars[index].time } : null
    }
    return [{ id: annotation.id, anchorAt: annotation.time,
      values: sourceWindows ? sourceWindows.map(({ last }) => pointAt(last)) :
        values.map((_, index) => pointAt(index)) }]
  }) ?? [], [core, annotations, sourceBars, sourceWindows])
  const regressionDrawings = useMemo<RegressionDrawingView[]>(() => annotations?.flatMap<RegressionDrawingView>(annotation => {
    if (annotation.kind !== 'regression-channel') return []
    const fit = core.regressionChannel(annotation.lower, annotation.upper, sourceBars)
    if (!fit) return [{ id: annotation.id, fit, values: [] }]
    const first = sourceBars.findIndex(bar => bar.time === annotation.lower)
    const last = sourceBars.findIndex(bar => bar.time === annotation.upper)
    const startValue = tickPrice(fit.startTicks)
    const change = tickPrice(fit.endTicks - fit.startTicks)
    const valueAt = (start: number, end: number) => start > last || end < first ? null :
      startValue + change * (Math.min(end, last) - first) / (last - first)
    return [{ id: annotation.id, fit, values: sourceWindows ?
      sourceWindows.map(({ first, last }) => valueAt(first, last)) : sourceBars.map((_, index) => valueAt(index, index)) }]
  }) ?? [], [core, annotations, sourceBars, sourceWindows])
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
  const sma = useMemo(() => activeSma && periods && display.bars.length ?
    core.indicator('sma', periods.sma, display.bars) : [], [core, activeSma, periods?.sma, display.bars])
  const ema = useMemo(() => activeEma && periods && display.bars.length ?
    core.indicator('ema', periods.ema, display.bars) : [], [core, activeEma, periods?.ema, display.bars])

  const studies = useMemo(() => display.bars.length ? computeStudies(core, studySettings, display.bars, sourceBars) : [],
    [core, studySettings, display.bars, sourceBars])

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
      {type === 'baseline' && onBaselineTicks &&
        <BaselinePrice key={baselineTicks} ticks={baselineTicks} saving={priceSizeSaving} apply={onBaselineTicks} />}
      {type === 'close-change' && !timeframe && onCloseChangeSeconds &&
        <ChartInterval key={sourceInterval} label="Close-change" seconds={sourceInterval}
          saving={priceSizeSaving} apply={onCloseChangeSeconds} />}
      {type === 'high-low-band' && !timeframe && onHighLowSeconds &&
        <ChartInterval key={sourceInterval} label="High-low band" seconds={sourceInterval}
          saving={priceSizeSaving} apply={onHighLowSeconds} />}
      {type === 'close-change' && changeInterval === undefined &&
        <p role="status">Set an interval to calculate changes between consecutive closes.</p>}
      {changes.error && <p role="alert">{changes.error}</p>}
      {type === 'rebased-percent' && onRebaseTime &&
        <RebaseAnchor key={rebaseTime ?? rebased.series?.anchorAt} time={rebaseTime ?? rebased.series?.anchorAt}
          saving={priceSizeSaving} custom={rebaseTime !== undefined} apply={onRebaseTime} />}
      {rebased.status && <p role="status">{rebased.status}</p>}
      {rebased.error && <p role="alert">{rebased.error}</p>}
      {drawdown.error && <p role="alert">{drawdown.error}</p>}
      {drawdown.series && !drawdown.error && !drawdown.series.some(point => point !== null) &&
        <p role="status">Drawdown requires a positive observed close.</p>}
      {closeDistributions.error && <p role="alert">{closeDistributions.error}</p>}
      {closeDistributions.series && !closeDistributions.series.values.some(point => point !== null) &&
        <p role="status">A box needs five complete closes.</p>}
      {type === 'confirmed-swings' && <>
        {onSwingSettings && <SwingWindow key={JSON.stringify([swingSettings, defaultInterval, timeframe?.targetSeconds])}
          settings={swingSettings} defaultSeconds={defaultInterval} targetSeconds={timeframe?.targetSeconds}
          saving={priceSizeSaving} apply={onSwingSettings} />}
        <SwingCutoff key={cutoff ?? 'latest'} cutoff={cutoff} apply={value => {
          onTimestamp?.(null)
          setSwingCutoff(value)
        }} />
        {swing.error ? <p role="alert">{swing.error}</p> : <p role="status">
          {!display.bars.length ? 'No observations are known at this cutoff.' : swingSeconds === undefined ?
            'Set an interval to confirm swings.' : swing.series?.values.some(point => point !== null) ?
              'Pivots appear on their confirming observations.' : 'No confirmed swings at this cutoff.'}
        </p>}
      </>}
      {!display.bars.length ? null : transformed && !count ? <>
        {transformed.error ? <p role="alert">{transformed.error}</p> :
          <p role="status">{type === 'renko' ? 'No source close has moved far enough to form a brick at this size.' :
            type === 'kagi' ? 'No source close has reached the reversal size to start a line.' :
            type === 'point-and-figure' ? 'No source close has moved far enough to fill a box at this size.' :
            'No source close has moved beyond the first close to form a line.'}</p>}
        {chart.exportOptions && <ChartExport asset={display} visible={{ start: 0, end: display.bars.length }}
          metadata={chart.exportOptions.metadata} timeframe={timeframe} anchoredVwaps={anchoredVwaps}
          overlays={[
            ...(periods ? [
              { name: 'sma_' + periods.sma, series: sma },
              { name: 'ema_' + periods.ema, series: ema },
            ].filter(overlay => overlay.series.length > 0) : []),
            ...studyOverlays(studies),
          ]} />}
      </> : <Chart {...chart} key={`${timeframe?.revision ?? 'source'}:${priceChartKey}:${cutoff ?? 'latest'}`}
        asset={display} displayBars={displayBars} priceMovements={transformed?.priceMovements} kagiSegments={transformed?.kagiSegments}
        pointFigureBoxes={transformed?.pointFigureBoxes} pointFigureSize={sizeTicks / 1e6} baselineTicks={baselineTicks}
        closeChanges={changes.series} bandSeconds={type === 'high-low-band' ? changeInterval : undefined}
        rebasedReturns={rebased.series} drawdowns={drawdown.series} swings={swing.series}
        closeDistributions={closeDistributions.series}
        anchoredVwaps={anchoredVwaps} sourceObservationTimes={sourceObservationTimes}
        regressionDrawings={regressionDrawings}
        drawingTools={drawingTools && { ...drawingTools, async saveAnnotation(before, after) {
          if (after?.kind === 'anchored-vwap' && !sourceBars.some(bar => bar.time === after.time))
            throw Error('Choose the exact UTC time of an observed source bar.')
          if (after?.kind === 'regression-channel' &&
              ![after.lower, after.upper].every(time => sourceBars.some(bar => bar.time === time)))
            throw Error('Choose two exact UTC times from observed source bars.')
          await drawingTools.saveAnnotation(before, after)
        } }}
        sma={sma} ema={ema} periods={periods} studies={studies}
        timeframe={timeframe} onTimestamp={onTimestamp} />}
    </>
  )
}
