import { validateCatalogData } from './catalog'
import type { CatalogData, History } from './catalog'
import type { MarketCore } from './market-core'
import type { Asset } from './workspace'
import { isSha256, sha256Text } from './sha256'
import { canonicalJson } from './canonical-json'

const FORMAT = 'marketweft-workspace'
const SINGLE_PANE_BACKUP_VERSION = 1
const COMPARISON_BACKUP_VERSION = 2
const DRAWING_BACKUP_VERSION = 3
const INDICATOR_PERIODS_BACKUP_VERSION = 4
const CHART_TYPES_BACKUP_VERSION = 5
const OHLC_BARS_BACKUP_VERSION = 6
const STRUCTURED_GRANT_BACKUP_VERSION = 7
const VERIFIED_PROVIDER_BACKUP_VERSION = 8
const HEIKIN_ASHI_BACKUP_VERSION = 9
const RENKO_BACKUP_VERSION = 10
const LINE_BREAK_BACKUP_VERSION = 11
const KAGI_BACKUP_VERSION = 12
const POINT_FIGURE_BACKUP_VERSION = 13
const RANGE_SIZE_BACKUP_VERSION = 14
const VOLUME_SIZE_BACKUP_VERSION = 15
const RSI_BACKUP_VERSION = 16
const STUDIES_BACKUP_VERSION = 17
const BOLLINGER_BACKUP_VERSION = 18
const BOLLINGER_MEASURES_BACKUP_VERSION = 19
const DONCHIAN_BACKUP_VERSION = 20
const KELTNER_BACKUP_VERSION = 21
const STOCHASTIC_BACKUP_VERSION = 22
const WILLIAMS_R_BACKUP_VERSION = 23
const MACD_BACKUP_VERSION = 24
const CUMULATIVE_VOLUME_BACKUP_VERSION = 25
const CHAIKIN_BACKUP_VERSION = 26
const WEIGHTED_VOLUME_BACKUP_VERSION = 27
const DIRECTIONAL_MOVEMENT_BACKUP_VERSION = 28
const PRICE_MOMENTUM_BACKUP_VERSION = 29
const AROON_BACKUP_VERSION = 30
const ANNOTATION_BACKUP_VERSION = 31
const ANCHORED_ANNOTATION_BACKUP_VERSION = 32
const AREA_ANNOTATION_BACKUP_VERSION = 33
const POLYLINE_AND_FIBONACCI_BACKUP_VERSION = 34
const ELLIPSE_AND_TRIANGLE_BACKUP_VERSION = 35
const NOTE_AND_ARROW_BACKUP_VERSION = 36
const RANGE_HIGHLIGHT_BACKUP_VERSION = 37
const CLOSE_TRACE_BACKUP_VERSION = 38
const BASELINE_CHART_BACKUP_VERSION = 39
const CLOSE_CHANGE_BACKUP_VERSION = 40
const VOLUME_WEIGHTED_CANDLES_BACKUP_VERSION = 41
const HIGH_LOW_BAND_BACKUP_VERSION = 42
const REBASED_PERCENT_BACKUP_VERSION = 43
const DRAWDOWN_CHART_BACKUP_VERSION = 44
const SWING_CHART_BACKUP_VERSION = 45
const ANCHORED_VWAP_BACKUP_VERSION = 46
const PITCHFORK_BACKUP_VERSION = 47
const RISK_REWARD_BACKUP_VERSION = 48
const REGRESSION_CHANNEL_BACKUP_VERSION = 49
const FIBONACCI_EXTENSION_BACKUP_VERSION = 50
const FIBONACCI_TIME_ZONES_BACKUP_VERSION = 51
const HOLLOW_CANDLES_BACKUP_VERSION = 52
const SAMPLE_VERSION = 1

