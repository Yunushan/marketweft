import { fibonacciFanLevels, markerColumn } from './chart-annotations'
import type { TimeColumn } from './chart-annotations'
import type { DrawingEndpoint } from './market-core'

type Point = [number, number]
type Bounds = { left: number; right: number; top: number; bottom: number }

function visibleRay(origin: Point, direction: Point, bounds: Bounds): [Point, Point] | null {
  const [x, y] = origin
  const [dx, dy] = direction
  let enter = 0
  let leave = Infinity
  for (const [coordinate, step, low, high] of [
    [x, dx, bounds.left, bounds.right], [y, dy, bounds.top, bounds.bottom],
  ]) {
    if (step === 0) {
      if (coordinate < low || coordinate > high) return null
    } else {
      const first = (low - coordinate) / step
      const last = (high - coordinate) / step
      enter = Math.max(enter, Math.min(first, last))
      leave = Math.min(leave, Math.max(first, last))
    }
  }
  if (enter >= leave || !Number.isFinite(leave)) return null
  return [[x + enter * dx, y + enter * dy], [x + leave * dx, y + leave * dy]]
}

export function pitchforkRays(points: readonly [DrawingEndpoint, DrawingEndpoint, DrawingEndpoint],
  timeline: readonly TimeColumn[], x: (column: number) => number, y: (price: number) => number, bounds: Bounds) {
  const [origin, second, third] = points
  const startColumn = markerColumn(timeline, origin.time)
  const midpointColumn = markerColumn(timeline, (second.time + third.time) / 2)
  if (startColumn === null || midpointColumn === null) return []
  const midPrice = (second.ticks + third.ticks) / 2e6
  const direction: Point = [x(midpointColumn) - x(startColumn), y(midPrice) - y(origin.ticks / 1e6)]
  return points.map(point => {
    const column = markerColumn(timeline, point.time)
    return column === null ? null : visibleRay([x(column), y(point.ticks / 1e6)], direction, bounds)
  })
}

export function fibonacciFanRays(start: DrawingEndpoint, end: DrawingEndpoint,
  timeline: readonly TimeColumn[], x: (column: number) => number, y: (price: number) => number, bounds: Bounds) {
  const from = markerColumn(timeline, start.time)
  const to = markerColumn(timeline, end.time)
  if (from === null || to === null || to <= from) return []

  const origin: Point = [x(from), y(start.ticks / 1e6)]
  const width = x(to) - origin[0]
  return fibonacciFanLevels(start.ticks, end.ticks).map(({ ticks }) =>
    visibleRay(origin, [width, y(Number(ticks) / 1e6) - origin[1]], bounds))
}
