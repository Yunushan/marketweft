import {
  createHistory,
  historyAndAsset,
  materialize,
  preferences,
  type CatalogData,
  type CatalogSnapshot,
  type History,
  type Preferences,
} from './catalog-schema'
import type { MarketCore } from './market-core'
import { KEY, readLegacyWorkspace, sampleAssets, type Asset } from './workspace'

export * from './catalog-schema'

const DB_NAME = 'marketweft.catalog'
const ACTIVE = 'active'
const SIGNAL = 'marketweft.catalog.changed'
type Head = {
  schemaVersion: 2
  revision: number
  preferences: Preferences
  importIds: string[]
  legacyFingerprint: string | null
  warning?: string
}
type Stored = { head: Head; series: History[] }

export class CatalogConflictError extends Error {
  constructor() {
    super(
      'The saved workspace changed in another tab. Review the latest workspace and try again.',
    )
    this.name = 'CatalogConflictError'
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    let blocked = false
    request.onblocked = () => {
      blocked = true
      reject(
        Error(
          'Close other MarketWeft tabs to finish opening the historical catalog, then try again.',
        ),
      )
    }
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (blocked) {
        request.transaction?.abort()
        return
      }
      request.result.createObjectStore('workspace')
      request.result.createObjectStore('series', { keyPath: 'id' })
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
  })
}

type Transaction<T> = {
  tx: IDBTransaction
  after<V>(request: IDBRequest<V>, use: (value: V) => void): void
  result(value: T): void
}

// Schedule dependent requests in IDB event handlers. In particular, waiting
// for file reads, promises from Web Crypto, or timers here can auto-commit a transaction.
function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  start: (context: Transaction<T>) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['workspace', 'series'], mode, {
      durability: 'strict',
    })
    let value: T
    let failure: unknown
    function guard(action: () => void) {
      try {
        action()
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(value)
    tx.onabort = () => {
      const reason = failure ?? tx.error
      reject(
        reason instanceof DOMException && reason.name === 'QuotaExceededError'
          ? Error(
              'Browser storage quota was exceeded. The previous workspace was preserved.',
            )
          : (reason ??
              Error(
                'The historical storage transaction was interrupted. The previous workspace was preserved.',
              )),
      )
    }
    guard(() =>
      start({
        tx,
        after(request, use) {
          request.onsuccess = () => guard(() => use(request.result))
        },
        result(next) {
          value = next
        },
      }),
    )
  })
}

function digestShape(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function requireHead(value: Head | undefined): Head {
  if (
    !value ||
    value.schemaVersion !== 2 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !Array.isArray(value.importIds) ||
    value.importIds.some((id) => typeof id !== 'string') ||
    new Set(value.importIds).size !== value.importIds.length ||
    !(
      value.legacyFingerprint === null || digestShape(value.legacyFingerprint)
    ) ||
    (value.warning !== undefined && typeof value.warning !== 'string')
  ) {
    throw Error(
      'Invalid or unsupported historical catalog. Existing data was preserved.',
    )
  }
  return value
}

function collect<T>(context: Transaction<T>, use: (stored?: Stored) => void) {
  const { tx, after } = context
  const heads = tx.objectStore('workspace')
  after(heads.get(ACTIVE), (active: Head | undefined) => {
    after(heads.count(), (count) => {
      if (count !== (active === undefined ? 0 : 1))
        throw Error('Unexpected workspace records in the historical catalog.')
      after(tx.objectStore('series').getAll(), (rows: History[]) => {
        if (active === undefined) {
          if (rows.length)
            throw Error(
              'Historical series exist without a workspace record. Existing data was preserved.',
            )
          use()
          return
        }
        const head = requireHead(active)
        const byId = new Map(rows.map((row) => [row.id, row]))
        if (
          byId.size !== head.importIds.length ||
          !head.importIds.every((id) => byId.has(id))
        ) {
          throw Error(
            'Historical series and workspace identifiers do not match. Existing data was preserved.',
          )
        }
        use({ head, series: head.importIds.map((id) => byId.get(id)!) })
      })
    })
  })
}

function verifyReadback(
  stored: Stored | undefined,
  head: Head,
  series: History[],
) {
  if (
    !stored ||
    JSON.stringify(stored.head) !== JSON.stringify(head) ||
    stored.series.length !== series.length
  ) {
    throw Error('Historical workspace read-back verification failed.')
  }
  for (let i = 0; i < series.length; i++) {
    const wanted = series[i],
      actual = stored.series[i]
    if (
      wanted.id !== actual.id ||
      wanted.csv !== actual.csv ||
      wanted.barCount !== actual.barCount ||
      JSON.stringify(wanted.descriptor) !== JSON.stringify(actual.descriptor)
    ) {
      throw Error(
        'Historical series read-back verification failed for ' +
          wanted.id +
          '.',
      )
    }
  }
}

function replace<T>(
  context: Transaction<T>,
  head: Head,
  series: History[],
  done: () => void,
) {
  const rows = context.tx.objectStore('series')
  rows.clear()
  for (const record of series) rows.add(record)
  context.tx.objectStore('workspace').put(head, ACTIVE)
  collect(context, (stored) => {
    verifyReadback(stored, head, series)
    done()
  })
}

function readLegacy(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    throw Error(
      'Cannot read the previous workspace from browser storage. Access is required to migrate safely.',
    )
  }
}

