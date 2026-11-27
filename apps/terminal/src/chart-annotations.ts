import { fixed, MAX_CHART_PRICE_TICKS, parsePriceSize } from './fixed-point'
import type { DrawingEndpoint } from './market-core'
import { utc } from './workspace'

type TrianglePoints = [DrawingEndpoint, DrawingEndpoint, DrawingEndpoint]
export type AnnotationCoordinate = 'price' | 'time'
export type ChartAnnotation = { id: string } & (
  { kind: 'price'; ticks: number } | { kind: 'time'; time: number } |
  { kind: 'anchored-vwap'; time: number } |
  { kind: 'ray'; start: DrawingEndpoint } |
  { kind: 'trend'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'rectangle'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'channel'; start: DrawingEndpoint; end: DrawingEndpoint; offsetTicks: number } |
  { kind: 'polyline'; points: DrawingEndpoint[] } |
  { kind: 'fibonacci'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'ellipse'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'triangle'; points: TrianglePoints } |
  { kind: 'pitchfork'; points: TrianglePoints } |
  { kind: 'note'; start: DrawingEndpoint; text: string } |
  { kind: 'arrow'; start: DrawingEndpoint; end: DrawingEndpoint } |
  { kind: 'price-range'; lower: number; upper: number } |
  { kind: 'time-range'; lower: number; upper: number }
)
type TwoPointAnnotation = Extract<ChartAnnotation, { end: DrawingEndpoint }>
export type AnnotationKind = ChartAnnotation['kind']
export type TimeColumn = { time: number; column: number }

export const EMPTY_ANNOTATIONS: readonly ChartAnnotation[] = []

export const ANNOTATION_NAMES = {
  price: 'Price line',
  time: 'Time marker',
  'anchored-vwap': 'Anchored VWAP',
  ray: 'Horizontal ray',
  trend: 'Trend line',
  rectangle: 'Rectangle',
  channel: 'Parallel channel',
  polyline: 'Polyline',
  fibonacci: 'Fibonacci retracement',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  pitchfork: 'Pitchfork',
  note: 'Chart note',
  arrow: 'Directional arrow',
  'price-range': 'Price range',
  'time-range': 'Time range',
} as const

export function sameEndpoint(first: DrawingEndpoint, second: DrawingEndpoint): boolean {
  return first.ticks === second.ticks && first.time === second.time
}

export function sameAnnotation(first: ChartAnnotation, second: ChartAnnotation): boolean {
  switch (first.kind) {
    case 'price': return second.kind === 'price' && first.ticks === second.ticks
    case 'time':
    case 'anchored-vwap':
      return second.kind === first.kind && first.time === second.time
    case 'ray': return second.kind === 'ray' && sameEndpoint(first.start, second.start)
    case 'price-range':
    case 'time-range':
      return second.kind === first.kind && first.lower === second.lower && first.upper === second.upper
    case 'trend':
    case 'rectangle':
    case 'ellipse':
    case 'fibonacci':
    case 'arrow':
      return second.kind === first.kind && sameEndpoint(first.start, second.start) && sameEndpoint(first.end, second.end)
    case 'note':
      return second.kind === 'note' && first.text === second.text && sameEndpoint(first.start, second.start)
    case 'polyline':
    case 'triangle':
    case 'pitchfork':
      return second.kind === first.kind && first.points.length === second.points.length &&
        first.points.every((point, index) => sameEndpoint(point, second.points[index]))
    case 'channel':
      return second.kind === 'channel' && first.offsetTicks === second.offsetTicks &&
        sameEndpoint(first.start, second.start) && sameEndpoint(first.end, second.end)
  }
}

export function hasTwoPoints(kind: AnnotationKind): kind is TwoPointAnnotation['kind'] {
  return kind === 'trend' || kind === 'rectangle' || kind === 'channel' || kind === 'fibonacci' || kind === 'ellipse' || kind === 'arrow'
}

export function validateAnnotationGeometry(annotation: TwoPointAnnotation): void {
  const { kind, start, end } = annotation
  if (kind === 'trend' && sameEndpoint(start, end))
    throw Error('A trend line must have two different points.')
  if (kind === 'arrow' && sameEndpoint(start, end))
    throw Error('A directional arrow needs two different points.')
  if (kind === 'rectangle' && (start.time === end.time || start.ticks === end.ticks))
    throw Error('A rectangle needs two different times and two different prices.')
  if (kind === 'ellipse' && (start.time === end.time || start.ticks === end.ticks))
    throw Error('An ellipse needs two different times and two different prices.')
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

export function rangeCoordinate(kind: 'price-range' | 'time-range'): AnnotationCoordinate {
  return kind === 'price-range' ? 'price' : 'time'
}

export function rangeBounds(kind: 'price-range' | 'time-range', lower: unknown, upper: unknown) {
  const coordinate = rangeCoordinate(kind)
  if (!validAnnotationAnchor(coordinate, lower) || !validAnnotationAnchor(coordinate, upper) || lower >= upper)
    throw Error('A ' + ANNOTATION_NAMES[kind].toLowerCase() + ' needs two different ' + (coordinate === 'price' ? 'prices.' : 'UTC times.'))
  return { lower, upper }
}

export function validateNoteText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || !text.trim() || /[\r\n\u2028\u2029]/.test(text))
    throw Error('Enter a note on one line.')
}

export function validatePolyline(points: readonly DrawingEndpoint[]): void {
  if (points.length < 3) throw Error('A polyline needs at least three points.')
  if (points.some((point, index) => index > 0 && sameEndpoint(points[index - 1], point)))
    throw Error('Consecutive polyline points must differ.')
}

export function validateThreePoints(points: DrawingEndpoint[], kind: 'triangle' | 'pitchfork'): asserts points is TrianglePoints {
  if (points.length !== 3) throw Error('A ' + kind + ' needs exactly three points.')
  const [origin, second, third] = points
  const firstProduct = BigInt(second.time - origin.time) * BigInt(third.ticks - origin.ticks)
  const secondProduct = BigInt(third.time - origin.time) * BigInt(second.ticks - origin.ticks)
  if (firstProduct === secondProduct) throw Error(ANNOTATION_NAMES[kind] + ' points must enclose a nonzero area.')
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
