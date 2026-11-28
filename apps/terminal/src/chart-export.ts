import type { SeriesMetadata } from './catalog-schema'
import { sourcePermissionRestriction } from './catalog-schema'
import { fixed } from './fixed-point'
import type { AnchoredTwapPoint, AnchoredVwapPoint, CloseDistribution, ConfirmedSwing, DrawdownPoint, OpeningGap, SessionTimeframeBar, TimeframeBar, TimeUnderwaterPoint, TrueRangePoint } from './market-core'
import type { Asset } from './workspace'

export type BarRange = { start: number; end: number }
export type ExportOverlay = { name: string; series: readonly (number | bigint | null)[] }
export type CloseChangeSeries = {
  intervalSeconds: number
  values: readonly (bigint | null)[]
  waterfall?: { cutoff?: number }
}
export type OpeningGapSeries = { cutoff?: number; values: readonly (OpeningGap | null)[] }
export type TrueRangeSeries = { cutoff?: number; values: readonly (TrueRangePoint | null)[] }
export type RebasedReturnSeries = { anchorAt?: number; baseClose?: number; values: readonly (bigint | null)[] }
export type DrawdownSeries = readonly (DrawdownPoint | null)[]
export type TimeUnderwaterSeries = { cutoff?: number; values: readonly (TimeUnderwaterPoint | null)[] }
export type CloseDistributionSeries = { size: number; values: readonly (CloseDistribution | null)[] }
export type SwingSeries = { left: number; right: number; seconds: number; cutoff?: number;
  values: readonly (ConfirmedSwing | null)[] }
