import type { DrawingEndpoint, MarketCore, MeasuredDrawing } from './market-core'
import { rangeBounds, validAnnotationAnchor, validateAnnotationGeometry, validateNoteText, validatePolyline, validateTriangle } from './chart-annotations'
import type { ChartAnnotation } from './chart-annotations'
import { MAX_CHART_PRICE_TICKS } from './fixed-point'
import { validIndicatorPeriod, validRsiPeriod } from './market-core'
import type { Asset, SavedImport } from './workspace'
import { isSha256, sha256Text } from './sha256'
import { extraStudyPeriods, hasStudyPeriod, isStudyKind, STUDIES, validStudyPeriod, validStudyPeriodOrder } from './studies'
import type { StudySet, StudySettings } from './studies'
import { validProvider, verifyProviderSignature } from './provider-signature'

export type Preferences = {
  selected: string
  watchlist: string[]
  sma: boolean
  ema: boolean
  comparison?: ComparisonPreferences
  drawings?: Record<string, MeasuredDrawing>
  annotations?: Record<string, ChartAnnotation[]>
  overlayPeriods?: Partial<Record<ChartPane, OverlayPeriods>>
  rsi?: Partial<Record<ChartPane, StudySettings>>
  studies?: Partial<Record<ChartPane, StudySet>>
  chartTypes?: Partial<Record<ChartPane, Exclude<ChartType, 'candles'>>>
  renkoTicks?: Partial<Record<ChartPane, number>>
  kagiTicks?: Partial<Record<ChartPane, number>>
  pointFigureTicks?: Partial<Record<ChartPane, number>>
  rangeTicks?: Partial<Record<ChartPane, number>>
  volumeTicks?: Partial<Record<ChartPane, number>>
  baselineTicks?: Partial<Record<ChartPane, number>>
  closeChangeSeconds?: Partial<Record<ChartPane, number>>
  highLowSeconds?: Partial<Record<ChartPane, number>>
  rebaseTimes?: Partial<Record<ChartPane, number>>
}

export type ChartPane = 'primary' | 'comparison'
export type ChartType = 'candles' | 'volume-candles' | 'line' | 'area' | 'step-line' | 'baseline' | 'close-change' | 'high-low-band' | 'rebased-percent' | 'ohlc' | 'heikin-ashi' | 'renko' | 'three-line-break' | 'kagi' | 'point-and-figure'
const MAX_CHART_INTERVAL_SECONDS = 0xffff_ffff
export const DEFAULT_RENKO_TICKS = 1_000_000
export const DEFAULT_KAGI_TICKS = 1_000_000
export const DEFAULT_POINT_FIGURE_TICKS = 1_000_000
export { MAX_CHART_PRICE_TICKS }
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
export type ProviderVerification = { keySha256: string; csvSha256: string }
export type SignedProviderRevisionFixture = ProviderVerification & {
  provider: string
  instrument: string
  grant: string
  permissions: SourceRights & { expiresOn: string }
  csv: string
}

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
  { version: 1; sourceRights?: never; providerVerification?: never }
  | { version: 2; sourceRights: SourceRights; providerVerification?: never }
  | { version: 3; sourceRights: SourceRights; providerVerification: ProviderVerification }
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
> & { sourceRights?: SourceRights; providerVerification?: ProviderVerification }

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

function annotationEndpoint(value: unknown): DrawingEndpoint {
  const { time, ticks } = drawingEndpoint(value)
  if (!validAnnotationAnchor('time', time) || !validAnnotationAnchor('price', ticks))
    throw Error('Invalid chart annotation endpoint.')
  return { time, ticks }
}

