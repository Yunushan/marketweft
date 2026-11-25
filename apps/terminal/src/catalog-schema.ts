import type { MarketCore } from './market-core'
import type { Asset, SavedImport } from './workspace'

export type Preferences = {
  selected: string
  watchlist: string[]
  sma: boolean
  ema: boolean
}

export type SeriesDescriptor = {
  version: 1
  venue: string
  symbol: string
  barInterval: string
  source: string
  usageGrant: string
  adjustmentPolicy: string
}

export type History = {
  id: string
  descriptor: SeriesDescriptor
  csv: string
  barCount: number
}
export type CatalogData = { preferences: Preferences; series: History[] }
export type CatalogSnapshot = CatalogData & {
  revision: number
  assets: Asset[]
  warning?: string
}
export type SeriesMetadata = Pick<
  SeriesDescriptor,
  'barInterval' | 'source' | 'usageGrant' | 'adjustmentPolicy'
>

function fields(
  value: unknown,
  names: string[],
  description: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== names.length ||
    names.some((key) => !Object.hasOwn(value, key))
  )
    throw Error('Invalid ' + description + ' fields.')
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw Error('Missing or empty ' + name + '.')
  return value
}

export function preferences(value: unknown, ids: Set<string>): Preferences {
  fields(value, ['selected', 'watchlist', 'sma', 'ema'], 'workspace preference')
  const { selected, watchlist, sma, ema } = value
  if (
    typeof selected !== 'string' ||
    !Array.isArray(watchlist) ||
    !watchlist.includes(selected) ||
    watchlist.some((id) => typeof id !== 'string' || !ids.has(id)) ||
    new Set(watchlist).size !== watchlist.length ||
    typeof sma !== 'boolean' ||
    typeof ema !== 'boolean'
  )
    throw Error(
      'Invalid selection, watchlist or indicator settings in the workspace.',
    )
  return { selected, watchlist: [...watchlist], sma, ema }
}

function descriptor(value: unknown, core: MarketCore): SeriesDescriptor {
  fields(
    value,
    [
      'version',
      'venue',
      'symbol',
      'barInterval',
      'source',
      'usageGrant',
      'adjustmentPolicy',
    ],
    'series descriptor',
  )
  const venue = requiredText(value.venue, 'venue')
  const symbol = requiredText(value.symbol, 'symbol')
  if (
    value.version !== 1 ||
    core.instrument(venue, symbol) !== venue + ':' + symbol
  ) {
    throw Error('Invalid series descriptor version or instrument identity.')
  }
  return {
    version: 1,
    venue,
    symbol,
    barInterval: requiredText(value.barInterval, 'bar interval'),
    source: requiredText(value.source, 'source'),
    usageGrant: requiredText(value.usageGrant, 'usage grant'),
    adjustmentPolicy: requiredText(value.adjustmentPolicy, 'adjustment policy'),
  }
}

export function createHistory(
  core: MarketCore,
  item: SavedImport,
  metadata: Partial<SeriesMetadata> = {},
): History {
  const id = core.instrument(item.venue, item.symbol)
  const [venue, symbol] = id.split(':')
  const desc = descriptor(
    {
      version: 1,
      venue,
      symbol,
      source: item.filename.trim() ? item.filename : 'unspecified',
      barInterval: 'unspecified',
      usageGrant: 'unspecified',
      adjustmentPolicy: 'unspecified',
      ...metadata,
    },
    core,
  )
  return {
    id,
    descriptor: desc,
    csv: item.csv,
    barCount: core.parseCsv(item.csv).length,
  }
}

// Build chart data through the same Rust parser as imports. A signed/verified
// checksum proves byte integrity only; the contents must still satisfy this schema.
export function historyAndAsset(
  core: MarketCore,
  value: unknown,
): { history: History; asset: Asset } {
  fields(value, ['id', 'descriptor', 'csv', 'barCount'], 'series record')
  const desc = descriptor(value.descriptor, core)
  const id = desc.venue + ':' + desc.symbol
  if (
    value.id !== id ||
    typeof value.csv !== 'string' ||
    !Number.isSafeInteger(value.barCount)
  ) {
    throw Error('Invalid series identity, history or record count.')
  }
  const bars = core.parseCsv(value.csv)
  if (!bars.length || bars.length !== value.barCount)
    throw Error('Bar count differs from the CSV for ' + id + '.')
  return {
    history: { id, descriptor: desc, csv: value.csv, barCount: bars.length },
    asset: {
      id,
      venue: desc.venue,
      symbol: desc.symbol,
      source: 'import',
      name: desc.source,
      bars,
    },
  }
}

export function materialize(
  core: MarketCore,
  value: unknown,
  samples: Asset[],
) {
  fields(value, ['preferences', 'series'], 'catalog')
  if (!Array.isArray(value.series))
    throw Error('Invalid historical series list.')
  const ids = new Set(samples.map((a) => a.id))
  const series: History[] = []
  const assets = [...samples]
  for (const item of value.series) {
    const { history, asset } = historyAndAsset(core, item)
    if (ids.has(history.id))
      throw Error('Duplicate or reserved instrument identity: ' + history.id)
    ids.add(history.id)
    series.push(history)
    assets.push(asset)
  }
  return { preferences: preferences(value.preferences, ids), series, assets }
}

export function validateCatalogData(
  core: MarketCore,
  value: unknown,
  samples: Asset[],
): CatalogData {
  const data = materialize(core, value, samples)
  return { preferences: data.preferences, series: data.series }
}