function backupVersion({ preferences, series }: CatalogData) {
  if (Object.values(preferences.chartTypes ?? {}).includes('hollow-candles'))
    return HOLLOW_CANDLES_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'fibonacci-time-zones')))
    return FIBONACCI_TIME_ZONES_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'fibonacci-extension')))
    return FIBONACCI_EXTENSION_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'regression-channel')))
    return REGRESSION_CHANNEL_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'risk-reward')))
    return RISK_REWARD_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'pitchfork')))
    return PITCHFORK_BACKUP_VERSION
  if (Object.values(preferences.annotations ?? {}).some(entries => entries.some(entry => entry.kind === 'anchored-vwap')))
    return ANCHORED_VWAP_BACKUP_VERSION
  if (preferences.swingSettings || Object.values(preferences.chartTypes ?? {}).includes('confirmed-swings'))
    return SWING_CHART_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).includes('drawdown'))
    return DRAWDOWN_CHART_BACKUP_VERSION
  if (preferences.rebaseTimes || Object.values(preferences.chartTypes ?? {}).includes('rebased-percent'))
    return REBASED_PERCENT_BACKUP_VERSION
  if (preferences.highLowSeconds || Object.values(preferences.chartTypes ?? {}).includes('high-low-band'))
    return HIGH_LOW_BAND_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).includes('volume-candles'))
    return VOLUME_WEIGHTED_CANDLES_BACKUP_VERSION
  if (preferences.closeChangeSeconds || Object.values(preferences.chartTypes ?? {}).includes('close-change'))
    return CLOSE_CHANGE_BACKUP_VERSION
  if (preferences.baselineTicks || Object.values(preferences.chartTypes ?? {}).includes('baseline'))
    return BASELINE_CHART_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).some(type => type === 'area' || type === 'step-line'))
    return CLOSE_TRACE_BACKUP_VERSION
  if (preferences.annotations) {
    const annotations = Object.values(preferences.annotations).flat()
    if (annotations.some(entry => entry.kind === 'price-range' || entry.kind === 'time-range'))
      return RANGE_HIGHLIGHT_BACKUP_VERSION
    if (annotations.some(entry => entry.kind === 'note' || entry.kind === 'arrow'))
      return NOTE_AND_ARROW_BACKUP_VERSION
    if (annotations.some(entry => entry.kind === 'ellipse' || entry.kind === 'triangle'))
      return ELLIPSE_AND_TRIANGLE_BACKUP_VERSION
    if (annotations.some(entry => entry.kind === 'polyline' || entry.kind === 'fibonacci'))
      return POLYLINE_AND_FIBONACCI_BACKUP_VERSION
    if (annotations.some(entry => entry.kind === 'rectangle' || entry.kind === 'channel'))
      return AREA_ANNOTATION_BACKUP_VERSION
    if (annotations.some(entry => entry.kind === 'ray' || entry.kind === 'trend'))
      return ANCHORED_ANNOTATION_BACKUP_VERSION
    return ANNOTATION_BACKUP_VERSION
  }
  const studies = Object.values(preferences.studies ?? {})
  if (studies.some(pane => pane?.aroon || pane?.aroon_oscillator)) return AROON_BACKUP_VERSION
  if (studies.some(pane => pane?.cci || pane?.roc)) return PRICE_MOMENTUM_BACKUP_VERSION
  if (studies.some(pane => pane?.dmi)) return DIRECTIONAL_MOVEMENT_BACKUP_VERSION
  if (studies.some(pane => pane?.mfi || pane?.vwma)) return WEIGHTED_VOLUME_BACKUP_VERSION
  if (studies.some(pane => pane?.chaikin_money_flow || pane?.chaikin_oscillator)) return CHAIKIN_BACKUP_VERSION
  if (studies.some(pane => pane?.obv || pane?.adl)) return CUMULATIVE_VOLUME_BACKUP_VERSION
  if (studies.some(pane => pane?.macd)) return MACD_BACKUP_VERSION
  if (studies.some(pane => pane?.williams_r)) return WILLIAMS_R_BACKUP_VERSION
  if (studies.some(pane => pane?.stochastic)) return STOCHASTIC_BACKUP_VERSION
  if (studies.some(pane => pane?.keltner)) return KELTNER_BACKUP_VERSION
  if (studies.some(pane => pane?.donchian)) return DONCHIAN_BACKUP_VERSION
  if (studies.some(pane => pane?.bb_percent_b || pane?.bb_bandwidth)) return BOLLINGER_MEASURES_BACKUP_VERSION
  if (studies.some(pane => pane?.bb)) return BOLLINGER_BACKUP_VERSION
  if (preferences.studies) return STUDIES_BACKUP_VERSION
  if (preferences.rsi) return RSI_BACKUP_VERSION
  if (preferences.volumeTicks) return VOLUME_SIZE_BACKUP_VERSION
  if (preferences.rangeTicks) return RANGE_SIZE_BACKUP_VERSION
  if (preferences.pointFigureTicks || Object.values(preferences.chartTypes ?? {}).includes('point-and-figure')) return POINT_FIGURE_BACKUP_VERSION
  if (preferences.kagiTicks || Object.values(preferences.chartTypes ?? {}).includes('kagi')) return KAGI_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).includes('three-line-break')) return LINE_BREAK_BACKUP_VERSION
  if (preferences.renkoTicks || Object.values(preferences.chartTypes ?? {}).includes('renko')) return RENKO_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).includes('heikin-ashi')) return HEIKIN_ASHI_BACKUP_VERSION
  if (series.some(({ descriptor }) => descriptor.version === 3)) return VERIFIED_PROVIDER_BACKUP_VERSION
  if (series.some(({ descriptor }) => descriptor.version === 2)) return STRUCTURED_GRANT_BACKUP_VERSION
  if (Object.values(preferences.chartTypes ?? {}).includes('ohlc')) return OHLC_BARS_BACKUP_VERSION
  if (preferences.chartTypes) return CHART_TYPES_BACKUP_VERSION
  if (preferences.overlayPeriods) return INDICATOR_PERIODS_BACKUP_VERSION
  if (preferences.drawings) return DRAWING_BACKUP_VERSION
  return preferences.comparison ? COMPARISON_BACKUP_VERSION : SINGLE_PANE_BACKUP_VERSION
}

