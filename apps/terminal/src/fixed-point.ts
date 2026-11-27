export const MAX_CHART_PRICE_TICKS = 2_000_000_000_000_000

export function fixed(value: bigint, places: number): string {
  const magnitude = (value < 0n ? -value : value).toString().padStart(places + 1, '0')
  const decimals = magnitude.slice(-places).replace(/0+$/, '')
  return (value < 0n ? '-' : '') + magnitude.slice(0, -places) +
    (decimals ? '.' + decimals : '')
}

export function tickPrice(ticks: bigint) {
  return Number(ticks) / 1e6
}

export function parsePriceSize(value: string): bigint | null {
  const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim())
  if (!parts) return null
  return BigInt(parts[1]) * 1_000_000n + BigInt((parts[2] ?? '').padEnd(6, '0'))
}
