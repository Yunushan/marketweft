import type { DrawingEndpoint, MarketCore, MeasuredDrawing } from './market-core'
import { validIndicatorPeriod } from './market-core'
import type { Asset, SavedImport } from './workspace'

export type Preferences = {
  selected: string
  watchlist: string[]
  sma: boolean
  ema: boolean
  comparison?: ComparisonPreferences
  drawings?: Record<string, MeasuredDrawing>
  overlayPeriods?: Partial<Record<ChartPane, OverlayPeriods>>
  chartTypes?: Partial<Record<ChartPane, Exclude<ChartType, 'candles'>>>
}

export type ChartPane = 'primary' | 'comparison'
export type ChartType = 'candles' | 'line' | 'ohlc'
export type OverlayPeriods = { sma: number; ema: number }

export type ComparisonPreferences = {
  selected: string
  sma: boolean
  ema: boolean
  linked: boolean
}

export const SOURCE_RIGHTS = ['display', 'storage', 'redistribution', 'automatedUse'] as const
export type SourceRight = (typeof SOURCE_RIGHTS)[number]
export type SourceRightStatus = 'unconfirmed' | 'granted' | 'restricted'
export type SourceRights = Record<SourceRight, SourceRightStatus> & { expiresOn?: string }

export function sourcePermissionRestriction(
  rights: SourceRights | undefined, action: SourceRight,
): 'permission' | 'expired' | undefined {
  if (!rights) return undefined
  if (rights[action] !== 'granted') return 'permission'
  if (rights.expiresOn && new Date().toISOString().slice(0, 10) > rights.expiresOn) return 'expired'
  return undefined
}

type SeriesProvenance = {
  venue: string
  symbol: string
  barInterval: string
  source: string
  usageGrant: string
  adjustmentPolicy: string
}

export type SeriesDescriptor = SeriesProvenance & (
  { version: 1; sourceRights?: never } | { version: 2; sourceRights: SourceRights }
)

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
  SeriesProvenance,
  'barInterval' | 'source' | 'usageGrant' | 'adjustmentPolicy'
> & { sourceRights?: SourceRights }

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

function drawingEndpoint(value: unknown): DrawingEndpoint {
  fields(value, ['time', 'ticks'], 'drawing endpoint')
  const { time, ticks } = value
  if (typeof time !== 'number' || typeof ticks !== 'number')
    throw Error('Drawing endpoints require whole UTC seconds and whole price ticks.')
  return { time, ticks }
}

export function preferences(core: MarketCore, value: unknown, ids: Set<string>): Preferences {
  const keys = ['selected', 'watchlist', 'sma', 'ema']
  if (value && typeof value === 'object' && Object.hasOwn(value, 'comparison')) keys.push('comparison')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'drawings')) keys.push('drawings')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'overlayPeriods')) keys.push('overlayPeriods')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'chartTypes')) keys.push('chartTypes')
  fields(value, keys, 'workspace preference')
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
  const result: Preferences = { selected, watchlist: [...watchlist], sma, ema }
  if (keys.includes('comparison')) {
    fields(value.comparison, ['selected', 'sma', 'ema', 'linked'], 'comparison preference')
    const pane = value.comparison
    if (typeof pane.selected !== 'string' || !ids.has(pane.selected) ||
      typeof pane.sma !== 'boolean' || typeof pane.ema !== 'boolean' || typeof pane.linked !== 'boolean') {
      throw Error('Invalid comparison chart settings in the workspace.')
    }
    result.comparison = { selected: pane.selected, sma: pane.sma, ema: pane.ema, linked: pane.linked }
  }
  if (keys.includes('drawings')) {
    const drawings = value.drawings
    if (!drawings || typeof drawings !== 'object' || Array.isArray(drawings))
      throw Error('Invalid chart drawings in the workspace.')
    const entries = Object.entries(drawings)
    if (!entries.length || entries.length > ids.size)
      throw Error('Invalid chart drawings in the workspace.')
    result.drawings = Object.fromEntries(entries.map(([id, value]) => {
      if (!ids.has(id)) throw Error('Drawing refers to an unknown instrument: ' + id + '.')
      fields(value, ['start', 'end'], 'chart drawing')
      const drawing = { start: drawingEndpoint(value.start), end: drawingEndpoint(value.end) }
      core.measureDrawing(drawing)
      return [id, drawing]
    }))
  }
  if (keys.includes('overlayPeriods')) {
    const settings = value.overlayPeriods
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid chart period settings.')
    const names = Object.keys(settings)
    if (!names.length || names.some(name => name !== 'primary' && name !== 'comparison'))
      throw Error('Invalid chart pane in indicator period settings.')
    const periods: NonNullable<Preferences['overlayPeriods']> = {}
    for (const pane of ['primary', 'comparison'] as const) {
      if (!Object.hasOwn(settings, pane)) continue
      const pair = (settings as Record<string, unknown>)[pane]
      fields(pair, ['sma', 'ema'], 'pane indicator period')
      if (!validIndicatorPeriod(pair.sma) || !validIndicatorPeriod(pair.ema))
        throw Error('Indicator periods must be whole numbers from 1 through 100,000.')
      periods[pane] = { sma: pair.sma, ema: pair.ema }
    }
    result.overlayPeriods = periods
  }
  if (keys.includes('chartTypes')) {
    const settings = value.chartTypes
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid workspace chart types.')
    const entries = Object.entries(settings)
    if (!entries.length || entries.some(([pane, type]) =>
      (pane !== 'primary' && pane !== 'comparison') || (type !== 'line' && type !== 'ohlc'))) {
      throw Error('Unknown pane or chart type in the workspace.')
    }
    result.chartTypes = Object.fromEntries(entries)
  }
  return result
}

