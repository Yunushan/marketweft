import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons'
import { fixed, MAX_CHART_PRICE_TICKS, tickPrice } from './fixed-point'
import { ChartAnnotations } from './ChartAnnotations'
import type { AnnotationPicker } from './ChartAnnotations'
import { EMPTY_ANNOTATIONS, fibonacciRetracements, formatAnnotationAnchor, markerColumn } from './chart-annotations'
import type { ChartAnnotation, TimeColumn } from './chart-annotations'
import { isPriceStudy, studyOverlays, STUDIES } from './studies'
import type { PanelLine, PanelStudy, StudyValue, StudyValues } from './studies'
import { kagiLayout, kagiSegmentAt } from './kagi-chart'
import type { KagiLayout } from './kagi-chart'
import { pointFigureBoxAt, pointFigureLayout } from './point-figure-chart'
import type { PointFigureLayout } from './point-figure-chart'
import { ChartExport } from './ChartExport'
import type { CloseChangeSeries, DrawdownSeries, RebasedReturnSeries, TimeframeView } from './chart-export'
import { DrawingEditor, MeasurementReadout, endpointFields, parseEndpoint } from './DrawingEditor'
import type { DrawingFields, EndpointName } from './DrawingEditor'
import { dateLabel, price, timeLabel, volume } from './workspace'
import type { Asset } from './workspace'
import type { Bar, KagiSegment, MarketCore, MeasuredDrawing, PointFigureBox, PriceMovement, RangeBar, TickBar, VolumeBar } from './market-core'
import type { ChartType, OverlayPeriods, SeriesMetadata } from './catalog-schema'

type View = { end: number; count: number }
type Series = (number | null)[]
const NO_STUDIES: StudyValues[] = []
type PlottedStudy = Omit<PanelStudy, 'lines'> & {
  lines: (Omit<PanelLine, 'series'> & { series: Series })[]
}
type FixedStudyScale = { ticks: number[]; guides: number[]; format: (value: number) => string }
const asPercent = (value: number) => value + '%'
const STOCHASTIC_SCALE = { ticks: [0, 20, 80, 100], guides: [20, 80], format: asPercent }
const FIXED_STUDY_SCALES: Partial<Record<PanelStudy['kind'], FixedStudyScale>> = {
  rsi: { ticks: [0, 30, 70, 100], guides: [30, 70], format: String },
  stochastic: STOCHASTIC_SCALE,
  mfi: STOCHASTIC_SCALE,
  dmi: { ticks: [0, 25, 50, 75, 100], guides: [25], format: asPercent },
  aroon: { ticks: [0, 50, 100], guides: [50], format: asPercent },
  aroon_oscillator: { ticks: [-100, -50, 0, 50, 100], guides: [0], format: asPercent },
  williams_r: { ticks: [-100, -80, -20, 0], guides: [-80, -20], format: asPercent },
}

function plotValue(value: StudyValue): number | null {
  return typeof value === 'bigint' ? tickPrice(value) : value
}
type ChartObservation = KagiSegment | PointFigureBox
type Plot = { left: number; right: number; top: number; bottom: number; high: number; low: number }
type DrawingTools = {
  core: MarketCore
  saved?: MeasuredDrawing
  annotations: readonly ChartAnnotation[]
  busy: boolean
  save: (drawing: MeasuredDrawing | null) => Promise<void>
  saveAnnotation: (before: ChartAnnotation | undefined, after: ChartAnnotation | undefined) => Promise<void>
}
const UP = '#68d7b1',
  DOWN = '#ec817e',
  GOLD = '#e8ba70',
  LILAC = '#b59be6',
  CLOSE_LINE = '#55b5ee'
const chartNames: Record<ChartType, string> = {
  candles: 'candlestick',
  'volume-candles': 'volume-weighted candlestick',
  line: 'close line',
  area: 'close area',
  'step-line': 'step line',
  baseline: 'baseline',
  'close-change': 'close-change histogram',
  'high-low-band': 'high-low band',
  'rebased-percent': 'rebased percent change',
  drawdown: 'peak-to-trough drawdown',
  ohlc: 'OHLC bar',
  'heikin-ashi': 'Heikin-Ashi',
  renko: 'Renko',
  'three-line-break': 'Three Line Break',
  kagi: 'Kagi',
  'point-and-figure': 'Point and Figure',
}
const defaultView = (n: number) => ({ end: n, count: Math.min(n, 60) })
const clamp = (x: number, min: number, max: number) =>
  Math.min(max, Math.max(min, x))
function changeView(
  view: View,
  total: number,
  count: number,
  shift: number,
): View {
  count = clamp(Math.round(count), Math.min(5, total), total)
  return { count, end: clamp(view.end + shift, count, total) }
}

function visibleBarAt(bars: Bar[], timestamp: number, start: number, end: number, latest = false) {
  let low = start
  let high = end
  while (low < high) {
    const mid = (low + high) >>> 1
    const time = bars[mid].time
    if (time < timestamp || (latest && time === timestamp)) low = mid + 1
    else high = mid
  }
  const index = latest ? low - 1 : low
  return index >= start && index < end && bars[index].time === timestamp ? index : null
}

