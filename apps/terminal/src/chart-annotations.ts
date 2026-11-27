import { fixed, MAX_CHART_PRICE_TICKS, parsePriceSize } from './fixed-point'
import type { DrawingEndpoint } from './market-core'
import { utc } from './workspace'

export type AnnotationCoordinate = 'price' | 'time'
export type ChartAnnotation = { id: string } & (
  { kind: 'price'; ticks: number } | { kind: 'time'; time: number } |
  { kind: 'ray'; start: DrawingEndpoint } |
  { kind: 'trend'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'rectangle'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'channel'; start: DrawingEndpoint; end: DrawingEndpoint; offsetTicks: number } |
  { kind: 'polyline'; points: DrawingEndpoint[] } |
  { kind: 'fibonacci'; start: DrawingEndpoint; end: DrawingEndpoint }
)
type TwoPointAnnotation = Extract<ChartAnnotation, { end: DrawingEndpoint }>
export type AnnotationKind = ChartAnnotation['kind']
export type TimeColumn = { time: number; column: number }

export const EMPTY_ANNOTATIONS: readonly ChartAnnotation[] = []

export const ANNOTATION_NAMES = {
  price: 'Price line',
  time: 'Time marker',
  ray: 'Horizontal ray',
  trend: 'Trend line',
  rectangle: 'Rectangle',
  channel: 'Parallel channel',
  polyline: 'Polyline',
  fibonacci: 'Fibonacci retracement',
} as const

export function sameEndpoint(first: DrawingEndpoint, second: DrawingEndpoint): boolean {
  return first.ticks === second.ticks && first.time === second.time
}

export function sameAnnotation(first: ChartAnnotation, second: ChartAnnotation): boolean {
  switch (first.kind) {
    case 'price': return second.kind === 'price' && first.ticks === second.ticks
    case 'time': return second.kind === 'time' && first.time === second.time
    case 'ray': return second.kind === 'ray' && sameEndpoint(first.start, second.start)
    case 'trend':
    case 'rectangle':
    case 'fibonacci':
      return second.kind === first.kind && sameEndpoint(first.start, second.start) && sameEndpoint(first.end, second.end)
    case 'polyline':
      return second.kind === 'polyline' && first.points.length === second.points.length &&
        first.points.every((point, index) => sameEndpoint(point, second.points[index]))
    case 'channel':
      return second.kind === 'channel' && first.offsetTicks === second.offsetTicks &&
        sameEndpoint(first.start, second.start) && sameEndpoint(first.end, second.end)
  }
}

export function hasTwoPoints(kind: AnnotationKind): kind is TwoPointAnnotation['kind'] {
  return kind === 'trend' || kind === 'rectangle' || kind === 'channel' || kind === 'fibonacci'
}

export function validateAnnotationGeometry(annotation: TwoPointAnnotation): void {
  const { kind, start, end } = annotation
  if (kind === 'trend' && sameEndpoint(start, end))
    throw Error('A trend line must have two different points.')
  if (kind === 'rectangle' && (start.time === end.time || start.ticks === end.ticks))
    throw Error('A rectangle needs two different times and two different prices.')
  if (kind === 'fibonacci' && (start.time === end.time || start.ticks === end.ticks))
    throw Error('A Fibonacci retracement needs two different times and two different prices.')
  if (kind === 'channel') {
    const offset = annotation.offsetTicks
    if (start.time === end.time || offset === 0)
      throw Error('A parallel channel needs two different times and a nonzero price offset.')
    if (!validAnnotationAnchor('price', start.ticks + offset) || !validAnnotationAnchor('price', end.ticks + offset))
      throw Error('Both shifted channel prices must stay within the chart price bounds.')
  }
}

export function validatePolyline(points: readonly DrawingEndpoint[]): void {
  if (points.length < 3) throw Error('A polyline needs at least three points.')
  if (points.some((point, index) => index > 0 && sameEndpoint(points[index - 1], point)))
    throw Error('Consecutive polyline points must differ.')
}

const RETRACEMENT_LEVELS = [
  [0n, '0%'], [236n, '23.6%'], [382n, '38.2%'], [500n, '50%'],
  [618n, '61.8%'], [786n, '78.6%'], [1000n, '100%'],
] as const

export function fibonacciRetracements(start: number, end: number): { ticks: number; label: string }[] {
  const initial = BigInt(start)
  const final = BigInt(end)
  return RETRACEMENT_LEVELS.map(([ratio, label]) => {
    const scaled = final * 1000n + (initial - final) * ratio
    const rounded = (scaled + (scaled < 0n ? -500n : 500n)) / 1000n
    return { ticks: Number(rounded), label }
  })
}

export function formatAnnotationAnchor(kind: AnnotationCoordinate, anchor: number): string {
  return kind === 'price' ? fixed(BigInt(anchor), 6) : utc(anchor)
}

export function validAnnotationAnchor(kind: AnnotationCoordinate, anchor: unknown): anchor is number {
  if (typeof anchor !== 'number' || !Number.isSafeInteger(anchor)) return false
  return kind === 'price' ? Math.abs(anchor) <= MAX_CHART_PRICE_TICKS :
    anchor >= -62_135_596_800 && anchor <= 253_402_300_799
}

export function parseAnnotationAnchor(kind: AnnotationCoordinate, value: string): number {
  const text = value.trim()
  if (kind === 'price') {
    const negative = text.startsWith('-')
    const magnitude = parsePriceSize(negative ? text.slice(1) : text)
    if (magnitude === null || magnitude > BigInt(MAX_CHART_PRICE_TICKS))
      throw Error('Enter a price from −2,000,000,000 to 2,000,000,000 with up to six decimal places.')
    return Number(negative ? -magnitude : magnitude)
  }
  const time = Date.parse(text) / 1000
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) ||
      !validAnnotationAnchor('time', time) || utc(time) !== text)
    throw Error('Enter a time as YYYY-MM-DDTHH:MM:SSZ in UTC.')
  return time
}

export function markerColumn(timeline: readonly TimeColumn[], time: number): number | null {
  let low = 0
  let high = timeline.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (timeline[mid].time <= time) low = mid + 1
    else high = mid
  }
  const prior = timeline[low - 1]
  if (prior?.time === time) return prior.column
  const next = timeline[low]
  if (!prior || !next) return null
  return prior.column + (next.column - prior.column) * (time - prior.time) / (next.time - prior.time)
}
