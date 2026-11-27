import { tickPrice } from './fixed-point'
import type { Bar, KagiSegment } from './market-core'

type KagiColumn = { segments: KagiSegment[]; change?: KagiSegment }

export function kagiLayout(segments: KagiSegment[]) {
  const columns: KagiColumn[] = []
  const byTime = new Map<number, KagiSegment>()
  for (const segment of segments) {
    const column = columns[segment.column] ?? (columns[segment.column] = { segments: [] })
    column.segments.push(segment)
    if (segment.weightChangeTicks !== null) column.change = segment
    byTime.set(segment.sourceTime, segment)
  }
  const bars: Bar[] = columns.map(({ segments }) => {
    const last = segments[segments.length - 1]
    const open = tickPrice(segments[0].fromTicks)
    const close = tickPrice(last.toTicks)
    return { time: last.sourceTime, open, close, high: Math.max(open, close),
      low: Math.min(open, close), volume: 0 }
  })
  return { columns, byTime, bars }
}

export type KagiLayout = ReturnType<typeof kagiLayout>

export function kagiSegmentAt(segments: KagiSegment[], ticks: bigint) {
  const rising = segments[0].toTicks > segments[0].fromTicks
  let first = 0
  let end = segments.length - 1
  while (first < end) {
    const mid = (first + end) >>> 1
    const close = segments[mid].toTicks
    if (rising ? close < ticks : close > ticks) first = mid + 1
    else end = mid
  }
  return segments[first]
}