async function fingerprint(raw: string | null): Promise<string | null> {
  if (raw === null) return null
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  )
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('')
}

export class Catalog {
  private channel?: BroadcastChannel
  private listeners = new Set<() => void>()
  private legacyCache?: { raw: string | null; digest: string | null }
  private samples: Asset[]
  private current?: CatalogSnapshot

  constructor(
    private db: IDBDatabase,
    private core: MarketCore,
  ) {
    this.samples = sampleAssets(core)
    try {
      this.channel = new BroadcastChannel(SIGNAL)
    } catch {
      /* Storage events provide the fallback. */
    }
    if (this.channel) this.channel.onmessage = this.refresh
    window.addEventListener('storage', this.onStorage)
    window.addEventListener('focus', this.refresh)
    db.onversionchange = () => {
      db.close()
      this.refresh()
    }
  }

  private refresh = () => {
    this.listeners.forEach((listener) => listener())
  }
  private onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === SIGNAL || event.key === null)
      this.refresh()
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  close() {
    this.listeners.clear()
    window.removeEventListener('storage', this.onStorage)
    window.removeEventListener('focus', this.refresh)
    this.channel?.close()
    this.db.close()
  }

  private stored() {
    return transact<Stored | undefined>(this.db, 'readonly', (context) =>
      collect(context, context.result),
    )
  }
  private async remember(
    head: Head,
    data: CatalogData & { assets: Asset[] },
  ): Promise<CatalogSnapshot> {
    let warning = head.warning
    try {
      const raw = readLegacy()
      if (raw !== this.legacyCache?.raw)
        this.legacyCache = { raw, digest: await fingerprint(raw) }
      if (this.legacyCache?.digest !== head.legacyFingerprint) {
        warning =
          'The old workspace changed after migration. Its original storage is preserved. The catalog shows the committed version.'
      }
    } catch {
      warning =
        warning ??
        'The historical catalog is open. The legacy workspace could not be checked.'
    }
    const snapshot = { ...data, revision: head.revision, warning }
    // An earlier read can finish hashing its legacy source after a newer one.
    if (!this.current || this.current.revision <= head.revision)
      this.current = snapshot
    return this.current
  }
  private snapshot({ head, series }: Stored) {
    return this.remember(
      head,
      materialize(
        this.core,
        { preferences: head.preferences, series },
        this.samples,
      ),
    )
  }
  async read(): Promise<CatalogSnapshot> {
    const stored = await this.stored()
    if (!stored)
      throw Error(
        'The historical workspace is missing. Reload to reopen the catalog.',
      )
    return this.snapshot(stored)
  }

  async initialize(): Promise<CatalogSnapshot> {
    const existing = await this.stored()
    if (existing) return this.snapshot(existing)
    const raw = readLegacy()
    const { workspace, warning } = readLegacyWorkspace(
      this.core,
      this.samples,
      raw,
    )
    const { selected, watchlist, sma, ema } = workspace
    const data = materialize(
      this.core,
      {
        preferences: { selected, watchlist, sma, ema },
        series: workspace.imports.map((item) => createHistory(this.core, item)),
      },
      this.samples,
    )
    const digest = await fingerprint(raw)
    this.legacyCache = { raw, digest }
    const head: Head = {
      schemaVersion: 2,
      revision: 1,
      preferences: data.preferences,
      importIds: data.series.map((s) => s.id),
      legacyFingerprint: digest,
      warning,
    }
    // The write lock serializes first opens. Another tab may already have finished migration.
    const installed = await transact<boolean>(this.db, 'readwrite', (context) =>
      collect(context, (current) => {
        if (current) {
          context.result(false)
          return
        }
        const unchanged = () => {
          if (readLegacy() !== raw)
            throw Error(
              'The legacy workspace changed during migration. Retry after closing the old tab.',
            )
        }
        unchanged()
        replace(context, head, data.series, () => {
          unchanged()
          context.result(true)
        })
      }),
    )
    const durable = await this.stored()
    if (!durable) throw Error('The migrated workspace could not be read back.')
    if (installed && durable.head.revision === head.revision)
      verifyReadback(durable, head, data.series)
    return this.snapshot(durable)
  }

  private async commit(
    expected: number,
    write: (context: Transaction<void>, head: Head) => void,
    preferencesOnly = false,
  ): Promise<CatalogSnapshot> {
    let committed!: Head
    await transact<void>(this.db, 'readwrite', (context) => {
      context.after(
        context.tx.objectStore('workspace').get(ACTIVE),
        (result) => {
          const head = requireHead(result)
          if (head.revision !== expected) throw new CatalogConflictError()
          if (!Number.isSafeInteger(head.revision + 1))
            throw Error('Historical workspace revision limit reached.')
          committed = {
            ...head,
            revision: head.revision + 1,
            warning: undefined,
          }
          write(context, committed)
        },
      )
    })
    // Notification is best effort. Every write enforces the revision inside the transaction.
    try {
      if (this.channel) this.channel.postMessage(expected + 1)
      else localStorage.setItem(SIGNAL, String(expected + 1))
    } catch {
      /* Focus refresh still discovers commits. */
    }
    if (preferencesOnly && this.current?.revision === expected) {
      // The successful revision check proves these series were present at the
      // start of the write. Selecting a ticker never rereads or reparses its history.
      return this.remember(committed, {
        preferences: committed.preferences,
        series: this.current.series,
        assets: this.current.assets,
      })
    }
    return this.read()
  }

  savePreferences(expected: number, next: Preferences) {
    return this.commit(
      expected,
      ({ tx }, head) => {
        const ids = new Set([
          ...this.samples.map((a) => a.id),
          ...head.importIds,
        ])
        head.preferences = preferences(this.core, next, ids)
        tx.objectStore('workspace').put(head, ACTIVE)
      },
      true,
    )
  }
  addSeries(expected: number, value: History) {
    const { history } = historyAndAsset(this.core, value)
    return this.commit(expected, ({ tx }, head) => {
      if (
        this.samples.some((a) => a.id === history.id) ||
        head.importIds.includes(history.id)
      ) {
        throw Error(
          'This venue and symbol already exist. Use a different identity.',
        )
      }
      head.importIds = [...head.importIds, history.id]
      head.preferences = {
        ...head.preferences,
        selected: history.id,
        watchlist: [...head.preferences.watchlist, history.id],
      }
      tx.objectStore('series').add(history)
      tx.objectStore('workspace').put(head, ACTIVE)
    })
  }
  restore(expected: number, value: CatalogData) {
    const data = materialize(this.core, value, this.samples)
    return this.commit(expected, (context, head) => {
      head.preferences = data.preferences
      head.importIds = data.series.map((s) => s.id)
      replace(context, head, data.series, () => context.result())
    })
  }
}

export async function openCatalog(core: MarketCore) {
  const db = await openDatabase()
  const catalog = new Catalog(db, core)
  try {
    return { catalog, snapshot: await catalog.initialize() }
  } catch (error) {
    catalog.close()
    throw error
  }
}
