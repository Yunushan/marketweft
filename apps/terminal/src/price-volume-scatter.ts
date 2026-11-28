import type { Bar } from './market-core'

const HIT_RADIUS = 12
const POINT_COLOR = '#8abcf0'
type Point = { x: number; y: number; index: number }

export function priceVolumeScatter(
  bars: readonly Bar[], start: number, end: number, width: number, height: number,
) {
  if (start >= end || width < 100 || height < 110) return
  const left = Math.min(86, width * 0.4)
  const right = width - 18
  const top = 24
  const bottom = height - 44
  let low = bars[start].close
  let high = low
  let maximumVolume = 0
  // Choosing the last repeated observation keeps picking deterministic even
  // when many bars share their exact close and volume.
  const positions = new Map<number, Map<number, number>>()
  for (let index = start; index < end; index++) {
    const { close, volume } = bars[index]
    low = Math.min(low, close)
    high = Math.max(high, close)
    maximumVolume = Math.max(maximumVolume, volume)
    let atVolume = positions.get(volume)
    if (!atVolume) positions.set(volume, atVolume = new Map())
    atVolume.set(close, index)
  }
  const padding = high === low ? Math.max(0.000001, Math.abs(high) * 0.00001) : (high - low) * 0.06
  const paddedHigh = high + padding
  const paddedLow = low - padding
  const xFor = (volume: number) => left + (right - left) * volume / (maximumVolume || 1)
  const yFor = (close: number) => top + (bottom - top) * (paddedHigh - close) / (paddedHigh - paddedLow)
  const point = (index: number): Point => ({
    x: xFor(bars[index].volume), y: yFor(bars[index].close), index,
  })
  const points = Array.from(positions.values()).flatMap(row => Array.from(row.values(), point))
  const columns = Math.ceil(width / HIT_RADIUS) + 1
  const bins = new Map<number, Point[]>()
  const bucket = (x: number, y: number) => Math.floor(y / HIT_RADIUS) * columns + Math.floor(x / HIT_RADIUS)
  for (const dot of points) {
    const key = bucket(dot.x, dot.y)
    const entries = bins.get(key)
    if (entries) entries.push(dot)
    else bins.set(key, [dot])
  }
  function pointAt(x: number, y: number): number | null {
    if (x < left - HIT_RADIUS || x > right + HIT_RADIUS || y < top || y > bottom) return null
    const center = bucket(x, y)
    let nearest: number | null = null
    let distance = HIT_RADIUS ** 2
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        for (const dot of bins.get(center + dy * columns + dx) ?? []) {
          const separation = (dot.x - x) ** 2 + (dot.y - y) ** 2
          if (separation < distance || (separation === distance && dot.index > (nearest ?? -1))) {
            nearest = dot.index
            distance = separation
          }
        }
      }
    }
    return nearest
  }
  return { left, right, top, bottom, high: paddedHigh, low: paddedLow, maximumVolume,
    points, point, pointAt, xFor, yFor, start, end }
}

export function drawPriceVolumeScatter(
  ctx: CanvasRenderingContext2D, plot: ReturnType<typeof priceVolumeScatter>, active: number | null,
) {
  if (!plot) return
  const { left, right, top, bottom, high, low, maximumVolume, points, point, xFor, yFor } = plot
  ctx.font = '10px "IBM Plex Mono", Consolas, monospace'
  const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
  const rule = (x0: number, y0: number, x1: number, y1: number, color = '#243248') => {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.fillStyle = '#b5c2d5'
  ctx.textAlign = 'right'
  ctx.fillText('Close', left - 8, top - 10)
  for (let step = 0; step <= 4; step++) {
    const close = high - (high - low) * step / 4
    const y = yFor(close)
    rule(left, y, right, y)
    ctx.fillText(format.format(close), left - 8, y + 3)
  }
  for (let step = 0; step <= (maximumVolume ? 4 : 0); step++) {
    const volume = maximumVolume * step / 4
    const x = xFor(volume)
    rule(x, top, x, bottom)
    ctx.textAlign = step === 0 ? 'left' : step === 4 ? 'right' : 'center'
    ctx.fillText(format.format(volume), x, bottom + 15)
  }
  ctx.textAlign = 'center'
  ctx.fillText('Volume', (left + right) / 2, bottom + 34)
  ctx.fillStyle = POINT_COLOR
  for (const { x, y } of points) ctx.fillRect(x - 2, y - 2, 4, 4)
  if (active === null || active < plot.start || active >= plot.end) return
  const { x, y } = point(active)
  rule(x, top, x, bottom, '#7a9abd')
  rule(left, y, right, y, '#7a9abd')
  ctx.strokeStyle = '#edf6ff'
  ctx.strokeRect(x - 4, y - 4, 8, 8)
}
