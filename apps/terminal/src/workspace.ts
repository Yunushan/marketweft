import type { Bar, MarketCore } from './market-core'

export type Asset = {
  id: string
  symbol: string
  venue: string
  name: string
  source: 'sample' | 'import'
  bars: Bar[]
}
export type SavedImport = {
  venue: string
  symbol: string
  filename: string
  csv: string
}
export type Workspace = {
  version: 1
  selected: string
  watchlist: string[]
  imports: SavedImport[]
  sma: boolean
  ema: boolean
}
type Sample = [string, string, string, number, number]
const samples: Sample[] = [
  ['NASDAQ', 'NVDA', 'NVIDIA Corporation', 126, 17],
  ['NASDAQ', 'AAPL', 'Apple Inc.', 213, 202],
  ['NASDAQ', 'MSFT', 'Microsoft Corporation', 421, 39],
  ['NASDAQ', 'AMZN', 'Amazon.com Inc.', 199, 58],
  ['NASDAQ', 'TSLA', 'Tesla Inc.', 271, 42],
  ['NYSE', 'JPM', 'JPMorgan Chase & Co.', 228, 113],
  ['NASDAQ', 'AMD', 'Advanced Micro Devices', 165, 97],
  ['NYSE', 'DIS', 'The Walt Disney Company', 116, 346],
]
export const KEY = 'marketweft.workspace.v1'
const quoteFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})
const unitFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})
export const price = (n: number) => quoteFormat.format(n)
export const volume = (n: number) =>
  (Math.abs(n) < 1000 ? unitFormat : compactFormat).format(n)
export const dateLabel = (t: number) =>
  new Date(t * 1000).toISOString().slice(0, 10)
export function timeLabel(t: number) {
  const iso = new Date(t * 1000).toISOString()
  return iso.slice(0, 10) + (t % 86400 === 0 ? '' : ' ' + iso.slice(11, 19))
}
export function movement(bars: Bar[]) {
  if (bars.length < 2) return { delta: null, pct: null }
  const before = bars.at(-2)!.close
  const delta =
    (Math.round(bars.at(-1)!.close * 1e6) - Math.round(before * 1e6)) / 1e6
  return { delta, pct: before === 0 ? null : (delta / Math.abs(before)) * 100 }
}
export function changeString(n: number | null, suffix = '') {
  if (n === null) return '—'
  const value = Math.abs(n)
  const digits =
    value > 0 && value < 0.000001
      ? value.toExponential(1)
      : suffix === '%' && value >= 0.01
        ? value.toFixed(2)
        : price(value)
  return (n < 0 ? '−' : '+') + digits + suffix
}

function syntheticCsv(start: number, seed: number) {
  let state = seed
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const rows = ['time,open,high,low,close,volume']
  let close = start
  for (let i = 0; rows.length <= 180; i++) {
    const day = new Date(Date.UTC(2025, 0, 2 + i)),
      weekday = day.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    const open = close * (0.998 + random() * 0.004)
    close =
      open *
      (1.0009 + (random() - 0.5) * 0.029 + Math.sin(i / 12 + seed) * 0.002)
    const high = Math.max(open, close) * (1 + random() * 0.011)
    const low = Math.min(open, close) * (1 - random() * 0.01)
    const vol = Math.round((5 + random() * 24) * 1e6)
    rows.push(
      [
        day.toISOString().slice(0, 10),
        ...[open, high, low, close].map((x) => x.toFixed(2)),
        vol,
      ].join(','),
    )
  }
  return rows.join('\n')
}

export function sampleAssets(core: MarketCore): Asset[] {
  return samples.map(([venue, symbol, name, start, seed]) => ({
    venue,
    symbol,
    name,
    id: core.instrument(venue, symbol),
    source: 'sample',
    bars: core.parseCsv(syntheticCsv(start, seed)),
  }))
}
export function importedAsset(core: MarketCore, item: SavedImport): Asset {
  if (
    !item ||
    !['venue', 'symbol', 'filename', 'csv'].every(
      (k) => typeof item[k as keyof SavedImport] === 'string',
    )
  ) {
    throw Error('Invalid imported file record.')
  }
  const id = core.instrument(item.venue, item.symbol)
  const [venue, symbol] = id.split(':')
  const bars = core.parseCsv(item.csv)
  if (bars.length === 0) throw Error('The CSV contains no bars.')
  return { id, venue, symbol, name: item.filename, source: 'import', bars }
}

export function defaults(assets: Asset[]): Workspace {
  return {
    version: 1,
    selected: assets[0].id,
    watchlist: assets.slice(0, 6).map((a) => a.id),
    imports: [],
    sma: true,
    ema: false,
  }
}
type LegacyWorkspace = {
  workspace: Workspace
  warning?: string
}
export function readLegacyWorkspace(
  core: MarketCore,
  samples: Asset[],
  raw: string | null,
): LegacyWorkspace {
  const initial = defaults(samples)
  if (raw === null) return { workspace: initial }
  let state: Workspace
  try {
    state = JSON.parse(raw)
  } catch {
    return {
      workspace: initial,
      warning:
        'Saved workspace could not be read. The original stays in browser storage.',
    }
  }
  if (state?.version !== 1) {
    throw Error(
      'Unrecognized legacy workspace version. The original workspace has been preserved.',
    )
  }
  const imports: SavedImport[] = []
  const ids = new Set(samples.map((a) => a.id))
  let repaired =
    !Array.isArray(state.imports) || !Array.isArray(state.watchlist)
  for (const item of Array.isArray(state.imports) ? state.imports : []) {
    try {
      const asset = importedAsset(core, item)
      if (ids.has(asset.id)) {
        repaired = true
        continue
      }
      imports.push(item)
      ids.add(asset.id)
    } catch {
      repaired = true
    }
  }
  const storedList = Array.isArray(state.watchlist) ? state.watchlist : []
  let watchlist = [...new Set(storedList.filter((id) => ids.has(id)))]
  if (watchlist.length !== storedList.length || !watchlist.length)
    repaired = true
  if (!watchlist.length) watchlist = initial.watchlist
  const selected = watchlist.includes(state.selected)
    ? state.selected
    : watchlist[0]
  if (
    selected !== state.selected ||
    typeof state.ema !== 'boolean' ||
    typeof state.sma !== 'boolean'
  )
    repaired = true
  return {
    workspace: {
      version: 1,
      imports,
      watchlist,
      selected,
      ema: typeof state.ema === 'boolean' ? state.ema : initial.ema,
      sma: typeof state.sma === 'boolean' ? state.sma : initial.sma,
    },
    warning: repaired
      ? 'Recovered the readable parts of your workspace. The original stays in browser storage.'
      : undefined,
  }
}
