import type { ReplayEvent, Split } from './market-core'

type SplitEvent = {
  kind: 'split-notice' | 'split-effective' | 'split-revised' | 'split-canceled'
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
  const history = new Map<string | number, Split[]>()
  for (const split of splits) {
    const id = split.actionId ?? split.effectiveAt
    const revisions = history.get(id)
    if (revisions) revisions.push(split)
    else history.set(id, [split])
  }
  const visible = (time: number) => time >= first && time <= last
  for (const revisions of history.values()) {
    revisions.sort((a, b) => a.observedAt - b.observedAt)
    for (const [i, split] of revisions.entries()) {
      const eligibleAt = Math.max(split.effectiveAt, split.observedAt)
      const nextObservation = revisions[i + 1]?.observedAt ?? Infinity
      const eligible = !split.canceled && eligibleAt < nextObservation
      if (eligible) validateBoundary(split.effectiveAt)
      const effectiveEvent = eligible && split.effectiveAt >= split.observedAt
      if (visible(split.observedAt) && (!effectiveEvent || split.observedAt !== split.effectiveAt)) {
        const kind = split.canceled ? 'split-canceled' : split.actionId && i > 0 ? 'split-revised' : 'split-notice'
        extra.push({
          kind,
          eventTime: kind === 'split-notice' ? split.announcedAt : split.observedAt,
          observedAt: split.observedAt,
          split,
        })
      }
      if (effectiveEvent && visible(split.effectiveAt)) {
        extra.push({
          kind: 'split-effective',
          eventTime: split.effectiveAt,
          observedAt: split.effectiveAt,
          split,
        })
      }
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
