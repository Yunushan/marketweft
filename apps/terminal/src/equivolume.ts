import type { Bar } from './market-core'

export function volumeOffsets(bars: readonly Bar[]): bigint[] {
  const offsets = [0n]
  let total = 0n
  for (const bar of bars) {
    total += BigInt(Math.round(bar.volume * 1e6))
    offsets.push(total)
  }
  return offsets
}

export function equivolumeLayout(offsets: readonly bigint[], first: number, end: number, left: number, right: number) {
  const origin = offsets[first]
  const volume = Number(offsets[end] - origin)
  const width = right - left
  const edge = volume === 0
    ? (index: number) => left + (index - first) / (end - first) * width
    : (index: number) => left + Number(offsets[index] - origin) / volume * width
  const centerAt = (index: number) => (edge(index) + edge(index + 1)) / 2
  const center = (index: number) => {
    const prior = Math.floor(index)
    const at = centerAt(prior)
    return prior === index ? at : at + (centerAt(prior + 1) - at) * (index - prior)
  }
  const barAt = (x: number) => {
    let low = first
    let high = end - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      const next = edge(middle + 1)
      if (next < x || (next === x && x < right)) low = middle + 1
      else high = middle
    }
    return low
  }
  return { edge, center, barAt }
}
