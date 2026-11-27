import { tickPrice } from './fixed-point'
import type { Bar, PointFigureBox } from './market-core'

export function pointFigureLayout(boxes: PointFigureBox[], size: number) {
  const columns: PointFigureBox[][] = []
  const byTime = new Map<number, PointFigureBox>()
  for (const box of boxes) {
    const column = columns[box.column] ?? (columns[box.column] = [])
    column.push(box)
    byTime.set(box.sourceTime, box)
  }
  const bars: Bar[] = columns.map(column => {
    const last = column[column.length - 1]
    const open = tickPrice(column[0].levelTicks)
    const close = tickPrice(last.levelTicks)
    return { time: last.sourceTime, open, close, high: Math.max(open, close),
      low: Math.min(open, close), volume: 0 }
  })
  return { columns, byTime, bars, size }
}

export type PointFigureLayout = ReturnType<typeof pointFigureLayout>

export function pointFigureBoxAt(boxes: PointFigureBox[], ticks: bigint) {
  const first = boxes[0]
  const direction = first.mark === 'X' ? 1n : -1n
  let low = 0
  let high = boxes.length - 1
  const distance = (box: PointFigureBox) => direction * (box.levelTicks - ticks)
  while (low < high) {
    const mid = (low + high) >>> 1
    if (distance(boxes[mid]) < 0n) low = mid + 1
    else high = mid
  }
  return low > 0 && distance(boxes[low]) > -distance(boxes[low - 1]) ? boxes[low - 1] : boxes[low]
}
