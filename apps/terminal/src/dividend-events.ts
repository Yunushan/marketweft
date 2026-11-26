import type { DividendEvent } from './market-core'
import type { TimelineEvent as MarketEvent } from './split-events'

export type DividendClock = {
  kind: 'dividend'
  eventTime: number
  observedAt: number
  dividends: DividendEvent[]
}

export type TimelineEvent = MarketEvent | DividendClock

export const dividendName = {
  report: 'Dividend report observed',
  ex: 'Dividend ex-date',
  pay: 'Dividend pay date',
  entitlement: 'Dividend entitlement revised',
} as const

export function dividendTimeline(
  events: MarketEvent[],
  dividends: readonly DividendEvent[],
): TimelineEvent[] {
  if (dividends.length === 0) return events
  const result: TimelineEvent[] = []
  let index = 0
  function appendThrough(cutoff: number) {
    while (index < dividends.length && dividends[index].at <= cutoff) {
      const at = dividends[index].at
      const start = index
      while (index < dividends.length && dividends[index].at === at) index++
      result.push({
        kind: 'dividend',
        eventTime: at,
        observedAt: at,
        dividends: dividends.slice(start, index),
      })
    }
  }
  for (const event of events) {
    appendThrough(event.observedAt)
    result.push(event)
  }
  appendThrough(Infinity)
  return result
}
