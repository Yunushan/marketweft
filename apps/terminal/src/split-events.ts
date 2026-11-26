import type { ReplayEvent, Split } from './market-core'

type SplitEvent = {
  kind: 'split-notice' | 'split-effective'
  eventTime: number
  observedAt: number
  split: Split
}
export type TimelineEvent = ReplayEvent | SplitEvent

export function splitTimeline(
  events: ReplayEvent[],
  splits: readonly Split[],
): TimelineEvent[] {
  if (splits.length === 0) return events

  const slots = events.filter(
    (event) => event.kind === 'bar' || event.kind === 'missing',
  )
  function validateBoundary(time: number) {
    let low = 0
    let high = slots.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (slots[mid].observedAt <= time) low = mid + 1
      else high = mid
    }
    const slot = slots[low]
    if (slot && slot.eventTime < time) {
      throw new Error(
        'A split is effective inside a bar interval. Use a calendar and interval with that boundary.',
      )
    }
  }

  const first = events[0].observedAt
  const last = events.at(-1)!.observedAt
  const extra: SplitEvent[] = []
  const effective = new Map<number, Split>()
  for (const split of splits) {
    validateBoundary(split.effectiveAt)
    if (split.observedAt <= split.effectiveAt)
      effective.set(split.effectiveAt, split)
    if (
      split.observedAt >= first &&
      split.observedAt <= last &&
      split.observedAt !== split.effectiveAt
    ) {
      extra.push({
        kind: 'split-notice',
        eventTime: split.announcedAt,
        observedAt: split.observedAt,
        split,
      })
    }
  }
  for (const split of effective.values()) {
    if (split.effectiveAt >= first && split.effectiveAt <= last) {
      extra.push({
        kind: 'split-effective',
        eventTime: split.effectiveAt,
        observedAt: split.effectiveAt,
        split,
      })
    }
  }
  extra.sort((a, b) => a.observedAt - b.observedAt)
  const result: TimelineEvent[] = []
  let next = 0
  for (const event of events) {
    while (next < extra.length && extra[next].observedAt <= event.observedAt)
      result.push(extra[next++])
    result.push(event)
  }
  return result
}