async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw Error(
      'Backup verification needs a secure origin. Open MarketWeft over HTTPS or localhost.',
    )
  return sha256Text(canonicalJson(value, 'Workspace contains a value outside the backup format.'))
}

// Samples are embedded in the terminal. Pin their identities, ordering and all
// six-place price/volume ticks so a changed generator cannot silently alter a restore.
async function sampleDigest(samples: readonly Asset[]) {
  return digest(
    samples.map((asset) => ({
      id: asset.id,
      name: asset.name,
      bars: asset.bars.map((bar) => [
        bar.time,
        ...[bar.open, bar.high, bar.low, bar.close, bar.volume].map((v) =>
          Math.round(v * 1e6),
        ),
      ]),
    })),
  )
}

function fields(value: unknown, required: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw Error(
      'The file does not match the MarketWeft workspace backup schema.',
    )
  }
  return value as Record<string, unknown>
}

export async function exportWorkspace(
  data: CatalogData,
  samples: readonly Asset[],
): Promise<string> {
  const series = []
  for (const history of data.series) {
    series.push({ ...history, sha256: await digest(history) })
  }
  const manifest = {
    sampleSet: { version: SAMPLE_VERSION, sha256: await sampleDigest(samples) },
    preferences: data.preferences,
    seriesCount: series.length,
    barCount: series.reduce((count, item) => count + item.barCount, 0),
    series,
  }
  return (
    JSON.stringify(
      {
        format: FORMAT,
        version: backupVersion(data),
        manifest,
        sha256: await digest(manifest),
      },
      null,
      2,
    ) + '\n'
  )
}

