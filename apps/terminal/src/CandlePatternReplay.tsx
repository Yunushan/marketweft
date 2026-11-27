import { useState } from 'react'
import { sourcePermissionRestriction } from './catalog-schema'
import type { History, SourceRights } from './catalog-schema'
import type { Bar, CandlePatternHit, MarketCore } from './market-core'
import { utc } from './workspace'
import { saveAlerts } from './alert-inbox'
import { patternAlerts, patternNames } from './pattern-alert'
import { patternAlertSource } from './pattern-alert-export'

type Pattern = CandlePatternHit['kind']
type Delivery = { cursor: number; pattern: Pattern; message: string; failed?: boolean }

export function CandlePatternReplay({
  core, calendar, interval, series, bars, cutoff, cursor, sourceRights, sourceHistory, fixture,
}: {
  core: MarketCore
  calendar: string
  interval: number
  series: string
  bars: readonly Bar[]
  cutoff: number | undefined
  cursor: number
  sourceRights?: SourceRights
  sourceHistory?: History
  fixture: boolean
}) {
  const [scan, setScan] = useState<{ cursor: number; hits: CandlePatternHit[]; error?: string } | null>(null)
  const [pattern, setPattern] = useState<Pattern>('doji')
  const [saving, setSaving] = useState(false)
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const current = scan?.cursor === cursor ? scan : null
  const currentDelivery = delivery?.cursor === cursor && delivery.pattern === pattern ? delivery : null
  const hasMatches = current?.hits.some(hit => hit.kind === pattern) ?? false

  function checkPermission(action: 'automatedUse' | 'storage') {
    const restriction = sourcePermissionRestriction(sourceHistory?.descriptor.sourceRights, action) ??
      sourcePermissionRestriction(sourceRights, action)
    if (restriction === 'expired') throw Error('The source grant has expired.')
    if (restriction === 'permission') throw Error(action === 'storage'
      ? 'Saving pattern evidence requires granted storage permission.'
      : 'Pattern scanning requires granted automated-use permission.')
  }

  async function save() {
    if (saving || !current || !hasMatches) return
    setSaving(true)
    setDelivery(null)
    try {
      checkPermission('automatedUse')
      checkPermission('storage')
      const provenance = fixture ? { kind: 'fixture' } as const :
        sourceHistory ? await patternAlertSource(sourceHistory) : undefined
      const alerts = await patternAlerts(series, calendar, interval, bars, pattern, current.hits, provenance)
      const inserted = await saveAlerts(alerts)
      setDelivery({ cursor, pattern, message: inserted + (inserted === 1 ? ' new pattern alert saved.' : ' new pattern alerts saved.') })
    } catch (cause) {
      setDelivery({ cursor, pattern, failed: true, message: cause instanceof Error ? cause.message : 'Could not save pattern alerts.' })
    } finally {
      setSaving(false)
    }
  }

  function run() {
    if (cutoff === undefined || !bars.length) return
    try {
      checkPermission('automatedUse')
      setDelivery(null)
      setScan({ cursor, hits: core.replayCandlePatterns(calendar, interval, bars, cutoff) })
    } catch (cause) {
      setScan({ cursor, hits: [], error: cause instanceof Error ? cause.message : 'Could not scan candlestick patterns.' })
    }
  }

  return (
    <details className="side-card replay-panel">
      <summary>Candlestick patterns</summary>
      <button type="button" className="outline" disabled={saving || bars.length === 0 || cutoff === undefined} onClick={run}>
        Scan observed candles
      </button>
      {current?.error ? <p role="alert">{current.error}</p> : current && cutoff !== undefined && <>
        <p role="status">{current.hits.length} {current.hits.length === 1 ? 'pattern' : 'patterns'} through {utc(cutoff)}.</p>
        {current.hits.length > 25 && <p>Showing the latest 25 matches.</p>}
        {current.hits.length > 0 && <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Observed candlestick patterns">
            <thead><tr><th>Pattern</th><th>Bar opened (UTC)</th><th>Observed (UTC)</th></tr></thead>
            <tbody>
              {current.hits.slice(-25).reverse().map(hit => <tr key={hit.kind + ':' + hit.barIndex}>
                <td>{patternNames[hit.kind]}</td>
                <td>{utc(bars[hit.barIndex].time)}</td>
                <td>{utc(hit.observedAt)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        {current.hits.length > 0 && <div className="replay-controls">
          <label>Pattern alert rule
            <select value={pattern} disabled={saving} onChange={event => {
              setPattern(event.target.value as Pattern)
              setDelivery(null)
            }}>
              {(Object.keys(patternNames) as Pattern[]).map(kind =>
                <option key={kind} value={kind}>{patternNames[kind]}</option>)}
            </select>
          </label>
          <button type="button" className="primary" disabled={saving || !hasMatches} onClick={() => void save()}>
            Save pattern alerts
          </button>
        </div>}
        {currentDelivery && <p role={currentDelivery.failed ? 'alert' : 'status'}>{currentDelivery.message}</p>}
      </>}
    </details>
  )
}
