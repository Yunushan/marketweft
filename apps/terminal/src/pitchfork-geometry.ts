import type { DrawingEndpoint } from './market-core'

export type PitchforkKind = 'pitchfork' | 'schiff-pitchfork' | 'modified-schiff-pitchfork'

export function pitchforkOrigin(kind: PitchforkKind, first: DrawingEndpoint, second: DrawingEndpoint): DrawingEndpoint {
  if (kind === 'pitchfork') return first
  return {
    time: kind === 'modified-schiff-pitchfork' ? (first.time + second.time) / 2 : first.time,
    ticks: (first.ticks + second.ticks) / 2,
  }
}