export function preferences(core: MarketCore, value: unknown, ids: Set<string>): Preferences {
  const keys = ['selected', 'watchlist', 'sma', 'ema']
  if (value && typeof value === 'object' && Object.hasOwn(value, 'comparison')) keys.push('comparison')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'drawings')) keys.push('drawings')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'annotations')) keys.push('annotations')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'overlayPeriods')) keys.push('overlayPeriods')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'chartTypes')) keys.push('chartTypes')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'rsi')) keys.push('rsi')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'studies')) keys.push('studies')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'rebaseTimes')) keys.push('rebaseTimes')
  const intervalSettings = ['closeChangeSeconds', 'highLowSeconds'] as const
  for (const key of intervalSettings) {
    if (value && typeof value === 'object' && Object.hasOwn(value, key)) keys.push(key)
  }
  const tickSettings = ['renkoTicks', 'kagiTicks', 'pointFigureTicks', 'rangeTicks', 'volumeTicks', 'baselineTicks'] as const
  for (const key of tickSettings) {
    if (value && typeof value === 'object' && Object.hasOwn(value, key)) keys.push(key)
  }
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
  if (keys.includes('annotations')) {
    const annotations = value.annotations
    if (!annotations || typeof annotations !== 'object' || Array.isArray(annotations) || !Object.keys(annotations).length)
      throw Error('Invalid chart annotations in the workspace.')
    result.annotations = Object.fromEntries(Object.entries(annotations).map(([instrument, entries]) => {
      if (!ids.has(instrument) || !Array.isArray(entries) || !entries.length)
        throw Error('Invalid chart annotations for an instrument.')
      const annotationIds = new Set<string>()
      return [instrument, Array.from(entries, (entry: unknown) => {
        const kind = entry && typeof entry === 'object' && Object.hasOwn(entry, 'kind') ?
          (entry as { kind: unknown }).kind : undefined
        const coordinateFields = {
          price: ['ticks'], time: ['time'], ray: ['start'], trend: ['start', 'end'],
          rectangle: ['start', 'end'], channel: ['start', 'end', 'offsetTicks'],
          polyline: ['points'], fibonacci: ['start', 'end'], ellipse: ['start', 'end'], triangle: ['points'], note: ['start', 'text'], arrow: ['start', 'end'],
          'price-range': ['lower', 'upper'], 'time-range': ['lower', 'upper'],
        }
        if (typeof kind !== 'string' || !Object.hasOwn(coordinateFields, kind))
          throw Error('Invalid chart annotation type.')
        const type = kind as keyof typeof coordinateFields
        fields(entry, ['id', 'kind', ...coordinateFields[type]], 'chart annotation')
        const { id } = entry
        if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) ||
            annotationIds.has(id))
          throw Error('Invalid chart annotation ID.')
        annotationIds.add(id)
        if (type === 'price') {
          if (!validAnnotationAnchor(type, entry.ticks)) throw Error('Invalid chart annotation price.')
          return { id, kind: type, ticks: entry.ticks }
        }
        if (type === 'time') {
          if (!validAnnotationAnchor(type, entry.time)) throw Error('Invalid chart annotation time.')
          return { id, kind: type, time: entry.time }
        }
        if (type === 'polyline' || type === 'triangle') {
          if (!Array.isArray(entry.points)) throw Error('Invalid chart annotation points.')
          const points = Array.from(entry.points, annotationEndpoint)
          if (type === 'triangle') {
            validateTriangle(points)
            return { id, kind: type, points }
          }
          validatePolyline(points)
          return { id, kind: type, points }
        }
        if (type === 'price-range' || type === 'time-range') {
          return { id, kind: type, ...rangeBounds(type, entry.lower, entry.upper) }
        }
        const start = annotationEndpoint(entry.start)
        if (type === 'ray') return { id, kind: type, start }
        if (type === 'note') {
          validateNoteText(entry.text)
          return { id, kind: type, start, text: entry.text }
        }
        const end = annotationEndpoint(entry.end)
        if (type === 'channel') {
          if (!validAnnotationAnchor('price', entry.offsetTicks)) throw Error('Invalid channel offset.')
          const channel = { id, kind: type, start, end, offsetTicks: entry.offsetTicks }
          validateAnnotationGeometry(channel)
          return channel
        }
        const annotation = { id, kind: type, start, end }
        validateAnnotationGeometry(annotation)
        return annotation
      })]
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
  if (keys.includes('rsi')) {
    const settings = value.rsi
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid RSI settings.')
    const entries = Object.entries(settings)
    if (!entries.length) throw Error('RSI settings require a chart pane.')
    result.rsi = Object.fromEntries(entries.map(([pane, entry]) => {
      if (pane !== 'primary' && pane !== 'comparison') throw Error('Invalid chart pane in RSI settings.')
      fields(entry, ['enabled', 'period'], 'pane RSI settings')
      if (typeof entry.enabled !== 'boolean' || !validRsiPeriod(entry.period))
        throw Error('RSI needs an enabled setting and a whole period from 2 through 100,000.')
      return [pane, { enabled: entry.enabled, period: entry.period }]
    }))
  }
  if (keys.includes('studies')) {
    const settings = value.studies
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid study settings.')
    const panes = Object.entries(settings)
    if (!panes.length) throw Error('Study settings require a chart pane.')
    result.studies = Object.fromEntries(panes.map(([pane, value]) => {
      if (pane !== 'primary' && pane !== 'comparison') throw Error('Invalid chart pane in study settings.')
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid pane studies.')
      const entries = Object.entries(value)
      if (!entries.length) throw Error('Study settings require a study.')
      const studies: StudySet = {}
      for (const [kind, entry] of entries) {
        if (!isStudyKind(kind)) throw Error('Unknown configured study.')
        const periods = extraStudyPeriods(kind)
        const needsPeriod = hasStudyPeriod(kind)
        fields(entry, ['enabled', ...(needsPeriod ? ['period'] : []), ...periods], 'pane study settings')
        if (typeof entry.enabled !== 'boolean') throw Error('Invalid enabled setting for the configured study.')
        const study: StudySettings = { enabled: entry.enabled }
        if (needsPeriod) {
          if (!validStudyPeriod(kind, entry.period)) throw Error('Invalid period for the configured study.')
          study.period = entry.period
        }
        for (const key of periods) {
          const period = entry[key]
          if (!validStudyPeriod(kind, period)) throw Error('Invalid auxiliary study period.')
          study[key] = period
        }
        if (!validStudyPeriodOrder(kind, study)) throw Error(`The ${STUDIES[kind].name} fast period must be shorter than the slow period.`)
        studies[kind] = study
      }
      return [pane, studies]
    }))
  }
  if (keys.includes('chartTypes')) {
    const settings = value.chartTypes
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid workspace chart types.')
    const entries = Object.entries(settings)
    if (!entries.length || entries.some(([pane, type]) =>
      (pane !== 'primary' && pane !== 'comparison') || (type !== 'volume-candles' && type !== 'line' && type !== 'area' && type !== 'step-line' && type !== 'baseline' && type !== 'close-change' && type !== 'high-low-band' && type !== 'rebased-percent' && type !== 'ohlc' && type !== 'heikin-ashi' && type !== 'renko' &&
        type !== 'three-line-break' && type !== 'kagi' && type !== 'point-and-figure'))) {
      throw Error('Unknown pane or chart type in the workspace.')
    }
    result.chartTypes = Object.fromEntries(entries)
  }
  for (const key of tickSettings) {
    if (!keys.includes(key)) continue
    const settings = value[key]
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid chart price size settings.')
    const entries = Object.entries(settings)
    if (!entries.length || entries.some(([pane, ticks]) =>
      (pane !== 'primary' && pane !== 'comparison') || !validAnnotationAnchor('price', ticks) ||
      (key !== 'baselineTicks' && ticks <= 0))) {
      throw Error(key === 'baselineTicks' ? 'Chart baselines must be signed whole price ticks within the supported range.' :
        'Chart sizes must be positive whole price ticks within the supported range.')
    }
    result[key] = Object.fromEntries(entries)
  }
  for (const key of intervalSettings) {
    if (!keys.includes(key)) continue
    const settings = value[key]
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid chart interval settings.')
    const entries = Object.entries(settings)
    if (!entries.length || entries.some(([pane, seconds]) =>
      (pane !== 'primary' && pane !== 'comparison') || !validChartIntervalSeconds(seconds))) {
      throw Error('Chart intervals must be positive whole seconds within the supported range.')
    }
    result[key] = Object.fromEntries(entries)
  }
  if (keys.includes('rebaseTimes')) {
    const settings = value.rebaseTimes
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw Error('Invalid rebased chart anchors.')
    const entries = Object.entries(settings)
    if (!entries.length || entries.some(([pane, time]) =>
      (pane !== 'primary' && pane !== 'comparison') || !validAnnotationAnchor('time', time))) {
      throw Error('Rebased chart anchors must be whole UTC seconds in the supported date range.')
    }
    result.rebaseTimes = Object.fromEntries(entries)
  }
  return result
}

export function validChartIntervalSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CHART_INTERVAL_SECONDS
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

export async function parseProviderHistoryFixture(text: string, filename: string, verificationKey?: string): Promise<{
  item: SavedImport; metadata: SeriesMetadata
}> {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw Error('Choose a valid JSON provider history fixture.')
  }
  const version = payload && typeof payload === 'object' && 'version' in payload
    ? payload.version : undefined
  if (version !== 1 && version !== 2 && version !== 3)
    throw Error('This provider history fixture format or version is unsupported.')
  fields(payload, [
    'format', 'version', 'provider', 'venue', 'symbol',
    'barInterval', 'grant', 'adjustmentPolicy', 'permissions', 'csv',
    ...(version >= 2 ? ['csvSha256'] : []),
    ...(version === 3 ? ['signature'] : []),
  ], 'provider history fixture')
  if (payload.format !== 'marketweft-provider-history')
    throw Error('This provider history fixture format or version is unsupported.')
  if (version === 3 && verificationKey === undefined)
    throw Error('Choose the provider verification public key for this signed fixture.')
  if (version < 3 && verificationKey !== undefined)
    throw Error('A provider verification key requires a signed version 3 fixture.')
  const provider = payload.provider
  if (!validProvider(provider))
    throw Error('Supply a lowercase provider identifier.')
  const permissions = sourceRights(payload.permissions)
  if (!permissions.expiresOn)
    throw Error('A provider history fixture requires a UTC grant expiration date.')
  if (permissions.display !== 'granted' || permissions.storage !== 'granted')
    throw Error('A provider history fixture requires granted display and storage permissions.')
  const csv = requiredText(payload.csv, 'OHLCV CSV')
  let providerVerification: ProviderVerification | undefined
  if (version >= 2) {
    const csvSha256 = payload.csvSha256
    if (!isSha256(csvSha256))
      throw Error('Supply the provider CSV SHA-256 as 64 lowercase hexadecimal characters.')
    if (!globalThis.crypto?.subtle)
      throw Error('Provider CSV verification needs HTTPS or localhost.')
    if (await sha256Text(csv) !== csvSha256)
      throw Error('The provider CSV SHA-256 does not match the fixture.')
    if (verificationKey !== undefined) {
      const manifest = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'csv' && key !== 'signature'))
      const keySha256 = await verifyProviderSignature(verificationKey, provider, payload.signature, manifest)
      providerVerification = { keySha256, csvSha256 }
    }
  }
  if (sourcePermissionRestriction(permissions, 'display') === 'expired')
    throw Error('The provider history fixture grant has expired.')
  return {
    item: {
      venue: requiredText(payload.venue, 'venue'),
      symbol: requiredText(payload.symbol, 'symbol'),
      filename,
      csv,
    },
    metadata: {
      source: provider,
      usageGrant: requiredText(payload.grant, 'provider grant'),
      barInterval: requiredText(payload.barInterval, 'bar interval'),
      adjustmentPolicy: requiredText(payload.adjustmentPolicy, 'adjustment policy'),
      sourceRights: permissions,
      ...(providerVerification ? { providerVerification } : {}),
    },
  }
}

