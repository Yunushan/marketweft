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
const SAMPLE_VERSION = 1

function backupVersion({ preferences, series }: CatalogData) {
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
    VERIFIED_PROVIDER_BACKUP_VERSION,
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
