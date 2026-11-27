import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons'
import { fixed, tickPrice } from './fixed-point'
import { BAND_LINES, BAND_STYLE, isBandStudy, studyOverlays, STUDIES } from './studies'
import type { BandStudy, PanelLine, PanelStudy, StudyValue, StudyValues } from './studies'
import { kagiLayout, kagiSegmentAt } from './kagi-chart'
import type { KagiLayout } from './kagi-chart'
import { pointFigureBoxAt, pointFigureLayout } from './point-figure-chart'
import type { PointFigureLayout } from './point-figure-chart'
import { ChartExport } from './ChartExport'
import type { TimeframeView } from './chart-export'
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
function plotValue(value: StudyValue): number | null {
  return typeof value === 'bigint' ? tickPrice(value) : value
}
type ChartObservation = KagiSegment | PointFigureBox
type Plot = { left: number; right: number; top: number; bottom: number; high: number; low: number }
type DrawingTools = {
  core: MarketCore
  saved?: MeasuredDrawing
  busy: boolean
  save: (drawing: MeasuredDrawing | null) => Promise<void>
}
const UP = '#68d7b1',
  DOWN = '#ec817e',
  GOLD = '#e8ba70',
  LILAC = '#b59be6',
  CLOSE_LINE = '#55b5ee'