function sameDrawing(first?: MeasuredDrawing, second?: MeasuredDrawing) {
  if (!first || !second) return first === second
  return first.start.time === second.start.time && first.start.ticks === second.start.ticks &&
    first.end.time === second.end.time && first.end.ticks === second.end.ticks
}
function drawStudyLine(
  ctx: CanvasRenderingContext2D, series: Series, start: number, end: number,
  x: (index: number) => number, y: (value: number) => number, color: string, radius: number,
) {
  ctx.beginPath()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  const isolated: [number, number][] = []
  let points = 0
  for (let index = start; index <= end; index++) {
    const value = index === end ? null : series[index]
    if (value == null) {
      if (points === 1) isolated.push([x(index - 1), y(series[index - 1]!)])
      points = 0
    } else {
      if (points === 0) ctx.moveTo(x(index), y(value))
      else ctx.lineTo(x(index), y(value))
      points++
    }
  }
  ctx.stroke()
  if (isolated.length) {
    ctx.beginPath()
    ctx.fillStyle = color
    for (const [cx, cy] of isolated) {
      ctx.moveTo(cx + radius, cy)
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}

function projectStudyLine(series: StudyValue[], sourceIndices: number[] | undefined): Series {
  return sourceIndices ? sourceIndices.map(index => plotValue(series[index])) : series.map(plotValue)
}

function draw(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  bars: Bar[],
  view: View,
  sma: Series,
  ema: Series,
  active: number | null,
  drawing: MeasuredDrawing | undefined,
  annotations: readonly ChartAnnotation[],
  markerTimeline: readonly TimeColumn[],
  type: ChartType,
  baselineTicks: number,
  closeChanges: CloseChangeSeries | undefined,
  percentPlot: Series | undefined,
  bandSeconds: number | undefined,
  timeframe: TimeframeView | undefined,
  kagi: KagiLayout | undefined,
  pointFigure: PointFigureLayout | undefined,
  activePrice: number | undefined,
  studies: PlottedStudy[],
  priceLines: readonly { color: string; series: Series }[],
  activeStudyValues: (number | null)[][],
): Plot | undefined {
  const ctx = canvas.getContext('2d')
  if (!ctx || width < 80 || height < 100) return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.scale(dpr, dpr)
  const baseline = type === 'baseline' ? baselineTicks / 1e6 : undefined
  const histogram = type === 'close-change'
  const percentAxis = type === 'rebased-percent' || type === 'drawdown'
  const derivedAxis = histogram || percentAxis
  const derivedValue = (index: number) => histogram ? plotValue(closeChanges?.values[index] ?? null) :
    percentPlot?.[index] ?? null
  const volumeWeighted = type === 'volume-candles'
  const rangeBand = type === 'high-low-band'
  function consecutive(index: number) {
    if (bandSeconds === undefined || bars[index].time - bars[index - 1].time !== bandSeconds) return false
    if (!timeframe) return true
    const previous = timeframe.buckets[index - 1]
    const current = timeframe.buckets[index]
    return previous.expectedBars === previous.observedBars && current.expectedBars === current.observedBars
  }
  const closeTrace = type === 'line' || type === 'area' || type === 'step-line' || baseline !== undefined
  const isPriceMovement = type === 'renko' || type === 'three-line-break'
  const closeBased = isPriceMovement || kagi !== undefined || pointFigure !== undefined
  const left = 10,
    top = 19,
    bottom = height - 28 - 110 * studies.length,
    volTop = top + (bottom - top) * 0.8,
    priceBottom = closeBased ? bottom : volTop - 13
  const start = view.end - view.count
  let low = derivedAxis ? 0 : Infinity,
    high = derivedAxis ? 0 : -Infinity,
    maxVol = 0
  for (let i = start; i < view.end; i++) {
    if (derivedAxis) {
      const value = derivedValue(i)
      if (value !== null) {
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
      continue
    }
    const b = bars[i]
    low = Math.min(low, closeTrace ? b.close : b.low, sma[i] ?? Infinity, ema[i] ?? Infinity)
    high = Math.max(high, closeTrace ? b.close : b.high, sma[i] ?? -Infinity, ema[i] ?? -Infinity)
    for (const { series } of priceLines) {
      const value = series[i]
      if (value != null) {
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    }
  }
  if (baseline !== undefined) {
    low = Math.min(low, baseline)
    high = Math.max(high, baseline)
  }
  const delta =
    high === low
      ? Math.max(Math.abs(high) * 0.00001, 0.000001)
      : (high - low) * 0.07
  high += delta
  low -= delta
  ctx.font = '10px "IBM Plex Mono", Consolas, monospace'
  const tickDigits = clamp(Math.ceil(-Math.log10((high - low) / 5)), 2, 7)
  const tickFormat = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: tickDigits,
  })
  const ticksY = Array.from({ length: 6 }, (_, t) =>
    tickFormat.format(high - ((high - low) * t) / 5) + (percentAxis ? '%' : ''),
  )
  const studyPanels = studies.map(study => {
    const fixedScale = FIXED_STUDY_SCALES[study.kind]
    if (fixedScale) return { ...study, ...fixedScale, low: fixedScale.ticks[0], high: fixedScale.ticks.at(-1)! }
    const guides = study.guides ?? (study.kind === 'bb_percent_b' ? [0, 100] : study.zeroLine ? [0] : [])
    let low = Math.min(0, ...guides)
    let high = Math.max(0, ...guides)
    for (const { series } of study.lines) {
      for (let index = start; index < view.end; index++) {
        const value = series[index]
        if (value == null) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    }
    if (low === high) {
      high = 1
      if (study.zeroLine) low = -1
    }
    const ticks = guides.length ? [low, ...guides, high] : [low, (low + high) / 2, 0, high]
    const format = study.unit === 'volume' ? volume : study.unit ? price : (value: number) => price(value) + '%'
    return { ...study, low, high, ticks: [...new Set(ticks)].sort((a, b) => a - b), format, guides }
  })
  const studyLabels = studyPanels.flatMap(panel => panel.ticks.map(panel.format))
  const closeLabel = percentAxis ? '0%' : histogram ? '0' : price(bars[view.end - 1].close)
  const axisWidth = Math.max(
    64,
    ...[closeLabel, ...ticksY, ...studyLabels].map(
      (label) => Math.ceil(ctx.measureText(label).width) + 14,
    ),
  )
  const right = width - Math.min(axisWidth, width / 2),
    dx = (right - left) / view.count
  const y = (v: number) =>
    top + ((high - v) / (high - low)) * (priceBottom - top)
  const x = (i: number) => left + (i - start + 0.5) * dx
  function line(x1: number, y1: number, x2: number, y2: number, color: string) {
    ctx!.strokeStyle = color
    ctx!.beginPath()
    ctx!.moveTo(x1, y1)
    ctx!.lineTo(x2, y2)
    ctx!.stroke()
  }
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1
  for (let t = 0; t <= 5; t++) {
    const val = high - ((high - low) * t) / 5,
      at = y(val)
    line(left, at, right, at, '#293036')
    ctx.fillStyle = '#93a19e'
    ctx.fillText(ticksY[t], right + 7, at)
  }
  const ticks = Math.min(
    view.count,
    Math.max(2, Math.floor((right - left) / 113)),
  )
  let lastTickTime: number | undefined
  for (let j = 0; j < ticks; j++) {
    const i =
        start + Math.floor(((view.count - 1) * j) / Math.max(1, ticks - 1)),
      at = x(i)
    line(at, top, at, bottom, '#232b2e')
    const tickTime = bars[i].time
    if (tickTime === lastTickTime) continue
    lastTickTime = tickTime
    const date = new Date(tickTime * 1000)
    const intraday = bars[view.end - 1].time - bars[start].time < 86400
    const label = intraday
      ? date.toISOString().slice(11, 19)
      : date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        })
    ctx.fillStyle = '#93a19e'
    const span = ctx.measureText(label).width
    ctx.fillText(label, clamp(at - span / 2, left, right - span), bottom + 15)
  }
  // Combine bars that share a pixel column, preserving visible OHLC extrema and summed volume.
  const stride = Math.max(1, Math.ceil(1.65 / dx))
  const groups: {
    first: number
    last: number
    open: number
    close: number
    low: number
    high: number
    volume: number
    lowestClose: number
    highestClose: number
  }[] = []
  if (kagi) {
    function kagiLine(x1: number, y1: number, x2: number, y2: number, thick: boolean) {
      ctx!.lineWidth = thick ? 3 : 1.2
      line(x1, y1, x2, y2, thick ? UP : DOWN)
    }
    for (let index = start; index < view.end; index++) {
      const { segments, change } = kagi.columns[index]
      const first = segments[0]
      const last = segments[segments.length - 1]
      const at = x(index), from = y(tickPrice(first.fromTicks)), to = y(tickPrice(last.toTicks))
      if (index > start) kagiLine(x(index - 1), from, at, from, first.thickBefore)
      if (change?.weightChangeTicks != null) {
        const level = y(tickPrice(change.weightChangeTicks))
        kagiLine(at, from, at, level, first.thickBefore)
        kagiLine(at, level, at, to, !first.thickBefore)
      } else {
        kagiLine(at, from, at, to, first.thickBefore)
      }
    }
    ctx.lineWidth = 1
  }
  if (pointFigure) {
    const radius = Math.min(8, dx * 0.35, Math.abs(y(pointFigure.size) - y(0)) * 0.35)
    for (let index = start; index < view.end; index++) {
      const axis = x(index)
      for (const box of pointFigure.columns[index]) {
        const level = y(tickPrice(box.levelTicks))
        const rising = box.mark === 'X'
        const color = rising ? UP : DOWN
        if (radius < 1.5) {
          ctx.fillStyle = color
          ctx.fillRect(axis, level, 1, 1)
        } else if (rising) {
          line(axis - radius, level - radius, axis + radius, level + radius, color)
          line(axis - radius, level + radius, axis + radius, level - radius, color)
        } else {
          ctx.strokeStyle = color
          ctx.beginPath()
          ctx.arc(axis, level, radius, 0, 2 * Math.PI)
          ctx.stroke()
        }
      }
    }
  }
  if (isPriceMovement) {
    // At dense zoom levels show the last complete price movement in each plotted column.
    for (let first = start; first < view.end; first += stride) {
      const index = Math.min(first + stride, view.end) - 1
      const brick = bars[index]
      const open = y(brick.open)
      const close = y(brick.close)
      const width = Math.max(1, dx * 0.88)
      ctx.fillStyle = brick.close > brick.open ? UP : DOWN
      ctx.fillRect(x(index) - width / 2, Math.min(open, close), width, Math.max(1, Math.abs(open - close)))
    }
  }
  for (let first = start; !closeBased && first < view.end;) {
    const end = Math.min(first + stride, view.end)
    let last = end - 1
    if (rangeBand) {
      last = first
      while (last + 1 < end && consecutive(last + 1)) last++
    }
    let hi = bars[first].high,
      lo = bars[first].low,
      vol = 0,
      lowestClose = first,
      highestClose = first
    for (let i = first; i <= last; i++) {
      hi = Math.max(hi, bars[i].high)
      lo = Math.min(lo, bars[i].low)
      vol += bars[i].volume
      if (bars[i].close < bars[lowestClose].close) lowestClose = i
      if (bars[i].close > bars[highestClose].close) highestClose = i
    }
    groups.push({
      first,
      last,
      open: bars[first].open,
      close: bars[last].close,
      high: hi,
      low: lo,
      volume: vol,
      lowestClose,
      highestClose,
    })
    maxVol = Math.max(maxVol, vol)
    first = last + 1
  }
  for (const b of groups) {
    const axis = (x(b.first) + x(b.last)) / 2,
      w = Math.max(1, dx * (b.last - b.first + 1) * 0.68)
    const col = b.close >= b.open ? UP : DOWN
    ctx.fillStyle = col
    if (!closeTrace && !derivedAxis && !rangeBand) {
      line(axis, y(b.high), axis, y(b.low), col)
      const open = y(b.open), close = y(b.close)
      if (type === 'ohlc') {
        line(axis - w / 2, open, axis, open, col)
        line(axis, close, axis + w / 2, close, col)
      } else if (!volumeWeighted || b.volume > 0) {
        const bodyWidth = volumeWeighted ? w * (b.volume / maxVol) : w
        ctx.fillRect(axis - bodyWidth / 2, Math.min(open, close), bodyWidth,
          Math.max(1.2, Math.abs(open - close)))
      }
    }
    const h = maxVol > 0 ? (b.volume / maxVol) * (bottom - volTop) : 0
    ctx.globalAlpha = 0.46
    ctx.fillRect(axis - w / 2, bottom - h, w, h)
    ctx.globalAlpha = 1
  }
  if (rangeBand) {
    const center = (group: typeof groups[number]) => (x(group.first) + x(group.last)) / 2
    for (let first = 0; first < groups.length;) {
      let end = first + 1
      while (end < groups.length && consecutive(groups[end].first)) end++
      const initial = groups[first]
      const leftmost = center(initial)
      ctx.fillStyle = 'rgba(85, 181, 238, 0.2)'
      if (end === first + 1) {
        const width = Math.max(1, dx * (initial.last - initial.first + 1) * 0.5)
        ctx.fillRect(leftmost - width / 2, y(initial.high), width,
          Math.max(1, y(initial.low) - y(initial.high)))
      } else {
        ctx.beginPath()
        ctx.moveTo(x(initial.first), y(initial.high))
        for (let index = first; index < end; index++) {
          const group = groups[index]
          if (index !== first) ctx.lineTo(x(group.first), y(group.high))
          if (group.first !== group.last) ctx.lineTo(x(group.last), y(group.high))
        }
        for (let index = end - 1; index >= first; index--) {
          const group = groups[index]
          ctx.lineTo(x(group.last), y(group.low))
          if (group.first !== group.last) ctx.lineTo(x(group.first), y(group.low))
        }
        ctx.closePath()
        ctx.fill()
      }
      if (initial.first === groups[end - 1].last) {
        ctx.fillStyle = CLOSE_LINE
        ctx.beginPath()
        ctx.arc(leftmost, y(initial.close), 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // A dense group can hold multiple observed closes on the same display pixel.
        ctx.beginPath()
        ctx.strokeStyle = CLOSE_LINE
        ctx.lineWidth = 2
        ctx.moveTo(x(initial.first), y(bars[initial.first].close))
        for (let index = first; index < end; index++) {
          const group = groups[index]
          const closes = [...new Set([group.first, group.lowestClose, group.highestClose, group.last])].sort((a, b) => a - b)
          for (const position of closes) ctx.lineTo(x(position), y(bars[position].close))
        }
        ctx.stroke()
      }
      first = end
    }
  }
  if (derivedAxis) {
    const zero = y(0)
    line(left, zero, right, zero, '#899eb0')
    ctx.fillStyle = '#a2b4af'
    ctx.fillText(closeLabel, right + 7, zero)
  }
  if (percentPlot) {
    if (type === 'drawdown') {
      const zero = y(0)
      ctx.fillStyle = 'rgba(236, 129, 126, 0.18)'
      let open = false
      for (let index = start; index <= view.end; index++) {
        const value = index === view.end ? null : percentPlot[index]
        if (value != null) {
          if (!open) {
            ctx.beginPath()
            ctx.moveTo(x(index), zero)
            open = true
          }
          ctx.lineTo(x(index), y(value))
        } else if (open) {
          ctx.lineTo(x(index - 1), zero)
          ctx.closePath()
          ctx.fill()
          open = false
        }
      }
    }
    drawStudyLine(ctx, percentPlot, start, view.end, x, y, type === 'drawdown' ? DOWN : CLOSE_LINE, 3)
  }
  if (histogram) {
    const zero = y(0)
    const barWidth = Math.max(1, dx * 0.68)
    for (let index = start; index < view.end; index++) {
      const ticks = closeChanges?.values[index]
      if (ticks == null) continue
      const level = y(tickPrice(ticks))
      ctx.fillStyle = ticks > 0n ? UP : ticks < 0n ? DOWN : '#a2b4af'
      ctx.fillRect(x(index) - barWidth / 2, ticks === 0n ? zero - 0.5 : Math.min(level, zero),
        barWidth, Math.max(1, Math.abs(level - zero)))
    }
  }
  if (closeTrace) {
    ctx.beginPath()
    ctx.strokeStyle = CLOSE_LINE
    ctx.lineWidth = 2
    let prior = y(bars[start].close)
    const fill = baseline === undefined ? undefined : new Path2D()
    fill?.moveTo(x(start), prior)
    ctx.moveTo(x(start), prior)
    for (const { first, last, lowestClose, highestClose } of groups) {
      const indices = first === last ? [first] :
        [...new Set([first, lowestClose, highestClose, last])].sort((a, b) => a - b)
      for (const index of indices) {
        if (index === start) continue
        const axis = x(index)
        if (type === 'step-line') ctx.lineTo(axis, prior)
        prior = y(bars[index].close)
        ctx.lineTo(axis, prior)
        fill?.lineTo(axis, prior)
      }
    }
    if (fill && baseline !== undefined) {
      const reference = y(baseline)
      fill.lineTo(x(view.end - 1), reference)
      fill.lineTo(x(start), reference)
      fill.closePath()
      // Draw the line first, then clip the same fill path to both sides of the reference.
      ctx.stroke()
      for (const [from, to, color] of [
        [top, reference, 'rgba(104, 215, 177, 0.20)'],
        [reference, priceBottom, 'rgba(236, 129, 126, 0.20)'],
      ] as const) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(left, from, right - left, to - from)
        ctx.clip()
        ctx.fillStyle = color
        ctx.fill(fill)
        ctx.restore()
      }
      ctx.lineWidth = 1
      line(left, reference, right, reference, '#899eb0')
    } else {
      ctx.stroke()
    }
    if (type === 'area' && view.count > 1) {
      ctx.lineTo(x(view.end - 1), priceBottom)
      ctx.lineTo(x(start), priceBottom)
      ctx.closePath()
      ctx.fillStyle = 'rgba(85, 181, 238, 0.18)'
      ctx.fill()
    }
    if (view.count === 1) {
      ctx.fillStyle = CLOSE_LINE
      ctx.beginPath()
      ctx.arc(x(start), y(bars[start].close), 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const [values, color] of derivedAxis ? [] : [[sma, GOLD], [ema, LILAC]] as const) {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    let begun = false
    for (const group of groups) {
      const i = group.last,
        val = values[i]
      if (val == null) continue
      if (begun) ctx.lineTo(x(i), y(val))
      else ctx.moveTo(x(i), y(val))
      begun = true
    }
    ctx.stroke()
  }
  for (const { color, series } of derivedAxis ? [] : priceLines) {
    drawStudyLine(ctx, series, start, view.end, x, y, color, 2)
  }
  if (!derivedAxis) {
    const last = bars[view.end - 1]
    const at = y(last.close)
    const tag = last.close >= last.open ? UP : DOWN
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 0.8
    line(left, at, right, at, tag)
    ctx.setLineDash([])
    ctx.fillStyle = tag
    ctx.fillRect(right, at - 9, width - right, 18)
    ctx.fillStyle = '#0e1915'
    ctx.fillText(closeLabel, right + 6, at)
  }
  if (annotations.length) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, right - left, priceBottom - top)
    ctx.clip()
    ctx.lineWidth = 1.25
    for (const annotation of annotations) {
      if (annotation.kind === 'price') {
        const price = annotation.ticks / 1e6
        if (price < low || price > high) continue
        const level = y(price)
        line(left, level, right, level, '#e4b96a')
      } else if (annotation.kind === 'time') {
        const column = markerColumn(markerTimeline, annotation.time)
        if (column === null || column < start - 0.5 || column > view.end - 0.5) continue
        const axis = x(column)
        line(axis, top, axis, priceBottom, '#ad9df5')
      } else if (annotation.kind === 'price-range') {
        const upper = y(annotation.upper / 1e6)
        const lower = y(annotation.lower / 1e6)
        const first = Math.max(upper, top)
        const last = Math.min(lower, priceBottom)
        if (first >= last) continue
        ctx.fillStyle = 'rgba(224, 177, 102, 0.15)'
        ctx.fillRect(left, first, right - left, last - first)
        if (upper >= top) line(left, upper, right, upper, '#e0b166')
        if (lower <= priceBottom) line(left, lower, right, lower, '#e0b166')
      } else if (annotation.kind === 'time-range') {
        const first = markerTimeline[0]
        const last = markerTimeline.at(-1)
        if (!first || !last || annotation.upper < first.time || annotation.lower > last.time) continue
        const from = markerColumn(markerTimeline, annotation.lower)
        const to = markerColumn(markerTimeline, annotation.upper)
        const lower = from === null ? left : x(from)
        const upper = to === null ? right : x(to)
        const begin = Math.max(lower, left)
        const end = Math.min(upper, right)
        if (begin >= end) continue
        ctx.fillStyle = 'rgba(150, 161, 230, 0.15)'
        ctx.fillRect(begin, top, end - begin, priceBottom - top)
        if (from !== null && lower >= left) line(lower, top, lower, priceBottom, '#96a1e6')
        if (to !== null && upper <= right) line(upper, top, upper, priceBottom, '#96a1e6')
      } else if (annotation.kind === 'polyline') {
        ctx.strokeStyle = '#9aaef0'
        ctx.beginPath()
        let connected = false
        for (const point of annotation.points) {
          const column = markerColumn(markerTimeline, point.time)
          if (column === null) {
            connected = false
          } else {
            const price = y(point.ticks / 1e6)
            if (connected) ctx.lineTo(x(column), price)
            else ctx.moveTo(x(column), price)
            connected = true
          }
        }
        ctx.stroke()
      } else if (annotation.kind === 'triangle') {
        const [first, second, third] = annotation.points.map(point => markerColumn(markerTimeline, point.time))
        if (first === null || second === null || third === null) continue
        ctx.fillStyle = 'rgba(185, 153, 105, 0.15)'
        ctx.strokeStyle = '#b99969'
        ctx.beginPath()
        ctx.moveTo(x(first), y(annotation.points[0].ticks / 1e6))
        ctx.lineTo(x(second), y(annotation.points[1].ticks / 1e6))
        ctx.lineTo(x(third), y(annotation.points[2].ticks / 1e6))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        const from = markerColumn(markerTimeline, annotation.start.time)
        const level = y(annotation.start.ticks / 1e6)
        if (annotation.kind === 'ray') {
          if (level < top || level > priceBottom) continue
          const beforeHistory = markerTimeline.length > 0 && annotation.start.time < markerTimeline[0].time
          const begin = beforeHistory ? left : from === null ? right : Math.max(left, x(from))
          if (begin < right) line(begin, level, right, level, '#83d1ef')
        } else if (annotation.kind === 'note') {
          if (from === null || level < top || level > priceBottom) continue
          const anchor = x(from)
          if (anchor < left || anchor > right) continue
          const labelWidth = Math.min(right - left - 12, Math.ceil(ctx.measureText(annotation.text).width))
          const labelStart = Math.min(anchor + 8, right - labelWidth - 6)
          const labelY = clamp(level, top + 9, priceBottom - 9)
          ctx.fillStyle = '#1e2834'
          ctx.fillRect(labelStart - 5, labelY - 8, labelWidth + 10, 16)
          ctx.fillStyle = '#f2dcad'
          ctx.beginPath()
          ctx.arc(anchor, level, 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillText(annotation.text, labelStart, labelY, labelWidth)
        } else {
          const to = markerColumn(markerTimeline, annotation.end.time)
          if (from === null || to === null) continue
          const x1 = x(from)
          const x2 = x(to)
          const y2 = y(annotation.end.ticks / 1e6)
          if (annotation.kind === 'rectangle') {
            const box = [Math.min(x1, x2), Math.min(level, y2), Math.abs(x2 - x1), Math.abs(y2 - level)] as const
            ctx.fillStyle = 'rgba(126, 180, 226, 0.15)'
            ctx.fillRect(...box)
            ctx.strokeStyle = '#7eb4e2'
            ctx.strokeRect(...box)
          } else if (annotation.kind === 'ellipse') {
            ctx.fillStyle = 'rgba(119, 192, 162, 0.15)'
            ctx.strokeStyle = '#77c0a2'
            ctx.beginPath()
            ctx.ellipse((x1 + x2) / 2, (level + y2) / 2, Math.abs(x1 - x2) / 2, Math.abs(level - y2) / 2,
              0, 0, 2 * Math.PI)
            ctx.fill()
            ctx.stroke()
          } else if (annotation.kind === 'arrow') {
            const length = Math.hypot(x2 - x1, y2 - level)
            if (length === 0) continue
            const angle = Math.atan2(y2 - level, x2 - x1)
            const head = Math.min(10, length * 0.5)
            ctx.strokeStyle = '#f2aa82'
            ctx.beginPath()
            ctx.moveTo(x1, level)
            ctx.lineTo(x2, y2)
            ctx.moveTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
            ctx.lineTo(x2, y2)
            ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
            ctx.stroke()
          } else if (annotation.kind === 'fibonacci') {
            const first = Math.min(x1, x2)
            const last = Math.max(x1, x2)
            if (last < left || first > right) continue
            ctx.fillStyle = '#cbbce8'
            for (const { ticks, label } of fibonacciRetracements(annotation.start.ticks, annotation.end.ticks)) {
              const position = y(ticks / 1e6)
              if (position < top || position > priceBottom) continue
              line(first, position, last, position, '#cbbce8')
              ctx.fillText(label + ' ' + formatAnnotationAnchor('price', ticks), Math.max(first, left) + 4, position - 7)
            }
          } else if (annotation.kind === 'channel') {
            const offset1 = y((annotation.start.ticks + annotation.offsetTicks) / 1e6)
            const offset2 = y((annotation.end.ticks + annotation.offsetTicks) / 1e6)
            ctx.fillStyle = 'rgba(195, 166, 98, 0.15)'
            ctx.beginPath()
            ctx.moveTo(x1, level)
            ctx.lineTo(x2, y2)
            ctx.lineTo(x2, offset2)
            ctx.lineTo(x1, offset1)
            ctx.closePath()
            ctx.fill()
            line(x1, level, x2, y2, '#c3a662')
            line(x1, offset1, x2, offset2, '#c3a662')
          } else {
            line(x1, level, x2, y2, '#ee9dbd')
          }
        }
      }
    }
    ctx.restore()
  }
  if (drawing) {
    const columns = kagi?.byTime ?? pointFigure?.byTime
    const first = columns ? columns.get(drawing.start.time)?.column ?? null :
      visibleBarAt(bars, drawing.start.time, 0, bars.length, isPriceMovement)
    const last = columns ? columns.get(drawing.end.time)?.column ?? null :
      visibleBarAt(bars, drawing.end.time, 0, bars.length, isPriceMovement)
    if (first !== null && last !== null) {
      const endpoints = [[x(first), y(drawing.start.ticks / 1e6)], [x(last), y(drawing.end.ticks / 1e6)]]
      ctx.save()
      ctx.beginPath()
      ctx.rect(left, top, right - left, priceBottom - top)
      ctx.clip()
      ctx.lineWidth = 2
      line(endpoints[0][0], endpoints[0][1], endpoints[1][0], endpoints[1][1], '#8bc9ff')
      ctx.fillStyle = '#8bc9ff'
      for (const [cx, cy] of endpoints) {
        ctx.beginPath()
        ctx.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
  if (active !== null && active >= start && active < view.end) {
    const axis = x(active)
    const value = derivedAxis ? derivedValue(active) : activePrice ?? bars[active].close
    ctx.setLineDash([3, 4])
    line(axis, top, axis, bottom, '#bdc9c7')
    if (value !== null) line(left, y(value), right, y(value), '#a2b4af')
    ctx.setLineDash([])
    if (value !== null) {
      ctx.fillStyle = '#e3ece8'
      ctx.beginPath()
      ctx.arc(axis, y(value), 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const [panelIndex, panel] of studyPanels.entries()) {
    const panelTop = bottom + 30 + 110 * panelIndex
    const panelBottom = panelTop + 97
    const studyY = (value: number) => panelBottom - (value - panel.low) / (panel.high - panel.low) * (panelBottom - panelTop)
    ctx.lineWidth = 1
    for (const tick of panel.ticks) {
      const level = studyY(tick)
      line(left, level, right, level, panel.guides.includes(tick) ? '#3e4c6a' : '#293036')
      ctx.fillStyle = '#93a19e'
      ctx.fillText(panel.format(tick), right + 7, level)
    }
    for (const { color, series, histogram } of panel.lines) {
      if (!histogram) continue
      const baseline = studyY(0)
      const width = Math.max(1, Math.min(10, dx * 0.64))
      for (let index = start; index < view.end; index++) {
        const value = series[index]
        if (value == null || value === 0) continue
        const level = studyY(value)
        ctx.fillStyle = value < 0 ? histogram.negativeColor : color
        ctx.fillRect(x(index) - width / 2, Math.min(level, baseline), width, Math.abs(level - baseline))
      }
    }
    for (const { color, series, histogram } of panel.lines) {
      if (histogram) continue
      drawStudyLine(ctx, series, start, view.end, x, studyY, color, 2.5)
    }
    if (active !== null && active >= start && active < view.end) {
      const axis = x(active)
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      line(axis, panelTop, axis, panelBottom, '#bdc9c7')
      ctx.setLineDash([])
      for (const [lineIndex, { color, histogram }] of panel.lines.entries()) {
        const selected = activeStudyValues[panelIndex][lineIndex]
        if (selected == null) continue
        ctx.beginPath()
        ctx.fillStyle = selected < 0 && histogram ? histogram.negativeColor : color
        ctx.arc(axis, studyY(selected), 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  return { left, right, top, bottom: priceBottom, high, low }
}

export function Spark({ bars }: { bars: Bar[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const data = bars.slice(-24).map((b) => b.close),
      low = Math.min(...data),
      high = Math.max(...data)
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = data.at(-1)! >= data[0] ? UP : DOWN
    ctx.lineWidth = 2
    ctx.beginPath()
    data.forEach((v, i) => {
      const x = (i * (width - 2)) / Math.max(1, data.length - 1) + 1,
        y = height - 3 - ((v - low) / (high - low || 1)) * (height - 6)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.stroke()
  }, [bars])
  return (
    <canvas
      ref={ref}
      width="84"
      height="32"
      className="spark"
      aria-hidden="true"
    />
  )
}

export function Chart({
  asset,
  sma,
  ema,
  studies = NO_STUDIES,
  linkedTimestamp,
  onTimestamp,
  drawingTools,
  periods,
  exportOptions,
  type = 'candles',
  baselineTicks = 0,
  closeChanges,
  rebasedReturns,
  drawdowns,
  bandSeconds,
  timeframe,
  ticks,
  ranges,
  volumes,
  observedAt,
  displayBars,
  priceMovements,
  kagiSegments,
  pointFigureBoxes,
  pointFigureSize = 1,
}: {
  asset: Asset
  sma: Series
  ema: Series
  studies?: StudyValues[]
  linkedTimestamp?: number | null
  onTimestamp?: (timestamp: number | null) => void
  drawingTools?: DrawingTools
  periods?: OverlayPeriods
  exportOptions?: { metadata?: SeriesMetadata }
  type?: ChartType
  baselineTicks?: number
  closeChanges?: CloseChangeSeries
  rebasedReturns?: RebasedReturnSeries
  drawdowns?: DrawdownSeries
  bandSeconds?: number
  timeframe?: TimeframeView
  ticks?: TickBar[]
  ranges?: RangeBar[]
  volumes?: VolumeBar[]
  observedAt?: readonly number[]
  displayBars?: Bar[]
  priceMovements?: PriceMovement[]
  kagiSegments?: KagiSegment[]
  pointFigureBoxes?: PointFigureBox[]
  pointFigureSize?: number
}) {
  const kagi = useMemo(() => kagiSegments && kagiLayout(kagiSegments), [kagiSegments])
  const pointFigure = useMemo(() => pointFigureBoxes && pointFigureLayout(pointFigureBoxes, pointFigureSize),
    [pointFigureBoxes, pointFigureSize])
  const bars = useMemo(() => kagi?.bars ?? pointFigure?.bars ?? priceMovements?.map(movement => {
    const open = Number(movement.openTicks) / 1e6
    const close = Number(movement.closeTicks) / 1e6
    return { time: movement.sourceTime, open, close, high: Math.max(open, close),
      low: Math.min(open, close), volume: 0 }
  }) ?? asset.bars, [asset.bars, kagi, pointFigure, priceMovements])
  const sourceIndices = useMemo(() => kagi?.columns.map(({ segments }) => segments.at(-1)!.sourceIndex) ??
    pointFigure?.columns.map(boxes => boxes.at(-1)!.sourceIndex) ??
    priceMovements?.map(movement => movement.sourceIndex), [kagi, pointFigure, priceMovements])
  const plottedSma = useMemo(() => sourceIndices && sma.length ?
    sourceIndices.map(index => sma[index]) : sma, [sourceIndices, sma])
  const plottedEma = useMemo(() => sourceIndices && ema.length ?
    sourceIndices.map(index => ema[index]) : ema, [sourceIndices, ema])
  const panels = useMemo(() => studies.filter(study => !isPriceStudy(study)), [studies])
  const priceStudies = useMemo(() => studies.filter(isPriceStudy), [studies])
  const plottedPriceLines = useMemo(() => priceStudies.flatMap(study => study.lines.map(line => ({
    color: line.color, series: projectStudyLine(line.series, sourceIndices),
  }))), [sourceIndices, priceStudies])
  const plottedStudies = useMemo<PlottedStudy[]>(() => panels.map(study => ({
    ...study,
    lines: study.lines.map(line => ({
      ...line,
      series: projectStudyLine(line.series, sourceIndices),
    })),
  })), [sourceIndices, panels])
  const exportStudies = useMemo(() => studyOverlays(studies), [studies])
  const n = bars.length
  const [view, setView] = useState<View>(() => defaultView(n)),
    [pointerIndex, setPointerIndex] = useState<number | null>(null)
  const [pointerObservation, setPointerObservation] = useState<ChartObservation | undefined>(undefined)
  const [size, setSize] = useState({ width: 800, height: 360 })
  const ref = useRef<HTMLCanvasElement>(null),
    zone = useRef<HTMLDivElement>(null)
  const plot = useRef<Plot | undefined>(undefined)
  const drag = useRef<{ x: number; end: number } | null>(null)
  const [drawingFields, setDrawingFields] = useState<DrawingFields | null>(null)
  const drawingBeforeEdit = useRef<MeasuredDrawing | undefined>(undefined)
  const [picking, setPicking] = useState<EndpointName | null>(null)
  const [annotationPicker, setAnnotationPicker] = useState<AnnotationPicker | null>(null)
  const [drawingError, setDrawingError] = useState('')
  const drawing = drawingTools?.saved
  const drawingCore = drawingTools?.core
  const measurement = useMemo(() => drawing && drawingCore?.measureDrawing(drawing), [drawing, drawingCore])
  const start = view.end - view.count
  const observationsByTime = kagi?.byTime ?? pointFigure?.byTime
  const annotations = drawingTools?.annotations ?? EMPTY_ANNOTATIONS
  const needsTimeline = annotations.some(annotation => annotation.kind !== 'price' && annotation.kind !== 'price-range')
  const markerTimeline = useMemo(() => {
    if (!needsTimeline) return []
    const columns = new Map<number, number>()
    if (observationsByTime) {
      for (const [time, observation] of observationsByTime) columns.set(time, observation.column)
    } else {
      bars.forEach((bar, index) => columns.set(bar.time, index))
    }
    return Array.from(columns, ([time, column]) => ({ time, column }))
  }, [bars, needsTimeline, observationsByTime])
  const linkedObservation = linkedTimestamp == null ? undefined : observationsByTime?.get(linkedTimestamp)
  const linkedIndex = observationsByTime ?
    linkedObservation && linkedObservation.column >= start && linkedObservation.column < view.end ? linkedObservation.column : null :
    linkedTimestamp == null ? null : visibleBarAt(bars, linkedTimestamp, start, view.end, Boolean(priceMovements))
  const active = pointerIndex ?? linkedIndex
  const readoutIndex = active ?? view.end - 1
  const plotted = displayBars ?? bars
  const b = plotted[readoutIndex]
  const movement = priceMovements?.[readoutIndex]
  const selectedObservation = (pointerIndex !== null ? pointerObservation : linkedIndex !== null ? linkedObservation : undefined) ??
    kagi?.columns[readoutIndex].segments.at(-1) ?? pointFigure?.columns[readoutIndex].at(-1)
  const segment = selectedObservation && 'toTicks' in selectedObservation ? selectedObservation : undefined
  const box = selectedObservation && 'mark' in selectedObservation ? selectedObservation : undefined
  const isRenko = type === 'renko'
  const closeBased = Boolean(observationsByTime || priceMovements)
  const sourceIndex = selectedObservation?.sourceIndex ?? movement?.sourceIndex ?? readoutIndex
  const time = selectedObservation?.sourceTime ?? b.time
  const prior = asset.bars[Math.max(0, sourceIndex - 1)]
  const preceding = asset.bars[Math.max(0, sourceIndex - 2)]
  const studyValues = useMemo(() => panels.map(study => study.lines.map(line => line.series[sourceIndex])),
    [panels, sourceIndex])
  const activeStudyPlotValues = useMemo(() => studyValues.map(values => values.map(plotValue)), [studyValues])
  const crosshairPrice = segment ? tickPrice(segment.toTicks) : box ? tickPrice(box.levelTicks) : undefined
  const firstObservation = kagi?.columns[start].segments[0] ?? pointFigure?.columns[start][0]
  const sourceStart = firstObservation?.sourceIndex ?? priceMovements?.[start].sourceIndex ?? start
  const sourceEnd = (sourceIndices?.[view.end - 1] ?? view.end - 1) + 1
  const coverage = timeframe?.buckets[sourceIndex]
  const session = timeframe?.mode === 'session' ? timeframe.buckets[sourceIndex] : undefined
  const tick = ticks?.[sourceIndex]
  const range = ranges?.[sourceIndex]
  const volumeBar = volumes?.[sourceIndex]
  const observation = observedAt?.[sourceIndex]
  const percentPlot = useMemo(() => drawdowns ? drawdowns.map(point => plotValue(point?.percent ?? null)) :
    rebasedReturns?.values.map(plotValue), [drawdowns, rebasedReturns])
  const drawdown = type === 'drawdown'
  const point = drawdowns?.[sourceIndex]
  const percentChange = point?.percent ?? rebasedReturns?.values[sourceIndex]
  const baseAt = point?.peakAt ?? rebasedReturns?.anchorAt
  const baseClose = point ? fixed(point.peakClose, 6) : rebasedReturns?.baseClose === undefined ? undefined :
    fixed(BigInt(Math.round(rebasedReturns.baseClose * 1e6)), 6)
  const percentAxis = drawdown || type === 'rebased-percent'
  const change = closeChanges?.values[sourceIndex]
  const histogram = type === 'close-change'
  const indicatorValues = sma.length > 0 || ema.length > 0
  function stopEditing() {
    setDrawingFields(null)
    setPicking(null)
    setDrawingError('')
  }
  function editDrawing() {
    const lastIndex = sourceEnd - 1
    const firstIndex = closeBased ? Math.max(0, lastIndex - 1) : Math.max(start, view.end - 2)
    const before = asset.bars[firstIndex]
    const after = asset.bars[lastIndex]
    drawingBeforeEdit.current = drawing
    setDrawingFields({
      start: endpointFields(drawing?.start ?? { time: before.time, ticks: Math.round(before.close * 1e6) }),
      end: endpointFields(drawing?.end ?? { time: after.time, ticks: Math.round(after.close * 1e6) }),
    })
    setDrawingError('')
  }
  async function saveDrawing(remove = false) {
    if (!drawingTools || drawingTools.busy) return
    try {
      let next = null
      if (!remove && drawingFields) {
        if (!sameDrawing(drawing, drawingBeforeEdit.current)) {
          throw Error('This measurement changed while you were editing. Cancel and reopen it.')
        }
        next = { start: parseEndpoint(drawingFields.start), end: parseEndpoint(drawingFields.end) }
        drawingTools.core.measureDrawing(next)
        if ([next.start, next.end].some(point => visibleBarAt(asset.bars, point.time, 0, asset.bars.length) === null)) {
          throw Error('Each drawing endpoint needs the UTC time of an existing bar.')
        }
      }
      await drawingTools.save(next)
      stopEditing()
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : 'Could not save the measurement.')
    }
  }
  function hover(index: number | null, observation?: ChartObservation) {
    setPointerIndex(index)
    setPointerObservation(observation)
    onTimestamp?.(index === null ? null : observation?.sourceTime ?? bars[index].time)
  }
  useLayoutEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    if (zone.current) obs.observe(zone.current)
    return () => obs.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (ref.current)
      plot.current =
        draw(
          ref.current,
          size.width,
          size.height,
          plotted,
          view,
          plottedSma,
          plottedEma,
          active,
          drawing,
          annotations,
          markerTimeline,
          type,
          baselineTicks,
          closeChanges,
          percentPlot,
          bandSeconds,
          timeframe,
          kagi,
          pointFigure,
          crosshairPrice,
          plottedStudies,
          plottedPriceLines,
          activeStudyPlotValues,
        )
  }, [plotted, view, plottedSma, plottedEma, active, size, drawing, annotations, markerTimeline, type, baselineTicks, closeChanges, percentPlot, bandSeconds, timeframe, kagi, pointFigure, crosshairPrice, plottedStudies, plottedPriceLines, activeStudyPlotValues])
  function pan(amount: number) {
    hover(null)
    setView((v) => changeView(v, n, v.count, amount))
  }
  function zoom(factor: number) {
    hover(null)
    setView((v) => changeView(v, n, v.count * factor, 0))
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function wheel(e: WheelEvent) {
      e.preventDefault()
      setPointerIndex(null)
      onTimestamp?.(null)
      setView((v) => changeView(v, n, v.count * (e.deltaY < 0 ? 0.8 : 1.25), 0))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [n, onTimestamp])
  function barIndexAt(x: number, bounds: Plot) {
    return x < bounds.left || x > bounds.right ? null :
      clamp(start + Math.floor((x - bounds.left) / (bounds.right - bounds.left) * view.count),
        start, view.end - 1)
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = plot.current
    if (!bounds) return
    if (drag.current) {
      const shift = Math.round(
        ((drag.current.x - e.clientX) / (bounds.right - bounds.left)) * view.count,
      )
      hover(null)
      setView({ ...view, end: clamp(drag.current.end + shift, view.count, n) })
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const index = barIndexAt(e.clientX - rect.left, bounds)
    const y = e.clientY - rect.top
    const observation = index === null || !observationsByTime || (panels.length && y > bounds.bottom) ?
      undefined : observationAt(index, priceTicksAt(y, bounds))
    hover(index, observation)
  }
  function observationAt(index: number, ticks: number) {
    if (kagi) return kagiSegmentAt(kagi.columns[index].segments, BigInt(ticks))
    if (pointFigure) return pointFigureBoxAt(pointFigure.columns[index], BigInt(ticks))
  }
  function priceTicksAt(y: number, bounds: Plot) {
    return Math.round(1e6 * (bounds.high - (bounds.high - bounds.low) * (y - bounds.top) /
      (bounds.bottom - bounds.top)))
  }
  function pickEndpoint(e: ReactPointerEvent<HTMLCanvasElement>, point: EndpointName) {
    const bounds = plot.current
    if (!bounds || !drawingFields) return
    const rect = e.currentTarget.getBoundingClientRect()
    const index = barIndexAt(e.clientX - rect.left, bounds)
    const y = e.clientY - rect.top
    if (index === null || y < bounds.top || y > bounds.bottom) return
    const ticks = priceTicksAt(y, bounds)
    const observation = observationsByTime ? observationAt(index, ticks) : undefined
    setDrawingFields({ ...drawingFields,
      [point]: endpointFields({ time: observation?.sourceTime ?? bars[index].time, ticks }) })
    setPicking(null)
    setDrawingError('')
  }
  function pickAnnotation(event: ReactPointerEvent<HTMLCanvasElement>, picker: AnnotationPicker) {
    const bounds = plot.current
    if (!bounds) return
    const rect = event.currentTarget.getBoundingClientRect()
    const index = barIndexAt(event.clientX - rect.left, bounds)
    const y = event.clientY - rect.top
    if (index === null || y < bounds.top || y > bounds.bottom) return
    const ticks = clamp(priceTicksAt(y, bounds), -MAX_CHART_PRICE_TICKS, MAX_CHART_PRICE_TICKS)
    const observed = observationAt(index, ticks)
    picker.accept({ ticks, time: observed?.sourceTime ?? bars[index].time })
    setAnnotationPicker(null)
  }
  return (
    <section className="plot" aria-label={closeBased || histogram || percentAxis ? chartNames[type] + ' chart' : 'Price and volume chart'}
      data-crosshair-time={active === null ? undefined : time}>
      <div className="ohlc" role={displayBars || movement || selectedObservation ? 'group' : undefined}
        aria-label={box ? 'Point and Figure box' : segment ? 'Kagi line' : movement ? (isRenko ? 'Renko brick' : 'Three Line Break line') :
          displayBars ? 'Heikin-Ashi prices' : undefined}>
        <time>{timeLabel(time)} UTC</time>
        {percentAxis ? <>
          <span><small>{drawdown ? 'Drawdown' : 'Percent change'}</small> {percentChange == null ? 'Missing' : fixed(percentChange, 6) + '%'}</span>
          <span><small>Observed close</small> {fixed(BigInt(Math.round(b.close * 1e6)), 6)}</span>
          {baseAt !== undefined && baseClose !== undefined && time >= baseAt &&
            <span><small>{drawdown ? 'Peak close' : 'Base close'}</small> {baseClose} · {timeLabel(baseAt)} UTC</span>}
          <span className="ohlc-vol"><small>Vol</small> {volume(b.volume)}</span>
        </> : histogram ? <>
          <span><small>Close change</small> {change == null ? 'Missing' : fixed(change, 6)}</span>
          <span><small>Observed close</small> {fixed(BigInt(Math.round(b.close * 1e6)), 6)}</span>
          {change != null && <span><small>Previous close</small> {fixed(BigInt(Math.round(prior.close * 1e6)), 6)}
            {' · '}{timeLabel(prior.time)} UTC</span>}
          <span className="ohlc-vol"><small>Vol</small> {volume(b.volume)}</span>
        </> : box ? <>
          <span><small>Column</small> {readoutIndex + 1}</span>
          <span><small>Box</small> {box.mark}</span>
          <span><small>Level</small> {fixed(box.levelTicks, 6)}</span>
          <span><small>Observed close</small> {fixed(box.sourceCloseTicks, 6)}</span>
        </> : segment ? <>
          <span><small>Line</small> {readoutIndex + 1}</span>
          <span><small>From</small> {fixed(segment.fromTicks, 6)}</span>
          <span><small>Close</small> {fixed(segment.toTicks, 6)}</span>
          <span><small>Weight</small> {(segment.thickBefore !== (segment.weightChangeTicks !== null)) ? 'Thick' : 'Thin'}</span>
        </> : movement ? <>
          <span><small>{isRenko ? 'Brick' : 'Line'}</small> {readoutIndex + 1}</span>
          <span><small>Open</small> {fixed(movement.openTicks, 6)}</span>
          <span><small>Close</small> {fixed(movement.closeTicks, 6)}</span>
          {isRenko && <span><small>Observed close</small> {fixed(movement.sourceCloseTicks, 6)}</span>}
        </> : <>
          {(['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k}>
              <small>{k[0].toUpperCase()}</small> {price(b[k])}
            </span>
          ))}
          {displayBars && <span><small>Observed close</small> {price(bars[readoutIndex].close)}</span>}
          <span className="ohlc-vol">
            <small>Vol</small> {volume(b.volume)}
          </span>
        </>}
        {observation !== undefined && <span className="timeframe-coverage">
          Observed at {timeLabel(observation)} UTC
        </span>}
        {coverage && <span className="timeframe-coverage">
          {coverage.observedBars}/{coverage.expectedBars} source bars
        </span>}
        {session && <span className="timeframe-coverage">
          Closes {timeLabel(session.closeTime)} UTC{session.earlyClose ? ' · Early session' : ''}
        </span>}
        {tick && <span className="timeframe-coverage">
          {tick.observedTrades}/{tick.targetTrades} trades · {tick.observedTrades < tick.targetTrades ? 'Provisional' : 'Complete'}
          {' · '}Observed through {timeLabel(tick.availableAt)} UTC
          {' · '}Capture sequence {tick.firstSequence.toString()}–{tick.lastSequence.toString()}
        </span>}
        {range && <span className="timeframe-coverage">
          Range {fixed(range.observedRangeTicks, 6)} / {fixed(range.targetRangeTicks, 6)}
          {' · '}{range.complete ? 'Complete' : 'Provisional'} · {range.observedTrades} trades
          {' · '}Observed through {timeLabel(range.availableAt)} UTC
          {' · '}Capture sequence {range.firstSequence.toString()}–{range.lastSequence.toString()}
        </span>}
        {volumeBar && <span className="timeframe-coverage">
          Volume {fixed(volumeBar.volumeTicks, 6)} / {fixed(volumeBar.targetVolumeTicks, 6)}
          {' · '}{volumeBar.complete ? 'Complete' : 'Provisional'} · {volumeBar.contributingTrades} contributing trades
          {' · '}Observed through {timeLabel(volumeBar.availableAt)} UTC
          {' · '}Capture sequence {volumeBar.firstSequence.toString()}–{volumeBar.lastSequence.toString()}
        </span>}
      </div>
      {periods && (
        <div className="ohlc chart-overlay-values" role={indicatorValues ? 'group' : undefined}
          aria-label={indicatorValues ? 'Moving average values' : undefined}>
          {([['sma', sma], ['ema', ema]] as const).map(([kind, series]) => {
            if (!series.length) return null
            const value = series[sourceIndex]
            return <span key={kind}>
              <small>{kind.toUpperCase()} {periods[kind]}</small> {value == null ? '—' : price(value)}
            </span>
          })}
        </div>
      )}
      {panels.map(({ kind, periods, lines, unit }, index) => {
        const { name, label } = STUDIES[kind]
        const heading = periods.length ? name + ' ' + periods.join('/') : name
        return <div key={kind} className="ohlc chart-overlay-values" role="group" aria-label={label}>
          {lines.length > 1 && <span><small>{heading}</small></span>}
          {lines.map((line, lineIndex) => {
            const value = studyValues[index][lineIndex]
            return <span key={line.key ?? kind}><small>{line.label ?? heading}</small> {
              value == null ? '—' : typeof value === 'bigint' ?
                fixed(value, 6) + (unit ? '' : '%') : fixed(BigInt(Math.round(value * 1e6)), 6)
            }</span>
          })}
        </div>
      })}
      {priceStudies.map(({ kind, heading, periods, lines }) => {
        const title = heading + ' ' + periods.join('/')
        return <div key={kind} className="ohlc chart-overlay-values" role="group" aria-label={STUDIES[kind].label}>
          {lines.length > 1 && <span><small>{title}</small></span>}
          {lines.map(({ key, label, series }) => {
            const value = series[sourceIndex]
            return <span key={key ?? kind}><small>{label ?? title}</small> {value == null ? '—' : fixed(value, 6)}</span>
          })}
        </div>
      })}
      <div ref={zone} className={picking || annotationPicker ? 'canvas-zone picking-endpoint' : 'canvas-zone'}
        style={panels.length ? { height: `calc(var(--price-chart-height) + ${110 * panels.length}px)` } : undefined}>
        <canvas
          tabIndex={0}
          aria-label={asset.symbol + ' interactive ' + chartNames[type] + (closeBased ? ' chart' : ' and volume chart')}
          ref={ref}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            if (picking) {
              pickEndpoint(e, picking)
              return
            }
            if (annotationPicker) {
              pickAnnotation(e, annotationPicker)
              return
            }
            drag.current = { x: e.clientX, end: view.end }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            drag.current = null
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            move(e)
          }}
          onPointerCancel={() => {
            drag.current = null
            hover(null)
          }}
          onPointerLeave={() => {
            if (!drag.current) hover(null)
          }}
          onPointerMove={move}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') pan(-1)
            else if (e.key === 'ArrowRight') pan(1)
            else if (e.key === '+') zoom(0.8)
            else if (e.key === '-') zoom(1.25)
            else return
            e.preventDefault()
          }}
        />
      </div>
      <div className="chart-foot">
        <div className="range">
          <span>{pointFigure ? 'Columns' : isRenko ? 'Bricks' : closeBased ? 'Lines' : 'Bars'}</span>
          {([30, 60, 120, 'All'] as const).map((r) => (
            <button
              key={r}
              aria-pressed={view.count === (r === 'All' ? n : r)}
              onClick={() => {
                hover(null)
                setView({ end: n, count: r === 'All' ? n : Math.min(r, n) })
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="viewport" data-testid="viewport">
          {start + 1}–{view.end} of {n}
        </span>
        <div className="tools">
          <button
            title="Earlier bars"
            aria-label="Earlier bars"
            disabled={start === 0}
            onClick={() => pan(-Math.max(1, Math.floor(view.count / 5)))}
          >
            <Icon name="left" />
          </button>
          <button
            title="Later bars"
            aria-label="Later bars"
            disabled={view.end === n}
            onClick={() => pan(Math.max(1, Math.floor(view.count / 5)))}
          >
            <Icon name="right" />
          </button>
          <button
            title="Zoom out"
            aria-label="Zoom out"
            disabled={view.count === n}
            onClick={() => zoom(1.25)}
          >
            <Icon name="minus" />
          </button>
          <button
            title="Zoom in"
            aria-label="Zoom in"
            disabled={view.count <= Math.min(5, n)}
            onClick={() => zoom(0.8)}
          >
            <Icon name="plus" />
          </button>
          <button
            title="Reset chart view"
            aria-label="Reset chart view"
            onClick={() => {
              hover(null)
              setView(defaultView(n))
            }}
          >
            <Icon name="reset" />
          </button>
        </div>
      </div>
      {drawingTools && (
        <div className="drawing-tools">
          {measurement && <MeasurementReadout measurement={measurement} />}
          {drawingFields ? (
            <DrawingEditor fields={drawingFields} picking={picking} error={drawingError}
              saving={drawingTools.busy}
              onChange={(point, fields) => {
                setDrawingFields({ ...drawingFields, [point]: fields })
                setDrawingError('')
              }}
              onPick={point => {
                setAnnotationPicker(null)
                setPicking(picking === point ? null : point)
              }}
              onSave={() => void saveDrawing()} onCancel={stopEditing} />
          ) : (
            <div className="drawing-buttons">
              <button type="button" disabled={drawingTools.busy} onClick={editDrawing}>
                {drawing ? 'Edit measurement' : 'Draw measurement'}
              </button>
              {drawing && <button type="button" disabled={drawingTools.busy}
                onClick={() => void saveDrawing(true)}>Remove measurement</button>}
              {drawingError && <p role="alert">{drawingError}</p>}
            </div>
          )}
          <ChartAnnotations entries={annotations} busy={drawingTools.busy} picking={annotationPicker?.point ?? null}
            setPicker={picker => {
              if (picker) setPicking(null)
              setAnnotationPicker(picker)
            }}
            defaults={{
              prior: { ticks: Math.round(preceding.close * 1e6), time: preceding.time },
              start: { ticks: Math.round(prior.close * 1e6), time: prior.time },
              end: { ticks: Math.round(asset.bars[sourceIndex].close * 1e6), time },
            }}
            save={drawingTools.saveAnnotation} />
        </div>
      )}
      {exportOptions && (
        <ChartExport asset={asset} visible={{ start: sourceStart, end: sourceEnd }} metadata={exportOptions.metadata}
          timeframe={timeframe} closeChanges={closeChanges} rebasedReturns={rebasedReturns} drawdowns={drawdowns}
          overlays={[
            ...(periods ? [
              { name: 'sma_' + periods.sma, series: sma },
              { name: 'ema_' + periods.ema, series: ema },
            ].filter(overlay => overlay.series.length > 0) : []),
            ...exportStudies,
          ]} />
      )}
      <span className="sr-only">
        Data from {dateLabel(firstObservation?.sourceTime ?? bars[start].time)} through{' '}
        {dateLabel(bars[view.end - 1].time)}. Focus the chart and use arrow keys
        to pan, plus and minus to zoom.
      </span>
    </section>
  )
}
