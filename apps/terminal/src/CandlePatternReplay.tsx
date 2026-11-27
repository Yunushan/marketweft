import { useState } from 'react'
import { sourcePermissionRestriction } from './catalog-schema'
import type { SourceRights } from './catalog-schema'
import type { Bar, CandlePatternHit, MarketCore } from './market-core'
import { utc } from './workspace'

const patternNames: Record<CandlePatternHit['kind'], string> = {
  doji: 'Doji',
  'bullish-engulfing': 'Bullish engulfing',
  'bearish-engulfing': 'Bearish engulfing',
}

export function CandlePatternReplay({
  core, calendar, interval, bars, cutoff, cursor, sourceRights,
}: {
  core: MarketCore
  calendar: string
  interval: number
  bars: readonly Bar[]
  cutoff: number | undefined
  cursor: number
  sourceRights?: SourceRights
}) {
  const [scan, setScan] = useState<{ cursor: number; hits: CandlePatternHit[]; error?: string } | null>(null)
  const current = scan?.cursor === cursor ? scan : null

  function run() {
    if (cutoff === undefined || !bars.length) return
    try {
      const restriction = sourcePermissionRestriction(sourceRights, 'automatedUse')
      if (restriction === 'permission') throw Error('Pattern scanning requires granted automated-use permission.')
      if (restriction === 'expired') throw Error('Pattern scanning is unavailable because the source grant has expired.')
      setScan({ cursor, hits: core.replayCandlePatterns(calendar, interval, bars, cutoff) })
    } catch (cause) {
      setScan({ cursor, hits: [], error: cause instanceof Error ? cause.message : 'Could not scan candlestick patterns.' })
    }
  }

  return (
    <details className="side-card replay-panel">
      <summary>Candlestick patterns</summary>
      <button type="button" className="outline" disabled={bars.length === 0 || cutoff === undefined} onClick={run}>
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
      </>}
    </details>
  )
}