export async function parseSignedProviderRevisionFixture(
  text: string, verificationKey: string, core: MarketCore,
): Promise<SignedProviderRevisionFixture> {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw Error('Choose a valid JSON provider revision fixture.')
  }
  fields(payload, [
    'format', 'version', 'provider', 'venue', 'symbol',
    'grant', 'permissions', 'csvSha256', 'csv', 'signature',
  ], 'provider revision fixture')
  if (payload.format !== 'marketweft-provider-revisions' || payload.version !== 1)
    throw Error('This provider revision fixture format or version is unsupported.')
  const { provider, csvSha256 } = payload
  if (!validProvider(provider))
    throw Error('Supply a lowercase provider identifier.')
  const venue = requiredText(payload.venue, 'venue')
  const symbol = requiredText(payload.symbol, 'symbol')
  const instrument = core.instrument(venue, symbol)
  if (instrument !== venue + ':' + symbol)
    throw Error('Use a canonical venue and symbol for the provider revision fixture.')
  const grant = requiredText(payload.grant, 'provider grant')
  const permissions = sourceRights(payload.permissions)
  if (!permissions.expiresOn)
    throw Error('A provider revision fixture requires a UTC grant expiration date.')
  if (permissions.display !== 'granted')
    throw Error('A provider revision fixture requires granted display permission.')
  const csv = requiredText(payload.csv, 'provider revisions CSV')
  if (!isSha256(csvSha256))
    throw Error('Supply the provider CSV SHA-256 as 64 lowercase hexadecimal characters.')
  if (!globalThis.crypto?.subtle)
    throw Error('Provider CSV verification needs HTTPS or localhost.')
  if (await sha256Text(csv) !== csvSha256)
    throw Error('The provider CSV SHA-256 does not match the fixture.')
  const manifest = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'csv' && key !== 'signature'))
  const keySha256 = await verifyProviderSignature(verificationKey, provider, payload.signature, manifest)
  if (sourcePermissionRestriction(permissions, 'display') === 'expired')
    throw Error('The provider revision fixture grant has expired.')
  return { provider, instrument, grant, permissions: { ...permissions, expiresOn: permissions.expiresOn },
    csv, csvSha256, keySha256 }
}

