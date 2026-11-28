import { useState } from 'react'
import { sourcePermissionRestriction, type SourceRights } from './catalog-schema'
import { fixed } from './fixed-point'
import type { Bar, MarketCore, ReplayEvent, SessionRelativeVolumePoint } from './market-core'
import { utc } from './workspace'

export function SessionRelativeVolumeReplay({
  core, calendar, interval, bars, sourceRights, event,
}: {
  core: MarketCore
  calendar: string
  interval: number
  bars: readonly Bar[]
  sourceRights?: SourceRights
  event?: ReplayEvent
}) {
  const [draft, setDraft] = useState('5')
  const [points, setPoints] = useState<SessionRelativeVolumePoint[] | null>(null)
  const [error, setError] = useState('')
  const restriction = sourcePermissionRestriction(sourceRights, 'automatedUse')
  const point = restriction || event?.barIndex == null ? undefined : points?.[event.barIndex]
  const display = (value: bigint | null) => value === null ? 'Unavailable' : fixed(value, 6)

  function apply() {
    try {
      if (restriction === 'expired') throw Error('The source grant has expired.')
      if (restriction === 'permission') throw Error('Session relative volume requires granted automated-use permission.')
      const lookback = Number(draft)
      if (!/^\d+$/.test(draft) || lookback < 1 || lookback > 10_000)
        throw Error('Use a whole lookback of 1–10,000 prior sessions.')
      setPoints(core.sessionRelativeVolume(calendar, interval, bars, lookback, 253_402_300_799))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not calculate session relative volume.')
    }
  }

  return (
    <details className="side-card replay-panel">
      <summary>Session relative volume</summary>
      <form className="replay-controls" onSubmit={submission => {
        submission.preventDefault()
        apply()
      }}>
        <label>Lookback sessions
          <input inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} />
        </label>
        <button className="outline">Apply session lookback</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {points && !point && !restriction && <p role="status">No observed volume for this interval.</p>}
      {point && <dl className="replay-times" aria-label="Session relative volume evidence">
        <div><dt>Observed at</dt><dd><time dateTime={utc(point.observedAt)}>{utc(point.observedAt)}</time></dd></div>
        <div><dt>Session offset</dt><dd>{point.offsetSeconds} s</dd></div>
        <div><dt>Interval duration</dt><dd>{point.durationSeconds} s</dd></div>
        <div><dt>Observed raw volume</dt><dd>{display(point.volume)}</dd></div>
        <div><dt>Prior sessions with a match</dt><dd>{point.contributingSessions} of {point.previousSessions}</dd></div>
        <div><dt>Prior average</dt><dd>{display(point.average)}</dd></div>
        <div><dt>Relative volume</dt><dd>{point.relative === null ? 'Unavailable' : display(point.relative) + '×'}</dd></div>
      </dl>}
    </details>
  )
}
