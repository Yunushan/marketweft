import { useRef, useState } from 'react'
import { exportWorkspace, verifyWorkspaceBackup } from './backup'
import type { Catalog, CatalogData, CatalogSnapshot } from './catalog'
import type { MarketCore } from './market-core'
import type { Asset } from './workspace'
import { Icon } from './Icons'
import { downloadFile } from './download'

type Preview = { data: CatalogData; revision: number }

export function WorkspaceBackup({
  core,
  samples,
  catalog,
  snapshot,
  restore,
}: {
  core: MarketCore
  samples: Asset[]
  catalog: Catalog
  snapshot: CatalogSnapshot
  restore: (revision: number, data: CatalogData) => Promise<void>
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'verify' | 'export' | 'restore' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attempt = useRef(0)

  async function download() {
    setBusy('export')
    setError('')
    setMessage('')
    try {
      const text = await exportWorkspace(await catalog.read(), samples)
      const name = 'marketweft-workspace-' + new Date().toISOString().slice(0, 10) + '.marketweft.json'
      const android = window as Window & { __MARKETWEFT_ANDROID_WORKSPACE_BACKUP__?: boolean }
      if (android.__MARKETWEFT_ANDROID_WORKSPACE_BACKUP__) {
        const { invoke } = await import('@tauri-apps/api/core')
        const { saved } = await invoke<{ saved: boolean }>('plugin:workspace-backup|save', { filename: name, contents: text })
        setMessage(saved ? 'Workspace backup saved.' : 'Workspace backup export cancelled.')
        return
      }
      downloadFile(name, new Blob([text], { type: 'application/json' }))
      setMessage('Workspace backup prepared for download.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : typeof cause === 'string' ? cause : 'Could not export the workspace.',
      )
    } finally {
      setBusy(null)
    }
  }

  async function inspect(file: File | undefined) {
    const token = ++attempt.current
    const revision = snapshot.revision
    setPreview(null)
    setError('')
    setMessage('')
    if (!file) {
      setBusy(null)
      return
    }
    setBusy('verify')
    try {
      const data = await verifyWorkspaceBackup(core, samples, await file.text())
      if (token === attempt.current) setPreview({ data, revision })
    } catch (cause) {
      if (token === attempt.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not verify the backup.',
        )
    } finally {
      if (token === attempt.current) setBusy(null)
    }
  }

  async function confirm() {
    if (!preview || busy) return
    setBusy('restore')
    setError('')
    try {
      await restore(preview.revision, preview.data)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not restore the workspace.',
      )
    } finally {
      setBusy(null)
    }
  }

  const stale = preview !== null && preview.revision !== snapshot.revision
  return (
    <div className="backup-panel">
      <p className="intro">
        Save your imported histories, watchlist and indicators in one file.
      </p>
      <button
        type="button"
        className="outline"
        disabled={busy !== null}
        onClick={download}
      >
        {busy === 'export' ? 'Exporting…' : 'Export workspace'}
      </button>
      <h3>Restore a backup</h3>
      <label className="file-field">
        <Icon name="file" size={22} />
        <strong>Backup file</strong>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          disabled={busy === 'restore' || busy === 'export'}
          onClick={(event) => {
            ++attempt.current
            event.currentTarget.value = ''
            setPreview(null)
            setMessage('')
            setError('')
            setBusy(null)
          }}
          onChange={(event) => {
            void inspect(event.currentTarget.files?.[0])
          }}
        />
      </label>
      {busy === 'verify' && (
        <p role="status" className="intro">
          Verifying the file and its histories…
        </p>
      )}
      {preview && (
        <>
          <dl className="backup-summary">
            <div>
              <dt>Imported series</dt>
              <dd>{preview.data.series.length.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Historical bars</dt>
              <dd>
                {preview.data.series
                  .reduce((n, s) => n + s.barCount, 0)
                  .toLocaleString('en-US')}
              </dd>
            </div>
            <div>
              <dt>Watchlist</dt>
              <dd>
                {preview.data.preferences.watchlist.length.toLocaleString(
                  'en-US',
                )}
              </dd>
            </div>
            <div>
              <dt>Selected</dt>
              <dd>{preview.data.preferences.selected}</dd>
            </div>
          </dl>
          <p className="intro" role="status">
            {stale
              ? 'The current workspace changed. Select the backup again to review it.'
              : 'Checksums verified. Restoring replaces all imported histories and settings in this workspace.'}
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="intro" role="status">
          {message}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="primary"
          disabled={!preview || stale || busy !== null}
          onClick={confirm}
        >
          {busy === 'restore' ? 'Restoring…' : 'Restore workspace'}
        </button>
      </div>
    </div>
  )
}
