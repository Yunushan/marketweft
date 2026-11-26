import type { SeriesMetadata } from './catalog-schema'
import { fixed } from './fixed-point'
import type { Asset } from './workspace'

export type BarRange = { start: number; end: number }
export type ExportOverlay = { name: string; series: readonly (number | null)[] }

function quoteText(text: string) {
  const safe = /^[\t\r\n]|^[\s\uFEFF]*[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

function decimal(value: number) {
  return fixed(BigInt(Math.round(value * 1e6)), 6)
}

export function chartCsv(
  asset: Asset,
  range: BarRange,
  analysis: { metadata?: SeriesMetadata; overlays: ExportOverlay[] } | undefined,
) {
  const fields = ['time', 'open', 'high', 'low', 'close', 'volume']
  let provenance = ''
  if (analysis) {
    const metadata = analysis.metadata
    const synthetic = asset.source === 'sample'
    fields.push('venue', 'symbol', 'source_kind', 'source', 'bar_interval', 'usage_grant', 'adjustment_policy')
    fields.push(...analysis.overlays.map(item => item.name))
    provenance = ',' + [
      asset.venue,
      asset.symbol,
      synthetic ? 'synthetic' : 'import',
      metadata?.source ?? asset.name,
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
      for (const { series } of analysis.overlays) {
        const value = series[index]
        row += ',' + (value == null ? '' : decimal(value))
      }
    }
    rows.push(row)
  }
  return rows.join('\r\n') + '\r\n'
}
