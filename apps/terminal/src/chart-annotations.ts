import { fixed, MAX_CHART_PRICE_TICKS, parsePriceSize } from './fixed-point'
import { utc } from './workspace'

export type AnnotationKind = 'price' | 'time'
export type ChartAnnotation = { id: string } & (
  { kind: 'price'; ticks: number } | { kind: 'time'; time: number }
)
export type TimeColumn = { time: number; column: number }

export const EMPTY_ANNOTATIONS: readonly ChartAnnotation[] = []

export const ANNOTATION_NAMES = {
  price: 'Price line',
  time: 'Time marker',
} as const

export function annotationAnchor(annotation: ChartAnnotation): number {
  return annotation.kind === 'price' ? annotation.ticks : annotation.time
}

export function formatAnnotationAnchor(kind: AnnotationKind, anchor: number): string {
  return kind === 'price' ? fixed(BigInt(anchor), 6) : utc(anchor)
}

export function validAnnotationAnchor(kind: AnnotationKind, anchor: unknown): anchor is number {
  if (typeof anchor !== 'number' || !Number.isSafeInteger(anchor)) return false
  return kind === 'price' ? Math.abs(anchor) <= MAX_CHART_PRICE_TICKS :
    anchor >= -62_135_596_800 && anchor <= 253_402_300_799
}

export function parseAnnotationAnchor(kind: AnnotationKind, value: string): number {
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

export function makeAnnotation(id: string, kind: AnnotationKind, anchor: number): ChartAnnotation {
  return kind === 'price' ? { id, kind, ticks: anchor } : { id, kind, time: anchor }
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