export type AnchoredVwapSeries = { id: string; anchorAt: number; values: readonly ((AnchoredVwapPoint & { observedAt: number }) | null)[] }
export type AnchoredTwapSeries = { id: string; anchorAt: number; values: readonly ((AnchoredTwapPoint & { observedAt: number }) | null)[] }
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
  analysis: { overlays: ExportOverlay[]; timeframe?: TimeframeView; closeChanges?: CloseChangeSeries; openingGaps?: OpeningGapSeries; trueRanges?: TrueRangeSeries; rebasedReturns?: RebasedReturnSeries; drawdowns?: DrawdownSeries; timeUnderwater?: TimeUnderwaterSeries; swings?: SwingSeries; closeDistributions?: CloseDistributionSeries; anchoredVwaps?: readonly AnchoredVwapSeries[]; anchoredTwaps?: readonly AnchoredTwapSeries[] } | undefined,
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
    if (analysis.closeChanges?.waterfall) fields.push('close_waterfall_known_through')
    if (analysis.closeChanges)
      fields.push('close_change_interval_seconds', 'previous_close_time', 'previous_close', 'close_change')
    if (analysis.openingGaps)
      fields.push('opening_gap_known_through', 'opening_gap_prior_time', 'opening_gap_prior_close', 'opening_gap')
    if (analysis.trueRanges)
      fields.push('true_range_known_through', 'true_range_prior_time', 'true_range_prior_close', 'true_range')
    if (analysis.rebasedReturns)
      fields.push('rebased_base_time', 'rebased_base_close', 'rebased_return_pct')
    if (analysis.drawdowns)
      fields.push('drawdown_peak_time', 'drawdown_peak_close', 'drawdown_pct')
    if (analysis.timeUnderwater)
      fields.push('underwater_known_through', 'underwater_peak_time', 'underwater_peak_close', 'underwater_seconds')
    if (analysis.closeDistributions)
      fields.push('distribution_size', 'distribution_first_time', 'distribution_last_time', 'distribution_minimum',
        'distribution_q1', 'distribution_median', 'distribution_q3', 'distribution_maximum')
    if (analysis.swings)
      fields.push('swing_left_bars', 'swing_right_bars', 'swing_interval_seconds', 'swing_known_through',
        'swing_pivot_at', 'swing_confirmed_at', 'swing_pivot_close', 'swing_side')
    for (const line of analysis.anchoredVwaps ?? []) {
      const prefix = 'anchored_vwap_' + line.id
      fields.push(prefix + '_anchor_at', prefix + '_observed_at', prefix + '_price', prefix + '_cumulative_volume')
    }
    for (const line of analysis.anchoredTwaps ?? []) {
      const prefix = 'anchored_twap_' + line.id
      fields.push(prefix + '_anchor_at', prefix + '_observed_at', prefix + '_price', prefix + '_elapsed_seconds')
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
      if (analysis.closeChanges) {
        const value = analysis.closeChanges.values[index]
        if (analysis.closeChanges.waterfall) row += ',' + (analysis.closeChanges.waterfall.cutoff ?? '')
        row += ',' + analysis.closeChanges.intervalSeconds + ','
        if (value == null) {
          row += ',,'
        } else {
          const prior = asset.bars[index - 1]
          row += [prior.time, decimal(prior.close), fixed(value, 6)].join(',')
        }
      }
      if (analysis.openingGaps) {
        const gap = analysis.openingGaps.values[index]
        row += ',' + (analysis.openingGaps.cutoff ?? '') + ',' +
          (gap ? [gap.priorAt, fixed(gap.priorClose, 6), fixed(gap.difference, 6)].join(',') : ',,')
      }
      if (analysis.trueRanges) {
        const point = analysis.trueRanges.values[index]
        const prior = point?.prior
        row += ',' + [analysis.trueRanges.cutoff ?? '', prior?.at ?? '',
          prior ? fixed(prior.close, 6) : '', point ? fixed(point.rangeTicks, 6) : ''].join(',')
      }
      if (analysis.rebasedReturns) {
        const { anchorAt, baseClose, values } = analysis.rebasedReturns
        const value = values[index]
        row += ',' + (anchorAt !== undefined && baseClose !== undefined && time >= anchorAt ?
          [anchorAt, decimal(baseClose), value == null ? '' : fixed(value, 6)].join(',') : ',,')
      }
      if (analysis.drawdowns) {
        const point = analysis.drawdowns[index]
        row += ',' + (point ? [point.peakAt, fixed(point.peakClose, 6), fixed(point.percent, 6)].join(',') : ',,')
      }
      if (analysis.timeUnderwater) {
        const point = analysis.timeUnderwater.values[index]
        row += ',' + [analysis.timeUnderwater.cutoff ?? '', point?.peakAt ?? '',
          point ? fixed(point.peakClose, 6) : '', point?.elapsedSeconds ?? ''].join(',')
      }
      if (analysis.closeDistributions) {
        const { size, values } = analysis.closeDistributions
        const box = values[index]
        row += ',' + (box ? [size, box.firstAt, box.lastAt, ...[box.minimum, box.lowerQuartile, box.median,
          box.upperQuartile, box.maximum].map(value => fixed(value, 6))].join(',') : ',,,,,,,')
      }
      if (analysis.swings) {
        const { left, right, seconds, cutoff, values } = analysis.swings
        const pivot = values[index]
        row += ',' + [left, right, seconds, cutoff ?? '', ...(pivot ?
          [pivot.pivotAt, pivot.confirmedAt, fixed(pivot.close, 6), pivot.side] : ['', '', '', ''])].join(',')
      }
      for (const line of analysis.anchoredVwaps ?? []) {
        const value = line.values[index]
        row += ',' + (value ? [line.anchorAt, value.observedAt, fixed(value.price, 6), fixed(value.cumulativeVolume, 6)].join(',') : ',,,')
      }
      for (const line of analysis.anchoredTwaps ?? []) {
        const value = line.values[index]
        row += ',' + (value ? [line.anchorAt, value.observedAt, fixed(value.price, 6), value.elapsedSeconds].join(',') : ',,,')
      }
      for (const { series } of analysis.overlays) {
        const value = series[index]
        row += ',' + (value == null ? '' : typeof value === 'bigint' ? fixed(value, 6) : decimal(value))
      }
    }
    rows.push(row)
  }
  return rows.join('\r\n') + '\r\n'
}
