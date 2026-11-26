import type { SeriesMetadata } from './catalog-schema'
import { sourcePermissionRestriction } from './catalog-schema'
import { fixed } from './fixed-point'
import type { SessionTimeframeBar, TimeframeBar } from './market-core'
import type { Asset } from './workspace'

export type BarRange = { start: number; end: number }
export type ExportOverlay = { name: string; series: readonly (number | null)[] }
export type TimeframeView = { sourceSeconds: number; targetSeconds: number } & (
  { mode: 'utc'; buckets: TimeframeBar[] } |
  { mode: 'session'; buckets: SessionTimeframeBar[]; calendarName: string }
)

export function quoteText(text: string) {
  const safe = /^[\t\r\n]|^[\s\uFEFF]*[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

function decimal(value: number) {
  return fixed(BigInt(Math.round(value * 1e6)), 6)
}

export function chartCsv(
  asset: Asset,
  range: BarRange,
  metadata: SeriesMetadata | undefined,
  analysis: { overlays: ExportOverlay[]; timeframe?: TimeframeView } | undefined,
) {
  const restriction = sourcePermissionRestriction(metadata?.sourceRights, 'redistribution')
  if (restriction === 'permission')
    throw Error('Chart CSV export requires a granted redistribution permission.')
  if (restriction === 'expired')
    throw Error('Chart CSV export is unavailable because the source grant has expired.')
  const fields = ['time', 'open', 'high', 'low', 'close', 'volume']
  let provenance = ''
  if (analysis) {
    const synthetic = asset.source === 'sample'
    fields.push('venue', 'symbol', 'source_kind', 'source', 'bar_interval', 'usage_grant', 'adjustment_policy')
    if (analysis.timeframe) fields.push('source_interval_seconds', 'target_interval_seconds',
      'observed_source_bars', 'expected_source_bars')
    if (analysis.timeframe?.mode === 'session') {
      fields.push('bucket_close_utc', 'session_open_utc', 'session_kind', 'session_calendar')
    }
    fields.push(...analysis.overlays.map(item => item.name))
    provenance = ',' + [
      asset.venue,
      asset.symbol,
      synthetic ? 'synthetic' : 'import',
      metadata?.source ?? asset.name,
      analysis.timeframe ? analysis.timeframe.targetSeconds + ' seconds' :
        metadata?.barInterval ?? (synthetic ? '86400 seconds' : 'unspecified'),
      metadata?.usageGrant ?? (synthetic ? 'generated example' : 'unspecified'),
      metadata?.adjustmentPolicy ?? (synthetic ? 'synthetic' : 'unspecified'),
    ].map(quoteText).join(',')
  }
  const rows = [fields.join(',')]
  for (let index = range.start; index < range.end; index++) {
    const { time, open, high, low, close, volume } = asset.bars[index]
    let row = [time, ...[open, high, low, close, volume].map(decimal)].join(',') + provenance
    if (analysis) {
      if (analysis.timeframe) {
        const { sourceSeconds, targetSeconds, buckets } = analysis.timeframe
        row += ',' + [sourceSeconds, targetSeconds, buckets[index].observedBars,
          buckets[index].expectedBars].join(',')
        if (analysis.timeframe.mode === 'session') {
          const { closeTime, sessionOpen, earlyClose } = analysis.timeframe.buckets[index]
          row += ',' + [closeTime, sessionOpen, earlyClose ? 'early' : 'regular',
            quoteText(analysis.timeframe.calendarName)].join(',')
        }
      }
      for (const { series } of analysis.overlays) {
        const value = series[index]
        row += ',' + (value == null ? '' : decimal(value))
      }
    }
    rows.push(row)
  }
  return rows.join('\r\n') + '\r\n'
}
