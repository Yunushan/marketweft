import type { Bar, CandlePatternHit } from './market-core'
import type { PatternAlertSource } from './pattern-alert-export'
import { sha256Text } from './sha256'

export const patternNames: Record<CandlePatternHit['kind'], string> = {
  doji: 'Doji',
  'bullish-engulfing': 'Bullish engulfing',
  'bearish-engulfing': 'Bearish engulfing',
  piercing: 'Piercing',
  'dark-cloud-cover': 'Dark cloud cover',
  'bullish-harami': 'Bullish Harami',
  'bearish-harami': 'Bearish Harami',
  'bullish-harami-cross': 'Bullish Harami Cross',
  'bearish-harami-cross': 'Bearish Harami Cross',
  'morning-star': 'Morning Star',
  'evening-star': 'Evening Star',
  'morning-doji-star': 'Morning Doji Star',
  'evening-doji-star': 'Evening Doji Star',
}

const starPatterns = new Set<CandlePatternHit['kind']>([
  'morning-star', 'evening-star', 'morning-doji-star', 'evening-doji-star',
])

type PatternBarEvidence = {
  measuredAt: number
  observedAt: number
  ticks: { open: number; high: number; low: number; close: number; volume: number }
}

export type PatternAlert = {
  id: string
  type: 'candlestick'
  rule: {
    revision: 'candlestick-v1'
    pattern: CandlePatternHit['kind']
    series: string
    contextDigest: string
    interval: number
  }
  current: PatternBarEvidence
  previous?: PatternBarEvidence
  first?: PatternBarEvidence
  source?: PatternAlertSource
}

function candleEvidence(bar: Bar, observedAt: number): PatternBarEvidence {
  return {
    measuredAt: bar.time,
    observedAt,
    ticks: {
      open: Math.round(bar.open * 1e6),
      high: Math.round(bar.high * 1e6),
      low: Math.round(bar.low * 1e6),
      close: Math.round(bar.close * 1e6),
      volume: Math.round(bar.volume * 1e6),
    },
  }
}

export async function patternAlerts(
  series: string, calendar: string, interval: number, source: readonly Bar[],
  pattern: CandlePatternHit['kind'], matches: readonly CandlePatternHit[], provenance?: PatternAlertSource,
): Promise<PatternAlert[]> {
  const contextDigest = await sha256Text(JSON.stringify([series, interval, calendar]))
  const rule = { revision: 'candlestick-v1', pattern, series, contextDigest, interval } as const
  return matches.filter(hit => hit.kind === pattern).map(hit => {
    const bar = source[hit.barIndex]
    const current = candleEvidence(bar, hit.observedAt)
    const previous = source[hit.barIndex - 1]
    const id = 'CANDLE:' + rule.revision + ':' + contextDigest + ':' + pattern + ':' + bar.time
    return {
      id,
      type: 'candlestick',
      rule,
      current,
      ...(pattern === 'doji' ? {} : { previous: candleEvidence(previous, bar.time) }),
      ...(starPatterns.has(pattern) ? { first: candleEvidence(source[hit.barIndex - 2], previous.time) } : {}),
      ...(provenance ? { source: provenance } : {}),
    }
  })
}
