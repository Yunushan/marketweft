import { canonicalJson } from './canonical-json'
import { sourcePermissionRestriction } from './catalog-schema'
import type { History, SourceRights } from './catalog-schema'
import type { PatternAlert } from './pattern-alert'
import { sha256Text } from './sha256'
import { utc } from './workspace'

export type PatternAlertSource =
  | { kind: 'fixture' }
  | { kind: 'history'; digest: string; rights?: SourceRights }

async function historyDigest(history: History) {
  const { sourceRights: _rights, ...descriptor } = history.descriptor
  return sha256Text(canonicalJson({ id: history.id, csv: history.csv, descriptor }, 'Invalid alert source.'))
}

export async function patternAlertSource(history: History): Promise<PatternAlertSource> {
  const rights = history.descriptor.sourceRights
  return { kind: 'history', digest: await historyDigest(history), ...(rights ? { rights } : {}) }
}

function checkRedistribution(rights: SourceRights | undefined) {
  const restriction = sourcePermissionRestriction(rights, 'redistribution')
  if (restriction === 'expired') throw Error('The source grant has expired.')
  if (!rights || restriction === 'permission')
    throw Error('Exporting pattern alerts requires granted redistribution permission.')
}

export async function patternAlertEvent(
  alert: PatternAlert,
  readHistory: (id: string) => Promise<History | undefined>,
): Promise<string> {
  const source = alert.source
  if (!source) throw Error('This alert has no recorded source grant.')
  if (source.kind === 'history') {
    checkRedistribution(source.rights)
    const history = await readHistory(alert.rule.series)
    if (!history || await historyDigest(history) !== source.digest)
      throw Error('The source history no longer matches this alert.')
    checkRedistribution(history.descriptor.sourceRights)
  }
  return JSON.stringify({
    id: alert.id,
    kind: 'candlestick',
    observed_at: utc(alert.current.observedAt),
    data: {
      rule: alert.rule,
      current: alert.current,
      ...(alert.previous ? { previous: alert.previous } : {}),
      ...(alert.first ? { first: alert.first } : {}),
    },
  }, null, 2) + '\n'
}
