import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons'
import { dateLabel, price, timeLabel, volume } from './workspace'
import type { Asset } from './workspace'
import type { Bar } from './market-core'

type View = { end: number; count: number }
type Series = (number | null)[]
const UP = '#68d7b1',
  DOWN = '#ec817e',
  GOLD = '#e8ba70',
  LILAC = '#b59be6'
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

function visibleBarAt(bars: Bar[], timestamp: number, start: number, end: number) {
  let low = start
  let high = end
  while (low < high) {
    const mid = (low + high) >>> 1
    if (bars[mid].time < timestamp) low = mid + 1
    else high = mid
  }
  return low < end && bars[low].time === timestamp ? low : null
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
) {
  const ctx = canvas.getContext('2d')
  if (!ctx || width < 80 || height < 100) return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.scale(dpr, dpr)
  const left = 10,
    top = 19,
    bottom = height - 28,
    volTop = top + (bottom - top) * 0.8,
    priceBottom = volTop - 13
  const start = view.end - view.count
  let low = Infinity,
    high = -Infinity,
    maxVol = 0
  for (let i = start; i < view.end; i++) {
    const b = bars[i]
    low = Math.min(low, b.low, sma[i] ?? Infinity, ema[i] ?? Infinity)
    high = Math.max(high, b.high, sma[i] ?? -Infinity, ema[i] ?? -Infinity)
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
  const closeLabel = price(bars[view.end - 1].close)
  const axisWidth = Math.max(
    64,
    ...[closeLabel, ...ticksY].map(
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
  for (let j = 0; j < ticks; j++) {
    const i =
        start + Math.floor(((view.count - 1) * j) / Math.max(1, ticks - 1)),
      at = x(i)
    line(at, top, at, bottom, '#232b2e')
    const date = new Date(bars[i].time * 1000)
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
  }[] = []
  for (let first = start; first < view.end; first += stride) {
    const last = Math.min(first + stride, view.end) - 1
    let hi = bars[first].high,
      lo = bars[first].low,
      vol = 0
    for (let i = first; i <= last; i++) {
      hi = Math.max(hi, bars[i].high)
      lo = Math.min(lo, bars[i].low)
      vol += bars[i].volume
    }
    groups.push({
      first,
      last,
      open: bars[first].open,
      close: bars[last].close,
      high: hi,
      low: lo,
      volume: vol,
    })
    maxVol = Math.max(maxVol, vol)
  }
  for (const b of groups) {
    const axis = (x(b.first) + x(b.last)) / 2,
      w = Math.max(1, dx * (b.last - b.first + 1) * 0.68)
    const col = b.close >= b.open ? UP : DOWN
    line(axis, y(b.high), axis, y(b.low), col)
    ctx.fillStyle = col
    ctx.fillRect(
      axis - w / 2,
      Math.min(y(b.open), y(b.close)),
      w,
      Math.max(1.2, Math.abs(y(b.open) - y(b.close))),
    )
    const h = maxVol > 0 ? (b.volume / maxVol) * (bottom - volTop) : 0
    ctx.globalAlpha = 0.46
    ctx.fillRect(axis - w / 2, bottom - h, w, h)
    ctx.globalAlpha = 1
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
  if (active !== null && active >= start && active < view.end) {
    const axis = x(active),
      pos = y(bars[active].close)
    ctx.setLineDash([3, 4])
    line(axis, top, axis, bottom, '#bdc9c7')
    line(left, pos, right, pos, '#a2b4af')
    ctx.setLineDash([])
    ctx.fillStyle = '#e3ece8'
    ctx.beginPath()
    ctx.arc(axis, pos, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  return right - left
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
  linkedTimestamp,
  onTimestamp,
}: {
  asset: Asset
  sma: Series
  ema: Series
  linkedTimestamp?: number | null
  onTimestamp?: (timestamp: number | null) => void
}) {
  const { bars } = asset,
    n = bars.length
  const [view, setView] = useState<View>(() => defaultView(n)),
    [pointerIndex, setPointerIndex] = useState<number | null>(null)
  const [size, setSize] = useState({ width: 800, height: 360 })
  const ref = useRef<HTMLCanvasElement>(null),
    zone = useRef<HTMLDivElement>(null)
  const plottedWidth = useRef(1)
  const drag = useRef<{ x: number; end: number } | null>(null)
  const start = view.end - view.count
  const linkedIndex = linkedTimestamp == null ? null : visibleBarAt(bars, linkedTimestamp, start, view.end)
  const active = pointerIndex ?? linkedIndex
  const b = bars[active ?? view.end - 1]
  function hover(index: number | null) {
    setPointerIndex(index)
    onTimestamp?.(index === null ? null : bars[index].time)
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
      plottedWidth.current =
        draw(
          ref.current,
          size.width,
          size.height,
          bars,
          view,
          sma,
          ema,
          active,
        ) ?? 1
  }, [bars, view, sma, ema, active, size])
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
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    const plotWidth = Math.max(1, plottedWidth.current)
    if (drag.current) {
      const shift = Math.round(
        ((drag.current.x - e.clientX) / plotWidth) * view.count,
      )
      hover(null)
      setView({ ...view, end: clamp(drag.current.end + shift, view.count, n) })
      return
    }
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - 10
    hover(
      x < 0 || x > plotWidth
        ? null
        : clamp(
            start + Math.floor((x / plotWidth) * view.count),
            start,
            view.end - 1,
          ),
    )
  }
  return (
    <section className="plot" aria-label="Price and volume chart"
      data-crosshair-time={active === null ? undefined : bars[active].time}>
      <div className="ohlc">
        <time>{timeLabel(b.time)} UTC</time>
        {(['open', 'high', 'low', 'close'] as const).map((k) => (
          <span key={k}>
            <small>{k[0].toUpperCase()}</small> {price(b[k])}
          </span>
        ))}
        <span className="ohlc-vol">
          <small>Vol</small> {volume(b.volume)}
        </span>
      </div>
      <div ref={zone} className="canvas-zone">
        <canvas
          tabIndex={0}
          aria-label={
            asset.symbol + ' interactive candlestick and volume chart'
          }
          ref={ref}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            drag.current = { x: e.clientX, end: view.end }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            drag.current = null
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
          <span>Bars</span>
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
      <span className="sr-only">
        Data from {dateLabel(bars[start].time)} through{' '}
        {dateLabel(bars[view.end - 1].time)}. Focus the chart and use arrow keys
        to pan, plus and minus to zoom.
      </span>
    </section>
  )
}