function sourceRights(value: unknown): SourceRights {
  const keys: string[] = [...SOURCE_RIGHTS]
  if (value && typeof value === 'object' && Object.hasOwn(value, 'expiresOn')) keys.push('expiresOn')
  fields(value, keys, 'structured usage grant')
  const status = (key: SourceRight): SourceRightStatus => {
    const entry = value[key]
    if (entry !== 'unconfirmed' && entry !== 'granted' && entry !== 'restricted')
      throw Error('Choose a recognized status for each source right.')
    return entry
  }
  const result: SourceRights = {
    display: status('display'),
    storage: status('storage'),
    redistribution: status('redistribution'),
    automatedUse: status('automatedUse'),
  }
  if (keys.includes('expiresOn')) {
    const expiry = value.expiresOn
    if (typeof expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiry))
      throw Error('Use a valid UTC calendar date for the source grant expiry.')
    const date = new Date(expiry + 'T00:00:00Z')
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== expiry)
      throw Error('Use a valid UTC calendar date for the source grant expiry.')
    result.expiresOn = expiry
  }
  return result
}

export function parseProviderHistoryFixture(text: string, filename: string): {
  item: SavedImport; metadata: SeriesMetadata
} {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw Error('Choose a valid JSON provider history fixture.')
  }
  fields(payload, [
    'format', 'version', 'provider', 'venue', 'symbol',
    'barInterval', 'grant', 'adjustmentPolicy', 'permissions', 'csv',
  ], 'provider history fixture')
  if (payload.format !== 'marketweft-provider-history' || payload.version !== 1)
    throw Error('This provider history fixture format or version is unsupported.')
  const provider = payload.provider
  if (typeof provider !== 'string' || provider.length > 64 ||
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(provider))
    throw Error('Supply a lowercase provider identifier.')
  const permissions = sourceRights(payload.permissions)
  if (!permissions.expiresOn)
    throw Error('A provider history fixture requires a UTC grant expiration date.')
  if (permissions.display !== 'granted' || permissions.storage !== 'granted')
    throw Error('A provider history fixture requires granted display and storage permissions.')
  if (sourcePermissionRestriction(permissions, 'display') === 'expired')
    throw Error('The provider history fixture grant has expired.')
  return {
    item: {
      venue: requiredText(payload.venue, 'venue'),
      symbol: requiredText(payload.symbol, 'symbol'),
      filename,
      csv: requiredText(payload.csv, 'OHLCV CSV'),
    },
    metadata: {
      source: provider,
      usageGrant: requiredText(payload.grant, 'provider grant'),
      barInterval: requiredText(payload.barInterval, 'bar interval'),
      adjustmentPolicy: requiredText(payload.adjustmentPolicy, 'adjustment policy'),
      sourceRights: permissions,
    },
  }
}

function descriptor(value: unknown, core: MarketCore): SeriesDescriptor {
  const hasRights = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'sourceRights'))
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
      ...(hasRights ? ['sourceRights'] : []),
    ],
    'series descriptor',
  )
  const venue = requiredText(value.venue, 'venue')
  const symbol = requiredText(value.symbol, 'symbol')
  if (
    value.version !== (hasRights ? 2 : 1) ||
    core.instrument(venue, symbol) !== venue + ':' + symbol
  ) {
    throw Error('Invalid series descriptor version or instrument identity.')
  }
  const provenance: SeriesProvenance = {
    venue,
    symbol,
    barInterval: requiredText(value.barInterval, 'bar interval'),
    source: requiredText(value.source, 'source'),
    usageGrant: requiredText(value.usageGrant, 'usage grant'),
    adjustmentPolicy: requiredText(value.adjustmentPolicy, 'adjustment policy'),
  }
  if (!hasRights) return { version: 1, ...provenance }
  const rights = sourceRights(value.sourceRights)
  if (rights.storage === 'restricted' || rights.display === 'restricted')
    throw Error('Local chart import requires permission to store and display this history.')
  return { version: 2, ...provenance, sourceRights: rights }
}

export function createHistory(
  core: MarketCore,
  item: SavedImport,
  metadata: Partial<SeriesMetadata> = {},
): History {
  const id = core.instrument(item.venue, item.symbol)
  const [venue, symbol] = id.split(':')
  const { sourceRights, ...details } = metadata
  const desc = descriptor(
    {
      version: sourceRights ? 2 : 1,
      venue,
      symbol,
      source: item.filename.trim() ? item.filename : 'unspecified',
      barInterval: 'unspecified',
      usageGrant: 'unspecified',
      adjustmentPolicy: 'unspecified',
      ...details,
      ...(sourceRights ? { sourceRights } : {}),
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
  return { preferences: preferences(core, value.preferences, ids), series, assets }
}

export function validateCatalogData(
  core: MarketCore,
  value: unknown,
  samples: Asset[],
): CatalogData {
  const data = materialize(core, value, samples)
  return { preferences: data.preferences, series: data.series }
}
