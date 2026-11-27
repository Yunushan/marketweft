import type { AlertCrossing } from './market-core'
import { sourcePermissionRestriction, sourceRights } from './catalog-schema'
import type { SourceRight, SourceRights } from './catalog-schema'
import { validProvider } from './provider-signature'
import { isSha256 } from './sha256'
import { utc } from './workspace'

export type ObservationGrant = {
  provider: string
  grant: string
  digest: string
  revision: number
  rights: SourceRights
}

export type CrossingAlertSource =
  | { kind: 'fixture' }
  | { kind: 'observations'; grant: ObservationGrant }

export type CrossingAlert = AlertCrossing & { source?: CrossingAlertSource }

export async function readObservationGrantFile(file: File): Promise<ObservationGrant> {
  if (file.size > 16 * 1024) throw Error('The observation source grant exceeds 16 KiB.')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Supply an observation source grant JSON object.')
  const { format, version, provider, grant, observation_sha256: digest, revision, rights } = value as Record<string, unknown>
  if (format !== 'marketweft-observation-grant' || version !== 1) throw Error('Use a version 1 MarketWeft observation source grant.')
  if (!validProvider(provider) || typeof grant !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(grant))
    throw Error('Supply a valid provider and grant reference.')
  if (!isSha256(digest)) throw Error('Supply the observation CSV SHA-256 as 64 lowercase hexadecimal characters.')
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)
    throw Error('Use a positive integer observation grant revision.')
  return { provider, grant, digest, revision, rights: sourceRights(rights) }
}

export function observationGrantKey(grant: ObservationGrant) {
  return [grant.provider, grant.grant, grant.digest]
}

const actions: Record<SourceRight, string> = {
  display: 'display permission', storage: 'storage permission',
  redistribution: 'redistribution permission', automatedUse: 'automated-use permission',
}

export function requireObservationAccess(
  recorded: ObservationGrant, current: ObservationGrant | undefined, right: SourceRight,
) {
  if (!current) throw Error('The current observation source grant is unavailable.')
  for (const grant of [recorded, current]) {
    const restriction = sourcePermissionRestriction(grant.rights, right)
    if (restriction === 'expired') throw Error('The observation source grant has expired.')
    if (restriction === 'permission') throw Error('Crossing alerts require granted ' + actions[right] + '.')
  }
}

export async function crossingAlertEvent(
  alert: CrossingAlert,
  readGrant: (grant: ObservationGrant) => Promise<ObservationGrant | undefined>,
): Promise<string> {
  const source = alert.source
  if (!source) throw Error('This crossing alert has no recorded observation source grant.')
  if (source.kind === 'observations')
    requireObservationAccess(source.grant, await readGrant(source.grant), 'redistribution')
  return JSON.stringify({
    id: ['crossing', alert.rule.id, alert.rule.revision, alert.current.id].join(':'),
    kind: alert.rule.kind + '-crossing',
    observed_at: utc(alert.current.observedAt),
    data: {
      alert_id: alert.id, rule: alert.rule, direction: alert.direction,
      previous: alert.previous, current: alert.current,
    },
  }, null, 2) + '\n'
}
