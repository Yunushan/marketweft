import type { DepthStatus } from './market-core'

export function depthStatusText(status: DepthStatus) {
  switch (status.kind) {
    case 'no-observation': return 'No frames observed by this cutoff.'
    case 'awaiting-snapshot': return 'Waiting for the first complete snapshot.'
    case 'synchronized': return 'Synchronized'
    case 'sequence-gap':
      return 'Sequence gap. Expected ' + status.expected + ', received ' + status.received + '. Waiting for a new snapshot.'
    case 'crossed':
      return 'Crossed order book at sequence ' + status.sequence + '. Waiting for a new snapshot.'
  }
}