function descriptor(value: unknown, core: MarketCore): SeriesDescriptor {
  const hasRights = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'sourceRights'))
  const hasVerification = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'providerVerification'))
  const version = hasVerification ? 3 : hasRights ? 2 : 1
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
      ...(hasVerification ? ['providerVerification'] : []),
    ],
    'series descriptor',
  )
  const venue = requiredText(value.venue, 'venue')
  const symbol = requiredText(value.symbol, 'symbol')
  if (
    value.version !== version || (hasVerification && !hasRights) ||
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
  if (!hasVerification) return { version: 2, ...provenance, sourceRights: rights }
  const verified = value.providerVerification
  fields(verified, ['keySha256', 'csvSha256'], 'provider verification')
  if (!validProvider(provenance.source) || !isSha256(verified.keySha256) || !isSha256(verified.csvSha256))
    throw Error('Invalid verified provider identifier or SHA-256 digest.')
  return {
    version: 3, ...provenance, sourceRights: rights,
    providerVerification: { keySha256: verified.keySha256, csvSha256: verified.csvSha256 },
  }
}

export function createHistory(
  core: MarketCore,
  item: SavedImport,
  metadata: Partial<SeriesMetadata> = {},
): History {
  const id = core.instrument(item.venue, item.symbol)
  const [venue, symbol] = id.split(':')
  const { sourceRights, providerVerification, ...details } = metadata
  const desc = descriptor(
    {
      version: providerVerification ? 3 : sourceRights ? 2 : 1,
      venue,
      symbol,
      source: item.filename.trim() ? item.filename : 'unspecified',
      barInterval: 'unspecified',
      usageGrant: 'unspecified',
      adjustmentPolicy: 'unspecified',
      ...details,
      ...(sourceRights ? { sourceRights } : {}),
      ...(providerVerification ? { providerVerification } : {}),
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