export async function verifyWorkspaceBackup(
  core: MarketCore,
  samples: Asset[],
  text: string,
): Promise<CatalogData> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Error('The backup file is not valid JSON.')
  }
  const file = fields(parsed, ['format', 'version', 'manifest', 'sha256'])
  if (file.format !== FORMAT)
    throw Error('Choose a MarketWeft workspace backup.')
  if (typeof file.version !== 'number' || ![
    SINGLE_PANE_BACKUP_VERSION, COMPARISON_BACKUP_VERSION, DRAWING_BACKUP_VERSION,
    INDICATOR_PERIODS_BACKUP_VERSION, CHART_TYPES_BACKUP_VERSION, OHLC_BARS_BACKUP_VERSION,
    STRUCTURED_GRANT_BACKUP_VERSION,
    VERIFIED_PROVIDER_BACKUP_VERSION, HEIKIN_ASHI_BACKUP_VERSION, RENKO_BACKUP_VERSION, LINE_BREAK_BACKUP_VERSION, KAGI_BACKUP_VERSION,
    POINT_FIGURE_BACKUP_VERSION, RANGE_SIZE_BACKUP_VERSION, VOLUME_SIZE_BACKUP_VERSION, RSI_BACKUP_VERSION, STUDIES_BACKUP_VERSION, BOLLINGER_BACKUP_VERSION, BOLLINGER_MEASURES_BACKUP_VERSION, DONCHIAN_BACKUP_VERSION, KELTNER_BACKUP_VERSION, STOCHASTIC_BACKUP_VERSION, WILLIAMS_R_BACKUP_VERSION, MACD_BACKUP_VERSION, CUMULATIVE_VOLUME_BACKUP_VERSION, CHAIKIN_BACKUP_VERSION, WEIGHTED_VOLUME_BACKUP_VERSION, DIRECTIONAL_MOVEMENT_BACKUP_VERSION, PRICE_MOMENTUM_BACKUP_VERSION, AROON_BACKUP_VERSION, ANNOTATION_BACKUP_VERSION, ANCHORED_ANNOTATION_BACKUP_VERSION, AREA_ANNOTATION_BACKUP_VERSION, POLYLINE_AND_FIBONACCI_BACKUP_VERSION, ELLIPSE_AND_TRIANGLE_BACKUP_VERSION, NOTE_AND_ARROW_BACKUP_VERSION, RANGE_HIGHLIGHT_BACKUP_VERSION, CLOSE_TRACE_BACKUP_VERSION, BASELINE_CHART_BACKUP_VERSION, CLOSE_CHANGE_BACKUP_VERSION, VOLUME_WEIGHTED_CANDLES_BACKUP_VERSION, HIGH_LOW_BAND_BACKUP_VERSION, REBASED_PERCENT_BACKUP_VERSION, DRAWDOWN_CHART_BACKUP_VERSION, SWING_CHART_BACKUP_VERSION, ANCHORED_VWAP_BACKUP_VERSION, PITCHFORK_BACKUP_VERSION, RISK_REWARD_BACKUP_VERSION, REGRESSION_CHANNEL_BACKUP_VERSION, FIBONACCI_EXTENSION_BACKUP_VERSION, FIBONACCI_TIME_ZONES_BACKUP_VERSION, HOLLOW_CANDLES_BACKUP_VERSION,
  ].includes(file.version))
    throw Error('This workspace backup version is unsupported.')
  const manifest = fields(file.manifest, [
    'sampleSet',
    'preferences',
    'seriesCount',
    'barCount',
    'series',
  ])
  if (!isSha256(file.sha256) || (await digest(manifest)) !== file.sha256)
    throw Error('Workspace checksum mismatch. Choose an intact backup.')
  const sampleSet = fields(manifest.sampleSet, ['version', 'sha256'])
  if (
    sampleSet.version !== SAMPLE_VERSION ||
    sampleSet.sha256 !== (await sampleDigest(samples))
  )
    throw Error('The backup requires a different built-in sample dataset.')
  if (
    !Array.isArray(manifest.series) ||
    manifest.series.length !== manifest.seriesCount
  )
    throw Error('The backup series count does not match its contents.')
  const series: unknown[] = []
  for (const entry of manifest.series) {
    const { sha256, ...history } = fields(entry, [
      'id',
      'descriptor',
      'csv',
      'barCount',
      'sha256',
    ])
    if (!isSha256(sha256) || (await digest(history)) !== sha256)
      throw Error('A historical series checksum does not match its contents.')
    series.push(history)
  }
  // Use the catalog's Rust-backed validation before offering the replacement.
  const data = validateCatalogData(
    core,
    { preferences: manifest.preferences, series },
    samples,
  )
  if (backupVersion(data) !== file.version) {
    throw Error('The backup version does not match its contents.')
  }
  for (const history of data.series) {
    const verification = history.descriptor.providerVerification
    if (verification && await sha256Text(history.csv) !== verification.csvSha256)
      throw Error('A verified provider CSV does not match its recorded digest.')
  }
  if (
    data.series.reduce(
      (count: number, item: History) => count + item.barCount,
      0,
    ) !== manifest.barCount
  )
    throw Error('The backup bar count does not match its contents.')
  return data
}