const chartNames: Record<ChartType, string> = {
  candles: 'candlestick',
  line: 'close line',
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
  type: ChartType,
  kagi: KagiLayout | undefined,
  pointFigure: PointFigureLayout | undefined,
  activePrice: number | undefined,
  studies: PlottedStudy[],
  bandStudies: readonly BandStudy[],
  activeStudyValues: (number | null)[][],
): Plot | undefined {
  const ctx = canvas.getContext('2d')
  if (!ctx || width < 80 || height < 100) return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.scale(dpr, dpr)
  const isPriceMovement = type === 'renko' || type === 'three-line-break'
  const closeBased = isPriceMovement || kagi !== undefined || pointFigure !== undefined
  const left = 10,
    top = 19,
    bottom = height - 28 - 110 * studies.length,
    volTop = top + (bottom - top) * 0.8,
    priceBottom = closeBased ? bottom : volTop - 13
  const start = view.end - view.count
  let low = Infinity,
    high = -Infinity,
    maxVol = 0
  for (let i = start; i < view.end; i++) {
    const b = bars[i]
    low = Math.min(low, type === 'line' ? b.close : b.low, sma[i] ?? Infinity, ema[i] ?? Infinity)
    high = Math.max(high, type === 'line' ? b.close : b.high, sma[i] ?? -Infinity, ema[i] ?? -Infinity)
    for (const { bands } of bandStudies) {
      const band = bands[i]
      if (band) {
        low = Math.min(low, tickPrice(band.lower))
        high = Math.max(high, tickPrice(band.upper))
      }
    }
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
    tickFormat.format(high - ((high - low) * t) / 5),
  )
  const studyPanels = studies.map(study => {
    if (study.kind === 'rsi')
      return { ...study, low: 0, high: 100, ticks: [0, 30, 70, 100], format: String }
    if (study.kind === 'stochastic')
      return { ...study, low: 0, high: 100, ticks: [0, 20, 80, 100], format: (tick: number) => tick + '%' }
    let low = 0
    let high = study.kind === 'bb_percent_b' ? 100 : 0
    for (const { series } of study.lines) {
      for (let index = start; index < view.end; index++) {
        const value = series[index]
        if (value == null) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    }
    if (low === high) high = 1
    const ticks = study.kind === 'bb_percent_b' ? [low, 0, 100, high] : [low, (low + high) / 2, 0, high]
    const format = study.kind === 'atr' ? price : (value: number) => price(value) + '%'
    return { ...study, low, high, ticks: [...new Set(ticks)].sort((a, b) => a - b), format }
  })
  const studyLabels = studyPanels.flatMap(panel => panel.ticks.map(panel.format))
  const closeLabel = price(bars[view.end - 1].close)
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
  for (let first = start; !closeBased && first < view.end; first += stride) {
    const last = Math.min(first + stride, view.end) - 1
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
  }
  for (const b of groups) {
    const axis = (x(b.first) + x(b.last)) / 2,
      w = Math.max(1, dx * (b.last - b.first + 1) * 0.68)
    const col = b.close >= b.open ? UP : DOWN
    ctx.fillStyle = col
    if (type !== 'line') {
      line(axis, y(b.high), axis, y(b.low), col)
      const open = y(b.open), close = y(b.close)
      if (type === 'ohlc') {
        line(axis - w / 2, open, axis, open, col)
        line(axis, close, axis + w / 2, close, col)
      } else {
        ctx.fillRect(axis - w / 2, Math.min(open, close), w,
          Math.max(1.2, Math.abs(open - close)))
      }
    }
    const h = maxVol > 0 ? (b.volume / maxVol) * (bottom - volTop) : 0
    ctx.globalAlpha = 0.46
    ctx.fillRect(axis - w / 2, bottom - h, w, h)
    ctx.globalAlpha = 1
  }
  if (type === 'line') {
    ctx.beginPath()
    ctx.strokeStyle = CLOSE_LINE
    ctx.fillStyle = CLOSE_LINE
    ctx.lineWidth = 2
    ctx.moveTo(x(start), y(bars[start].close))
    for (const { first, last, lowestClose, highestClose } of groups) {
      if (first === last) {
        ctx.lineTo(x(first), y(bars[first].close))
      } else {
        const indices = [...new Set([first, lowestClose, highestClose, last])].sort((a, b) => a - b)
        for (const index of indices) ctx.lineTo(x(index), y(bars[index].close))
      }
    }
    ctx.stroke()
    if (view.count === 1) {
      ctx.beginPath()
      ctx.arc(x(start), y(bars[start].close), 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const [values, color] of [
    [sma, GOLD],
    [ema, LILAC],
  ] as const) {
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
  for (const { kind, bands } of bandStudies) {
    for (const { key } of BAND_LINES) {
      const color = BAND_STYLE[kind][key]
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      let first = -1
      let points = 0
      for (let i = start; i < view.end; i++) {
        const band = bands[i]
        if (!band) continue
        const value = y(tickPrice(band[key]))
        if (points === 0) {
          first = i
          ctx.moveTo(x(i), value)
        } else {
          ctx.lineTo(x(i), value)
        }
        points++
      }
      ctx.stroke()
      const single = bands[first]
      if (points === 1 && single) {
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.arc(x(first), y(tickPrice(single[key])), 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  const close = bars[view.end - 1].close,
    at = y(close)
  const tag = bars[view.end - 1].close >= bars[view.end - 1].open ? UP : DOWN
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 0.8
  line(left, at, right, at, tag)
  ctx.setLineDash([])
  ctx.fillStyle = tag
  ctx.fillRect(right, at - 9, width - right, 18)
  ctx.fillStyle = '#0e1915'
  ctx.fillText(closeLabel, right + 6, at)
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
    const axis = x(active),
      pos = y(activePrice ?? bars[active].close)
    ctx.setLineDash([3, 4])
    line(axis, top, axis, bottom, '#bdc9c7')
    line(left, pos, right, pos, '#a2b4af')
    ctx.setLineDash([])
    ctx.fillStyle = '#e3ece8'
    ctx.beginPath()
    ctx.arc(axis, pos, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const [panelIndex, panel] of studyPanels.entries()) {
    const panelTop = bottom + 30 + 110 * panelIndex
    const panelBottom = panelTop + 97
    const studyY = (value: number) => panelBottom - (value - panel.low) / (panel.high - panel.low) * (panelBottom - panelTop)
    ctx.lineWidth = 1
    for (const tick of panel.ticks) {
      const level = studyY(tick)
      const reference = (panel.kind === 'rsi' && (tick === 30 || tick === 70)) ||
        (panel.kind === 'stochastic' && (tick === 20 || tick === 80)) ||
        (panel.kind === 'bb_percent_b' && (tick === 0 || tick === 100))
      line(left, level, right, level, reference ? '#3e4c6a' : '#293036')
      ctx.fillStyle = '#93a19e'
      ctx.fillText(panel.format(tick), right + 7, level)
    }
    for (const { color, series } of panel.lines) {
      ctx.beginPath()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = color
      let points = 0
      const isolated: [number, number][] = []
      for (let index = start; index <= view.end; index++) {
        const value = index === view.end ? null : series[index]
        if (value == null) {
          if (points === 1) isolated.push([x(index - 1), studyY(series[index - 1]!)])
          points = 0
        } else {
          if (points === 0) ctx.moveTo(x(index), studyY(value))
          else ctx.lineTo(x(index), studyY(value))
          points++
        }
      }
      ctx.stroke()
      if (isolated.length) {
        ctx.beginPath()
        ctx.fillStyle = color
        for (const [cx, cy] of isolated) {
          ctx.moveTo(cx + 2.5, cy)
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }
    if (active !== null && active >= start && active < view.end) {
      const axis = x(active)
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      line(axis, panelTop, axis, panelBottom, '#bdc9c7')
      ctx.setLineDash([])
      for (const [lineIndex, { color }] of panel.lines.entries()) {
        const selected = activeStudyValues[panelIndex][lineIndex]
        if (selected == null) continue
        ctx.beginPath()
        ctx.fillStyle = color
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
  const panels = useMemo(() => studies.filter(study => !isBandStudy(study)), [studies])
  const bandStudies = useMemo(() => studies.filter(isBandStudy), [studies])
  const plottedBands = useMemo(() => sourceIndices ? bandStudies.map(study => ({
    ...study, bands: sourceIndices.map(index => study.bands[index]),
  })) : bandStudies, [sourceIndices, bandStudies])
  const plottedStudies = useMemo<PlottedStudy[]>(() => panels.map(study => ({
    ...study,
    lines: study.lines.map(line => ({
      ...line,
      series: sourceIndices ? sourceIndices.map(index => plotValue(line.series[index])) : line.series.map(plotValue),
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
  const [drawingError, setDrawingError] = useState('')
  const drawing = drawingTools?.saved
  const drawingCore = drawingTools?.core
  const measurement = useMemo(() => drawing && drawingCore?.measureDrawing(drawing), [drawing, drawingCore])
  const start = view.end - view.count
  const observationsByTime = kagi?.byTime ?? pointFigure?.byTime
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
          type,
          kagi,
          pointFigure,
          crosshairPrice,
          plottedStudies,
          plottedBands,
          activeStudyPlotValues,
        )
  }, [plotted, view, plottedSma, plottedEma, active, size, drawing, type, kagi, pointFigure, crosshairPrice, plottedStudies, plottedBands, activeStudyPlotValues])
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
  return (
    <section className="plot" aria-label={closeBased ? chartNames[type] + ' chart' : 'Price and volume chart'}
      data-crosshair-time={active === null ? undefined : time}>
      <div className="ohlc" role={displayBars || movement || selectedObservation ? 'group' : undefined}
        aria-label={box ? 'Point and Figure box' : segment ? 'Kagi line' : movement ? (isRenko ? 'Renko brick' : 'Three Line Break line') :
          displayBars ? 'Heikin-Ashi prices' : undefined}>
        <time>{timeLabel(time)} UTC</time>
        {box ? <>
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
      {panels.map(({ kind, periods, lines }, index) => {
        const { name, label } = STUDIES[kind]
        const heading = name + ' ' + periods.join('/')
        return <div key={kind} className="ohlc chart-overlay-values" role="group" aria-label={label}>
          {lines.length > 1 && <span><small>{heading}</small></span>}
          {lines.map((line, lineIndex) => {
            const value = studyValues[index][lineIndex]
            return <span key={line.key ?? kind}><small>{line.label ?? heading}</small> {
              value == null ? '—' : typeof value === 'bigint' ?
                fixed(value, 6) + '%' : fixed(BigInt(Math.round(value * 1e6)), 6)
            }</span>
          })}
        </div>
      })}
      {bandStudies.map(study => {
        const { kind, period, bands } = study
        const value = bands[sourceIndex]
        return <div key={kind} className="ohlc chart-overlay-values" role="group" aria-label={STUDIES[kind].label}>
          <span><small>{BAND_STYLE[kind].name} {kind === 'keltner' ? `${period}/${study.atrPeriod}` : period}</small></span>
          {BAND_LINES.map(({ key, label }) =>
            <span key={key}><small>{label}</small> {value ? fixed(value[key], 6) : '—'}</span>)}
        </div>
      })}
      <div ref={zone} className={picking ? 'canvas-zone picking-endpoint' : 'canvas-zone'}
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
              onPick={point => setPicking(picking === point ? null : point)}
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
        </div>
      )}
      {exportOptions && (
        <ChartExport asset={asset} visible={{ start: sourceStart, end: sourceEnd }} metadata={exportOptions.metadata}
          timeframe={timeframe}
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
