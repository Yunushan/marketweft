import { observationGrantKey, requireObservationAccess } from './crossing-alert-export'
import type { CrossingAlert, ObservationGrant } from './crossing-alert-export'
import type { PatternAlert } from './pattern-alert'

export type AlertInboxRecord = CrossingAlert | PatternAlert

const DB_NAME = 'marketweft.alert-inbox'
const STORE = 'notifications'
const GRANTS = 'observation-grants'
const RECENT_LIMIT = 100

function openInbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    let blocked = false
    request.onupgradeneeded = event => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
          .createIndex('observed', 'current.observedAt')
      }
      if (event.oldVersion < 2)
        request.result.createObjectStore(GRANTS, { keyPath: ['provider', 'grant', 'digest'] })
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open the alert inbox.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('The alert inbox is blocked by another tab.'))
    }
  })
}

function evidence(record: AlertInboxRecord) {
  const { source: _source, ...original } = record
  return original
}

function sameRecord(a: AlertInboxRecord, b: AlertInboxRecord) {
  return JSON.stringify(evidence(a)) === JSON.stringify(evidence(b))
}

export async function saveAlerts(records: readonly AlertInboxRecord[]): Promise<number> {
  const distinct = new Map<string, AlertInboxRecord>()
  for (const record of records) {
    const previous = distinct.get(record.id)
    if (previous && !sameRecord(previous, record)) throw Error('Conflicting alert ' + record.id + '.')
    distinct.set(record.id, record)
  }
  if (distinct.size === 0) return 0
  for (const delay of [50, 150]) {
    try {
      return await writeAlerts(distinct)
    } catch (cause) {
      if (!(cause instanceof DOMException) || cause.name !== 'AbortError') throw cause
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return writeAlerts(distinct)
}

async function writeAlerts(distinct: ReadonlyMap<string, AlertInboxRecord>): Promise<number> {
  const db = await openInbox()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, GRANTS], 'readwrite', { durability: 'strict' })
      const store = tx.objectStore(STORE)
      const grants = tx.objectStore(GRANTS)
      let inserted = 0
      let conflict: Error | null = null
      tx.oncomplete = () => resolve(inserted)
      tx.onabort = () => reject(conflict ?? tx.error ?? new DOMException('The alert batch was interrupted.', 'AbortError'))
      const checked = new Set<string>()
      for (const record of distinct.values()) {
        if (!('type' in record) && record.source?.kind === 'observations') {
          const grant = record.source.grant
          const key = observationGrantKey(grant)
          const revision = JSON.stringify([...key, grant.revision])
          if (!checked.has(revision)) {
            checked.add(revision)
            const status = grants.get(key) as IDBRequest<ObservationGrant | undefined>
            status.onsuccess = () => {
              try {
                requireObservationAccess(grant, status.result, 'automatedUse')
                requireObservationAccess(grant, status.result, 'storage')
              } catch (cause) {
                conflict = cause instanceof Error ? cause : Error('Could not verify observation storage permission.')
                tx.abort()
              }
            }
          }
        }
        const lookup = store.get(record.id) as IDBRequest<AlertInboxRecord | undefined>
        lookup.onsuccess = () => {
          if (lookup.result === undefined) {
            store.add(record).onsuccess = () => { inserted += 1 }
          } else if (!sameRecord(lookup.result, record)) {
            conflict = new Error('Saved alert ' + record.id + ' has different evidence. Use a new source or revision ID.')
            tx.abort()
          }
        }
      }
    })
  } finally {
    db.close()
  }
}

export async function updateObservationGrant(grant: ObservationGrant): Promise<void> {
  const db = await openInbox()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(GRANTS, 'readwrite', { durability: 'strict' })
      const grants = tx.objectStore(GRANTS)
      const lookup = grants.get(observationGrantKey(grant)) as IDBRequest<ObservationGrant | undefined>
      let conflict: Error | null = null
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(conflict ?? tx.error ?? Error('Could not update the observation source grant.'))
      lookup.onsuccess = () => {
        const current = lookup.result
        if (current && grant.revision <= current.revision) {
          if (grant.revision === current.revision && JSON.stringify(grant.rights) === JSON.stringify(current.rights)) return
          conflict = Error('The observation grant revision is stale or conflicts with the current revision.')
          tx.abort()
          return
        }
        grants.put(grant)
      }
    })
  } finally {
    db.close()
  }
}

export async function readObservationGrant(grant: ObservationGrant): Promise<ObservationGrant | undefined> {
  const db = await openInbox()
  try {
    return await new Promise((resolve, reject) => {
      const lookup = db.transaction(GRANTS, 'readonly').objectStore(GRANTS)
        .get(observationGrantKey(grant)) as IDBRequest<ObservationGrant | undefined>
      lookup.onsuccess = () => resolve(lookup.result)
      lookup.onerror = () => reject(lookup.error ?? Error('Could not read the observation source grant.'))
    })
  } finally {
    db.close()
  }
}

export async function readAlertInbox(): Promise<{ total: number; recent: AlertInboxRecord[] }> {
  const db = await openInbox()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const total = store.count()
      const recent: AlertInboxRecord[] = []
      const request = store.index('observed').openCursor(null, 'prev')
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        recent.push(cursor.value as AlertInboxRecord)
        if (recent.length < RECENT_LIMIT) cursor.continue()
      }
      tx.oncomplete = () => resolve({ total: total.result, recent })
      tx.onabort = () => reject(tx.error ?? new Error('Could not read the alert inbox.'))
    })
  } finally {
    db.close()
  }
}
