export function fixed(value: bigint, places: number): string {
  const magnitude = (value < 0n ? -value : value).toString().padStart(places + 1, '0')
  const decimals = magnitude.slice(-places).replace(/0+$/, '')
  return (value < 0n ? '-' : '') + magnitude.slice(0, -places) +
    (decimals ? '.' + decimals : '')
}

export function tickPrice(ticks: bigint) {
  return Number(ticks) / 1e6
}
