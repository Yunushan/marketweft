import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import type { MarketCore } from './market-core'
import { Chart, Spark } from './Chart'
import { Icon, Mark } from './Icons'
import {
  KEY,
  backupWorkspace,
  changeString,
  dateLabel,
  importedAsset,
  movement,
  price,
  readWorkspace,
  sampleAssets,
  volume,
} from './workspace'
import type { Asset, SavedImport, Workspace } from './workspace'
import { checkImportRows, type ImportPolicy } from './import-policy'

declare const __MARKETWEFT_IMPORT_POLICY__: ImportPolicy
const importPolicy = __MARKETWEFT_IMPORT_POLICY__

function Dialog({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.showModal()
    return () => el.close()
  }, [])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close()
        }
      }}
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-btn" onClick={close} aria-label="Close dialog">
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  )
}

function ImportForm({ save }: { save: (item: SavedImport) => void }) {
  const [venue, setVenue] = useState('LOCAL'),
    [symbol, setSymbol] = useState(''),
    [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!file) {
      setError('Choose a CSV file.')
      return
    }
    if (file.size > importPolicy.maxBytes) {
      setError(`Choose a CSV of at most ${importPolicy.maxBytes.toLocaleString('en-US')} bytes.`)
      return
    }
    setBusy(true)
    try {
      const csv = await file.text()
      checkImportRows(csv, importPolicy)
      save({ venue, symbol, filename: file.name, csv })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="intro">
        Import OHLCV history you have permission to store. Your file stays on
        this device.
      </p>
      <div className="fields">
        <label>
          Venue
          <input
            required
            maxLength={32}
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </label>
        <label>
          Symbol
          <input
            required
            maxLength={32}
            placeholder="e.g. ABC"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </label>
      </div>
      <label className="file-field">
        <Icon name="file" size={22} />
        <strong>Historical CSV</strong>
        <input
          type="file"
          required
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <details>
        <summary>CSV format</summary>
        <p>
          Use ascending UTC timestamps or dates with a header and up to six
          decimal places. Maximum per file: {importPolicy.maxBytes.toLocaleString('en-US')} bytes
          {' '}and {importPolicy.maxBars.toLocaleString('en-US')} bars.
        </p>
        <pre>
          time,open,high,low,close,volume{'\n'}2025-01-02,10,12,9,11,500
        </pre>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Importing…' : 'Import to watchlist'}
        </button>
      </div>
    </form>
  )
}

function Library({
  assets,
  ws,
  toggle,
}: {
  assets: Asset[]
  ws: Workspace
  toggle: (a: Asset) => void
}) {
  const [query, setQuery] = useState('')
  const visible = assets.filter((a) =>
    (a.id + ' ' + a.name).toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <>
      <label className="search">
        <Icon name="search" />
        <input
          aria-label="Search instruments"
          placeholder="Search symbol, venue or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="library">
        {visible.map((a) => {
          const added = ws.watchlist.includes(a.id)
          return (
            <div className="librow" key={a.id}>
              <div>
                <strong>{a.id}</strong>
                <small>{a.name}</small>
              </div>
              <button
                className={'outline ' + (added ? 'already' : '')}
                disabled={added && ws.watchlist.length === 1}
                aria-label={(added ? 'Remove ' : 'Add ') + a.id}
                onClick={() => toggle(a)}
              >
                <Icon name={added ? 'minus' : 'plus'} />
                {added ? 'Remove' : 'Add'}
              </button>
            </div>
          )
        })}
        {!visible.length && <p>No matching instruments.</p>}
      </div>
    </>
  )
}

export function App({ core }: { core: MarketCore }) {
  const samples = useMemo(() => sampleAssets(core), [core])
  const [saved, setSaved] = useState(() => readWorkspace(core, samples))
  const { workspace: ws, assets, warning } = saved
  const [dialog, setDialog] = useState<'import' | 'list' | 'indicators' | null>(
    null,
  )
  const [saveError, setSaveError] = useState(''),
    [offlineReady, setOfflineReady] = useState(false)
  const asset = assets.find((a) => a.id === ws.selected)!
  const { bars } = asset,
    last = bars.at(-1)!,
    move = movement(bars)
  const color = move.delta === null ? 'muted' : move.delta < 0 ? 'down' : 'up'
  const sma = useMemo(
    () => (ws.sma ? core.indicator('sma', 20, bars) : []),
    [core, ws.sma, bars],
  )
  const ema = useMemo(
    () => (ws.ema ? core.indicator('ema', 9, bars) : []),
    [core, ws.ema, bars],
  )
  const source = asset.source === 'sample' ? 'Synthetic sample' : 'Imported CSV'
  useEffect(() => {
    const refresh = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) {
        setSaved(readWorkspace(core, samples))
        setSaveError('')
      }
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [core, samples])
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !('serviceWorker' in navigator) ||
      !['https:', 'http:'].includes(location.protocol)
    )
      return
    let mounted = true
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (mounted) setOfflineReady(true)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])
  function update(
    workspace: Workspace,
    nextAssets = assets,
    mustPersist = false,
  ) {
    let error = ''
    let persisted = saved.persisted
    let stale = false
    try {
      stale = localStorage.getItem(KEY) !== persisted
      if (!stale) {
        if (saved.needsBackup && typeof persisted === 'string')
          backupWorkspace(persisted)
        const serialized = JSON.stringify(workspace)
        localStorage.setItem(KEY, serialized)
        persisted = serialized
      }
    } catch {
      error =
        'Browser storage is unavailable or full. Changes are available for this session.'
      if (mustPersist)
        throw Error(
          'Browser storage is unavailable or full. Free space or import a smaller CSV.',
        )
    }
    if (stale) {
      const message =
        'The saved workspace changed. Review the latest version and try again.'
      setSaved(readWorkspace(core, samples))
      setSaveError(message)
      if (mustPersist) throw Error(message)
      return
    }
    setSaveError(error)
    setSaved({
      workspace,
      assets: nextAssets,
      persisted,
      needsBackup: !!error && saved.needsBackup,
    })
  }
  function addImport(item: SavedImport) {
    const a = importedAsset(core, item)
    if (assets.some((x) => x.id === a.id))
      throw Error(
        'This venue and symbol already exist. Use a different identity.',
      )
    update(
      {
        ...ws,
        selected: a.id,
        watchlist: [...ws.watchlist, a.id],
        imports: [...ws.imports, item],
      },
      [...assets, a],
      true,
    )
    setDialog(null)
  }
  function toggle(a: Asset) {
    const present = ws.watchlist.includes(a.id)
    if (present && ws.watchlist.length === 1) return
    const watchlist = present
      ? ws.watchlist.filter((id) => id !== a.id)
      : [...ws.watchlist, a.id]
    update({
      ...ws,
      watchlist,
      selected: watchlist.includes(ws.selected) ? ws.selected : watchlist[0],
    })
  }
  const span = last.high - last.low,
    position = span === 0 ? 50 : ((last.close - last.low) / span) * 100
  return (
    <>
      <header className="app-header">
        <div className="app-brand">
          <Mark />
          <strong>MarketWeft</strong>
        </div>
        <div className="status">
          <i />
          Local workspace
        </div>
        <button className="import-btn" onClick={() => setDialog('import')}>
          <Icon name="import" />
          Import CSV
        </button>
      </header>
      <main>
        <div className="page-head">
          <h1>Research terminal</h1>
          <div className="asof">
            <span>{source} through</span>
            <b>{dateLabel(last.time)}</b>
          </div>
        </div>
        {(warning || saveError) && (
          <p className="warning" role="alert">
            {warning || saveError}
          </p>
        )}
        <div className="layout">
          <article className="chart-card">
            <div className="instrument">
              <div className="ins-id">
                <span className="ticker-mark">
                  <Icon name="chart" size={22} />
                </span>
                <div>
                  <div className="ticker-line">
                    <h2>{asset.symbol}</h2>
                    <span>{asset.venue}</span>
                  </div>
                  <p>{asset.name}</p>
                </div>
              </div>
              <div className="quote">
                <strong>{price(last.close)}</strong>
                <div className={color}>
                  {changeString(move.delta)}{' '}
                  <span>({changeString(move.pct, '%')})</span>
                </div>
              </div>
            </div>
            <div className="plot-toolbar">
              <div className="chart-kind">
                <Icon name="chart" />
                <b>Candles</b>
                <i />
                {asset.source === 'sample' ? 'Daily bars' : 'Source bars'}
              </div>
              <button
                className="indicator-btn"
                onClick={() => setDialog('indicators')}
              >
                <Icon name="sliders" />
                Indicators <b>{Number(ws.sma) + Number(ws.ema)}</b>
              </button>
            </div>
            <div className="legend" aria-label="Chart legend">
              <span>
                <i className="candle-key" />
                OHLCV
              </span>
              {ws.sma && (
                <span>
                  <i className="line-key sma" />
                  SMA 20
                </span>
              )}
              {ws.ema && (
                <span>
                  <i className="line-key ema" />
                  EMA 9
                </span>
              )}
            </div>
            <Chart key={asset.id} asset={asset} sma={sma} ema={ema} />
          </article>
          <aside>
            <section className="side-card watchlist">
              <header>
                <div className="section-title">
                  <Icon name="pin" />
                  <h2>Watchlist</h2>
                  <span>{ws.watchlist.length}</span>
                </div>
                <button
                  className="icon-btn"
                  title="Manage watchlist"
                  aria-label="Manage watchlist"
                  onClick={() => setDialog('list')}
                >
                  <Icon name="plus" />
                </button>
              </header>
              <div className="watch-labels">
                <span>Instrument</span>
                <span>Last / Change</span>
              </div>
              <div className="watch-items">
                {ws.watchlist.map((id) => {
                  const a = assets.find((x) => x.id === id)!,
                    m = movement(a.bars)
                  return (
                    <button
                      className={
                        'watch-row ' + (id === asset.id ? 'selected' : '')
                      }
                      key={id}
                      aria-label={'Select ' + id}
                      aria-pressed={id === asset.id}
                      onClick={() => update({ ...ws, selected: id })}
                    >
                      <div className="watch-symbol">
                        <strong>{a.symbol}</strong>
                        <small>{a.venue}</small>
                      </div>
                      <Spark bars={a.bars} />
                      <div className="watch-value">
                        <strong>{price(a.bars.at(-1)!.close)}</strong>
                        <small
                          className={
                            m.pct === null ? 'muted' : m.pct < 0 ? 'down' : 'up'
                          }
                        >
                          {changeString(m.pct, '%')}
                        </small>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
            <section className="side-card bar-detail">
              <header>
                <div className="section-title">
                  <Icon name="sliders" />
                  <h2>Latest bar</h2>
                </div>
                <span className="unit">UTC</span>
              </header>
              <dl>
                <div>
                  <dt>Open</dt>
                  <dd>{price(last.open)}</dd>
                </div>
                <div>
                  <dt>Volume</dt>
                  <dd>{volume(last.volume)}</dd>
                </div>
              </dl>
              <div className="range-label">
                <span>
                  Low <b>{price(last.low)}</b>
                </span>
                <span>
                  High <b>{price(last.high)}</b>
                </span>
              </div>
              <div
                className="range-track"
                aria-label={'Close ' + price(last.close) + ' within bar range'}
              >
                <i style={{ left: position + '%' }} />
              </div>
            </section>
          </aside>
        </div>
        <section className="dataset">
          <div className="dataset-title">
            <span className="data-icon">
              <Icon name="database" size={20} />
            </span>
            <div>
              <small>DATA SOURCE</small>
              <h2>{source}</h2>
            </div>
          </div>
          <div className="dataset-cell">
            <small>Instrument ID</small>
            <b>{asset.id}</b>
          </div>
          <div className="dataset-cell">
            <small>History starts</small>
            <b>{dateLabel(bars[0].time)}</b>
          </div>
          <div className="dataset-cell">
            <small>Observations</small>
            <b>{bars.length.toLocaleString('en-US')} bars</b>
          </div>
        </section>
        <footer>
          <span>
            <i className="footer-dot" />
            {offlineReady ? 'Offline ready' : 'Local analysis'}
          </span>
          <span>All timestamps in UTC</span>
        </footer>
      </main>
      {dialog && (
        <Dialog
          title={
            dialog === 'import'
              ? 'Import historical data'
              : dialog === 'list'
                ? 'Manage watchlist'
                : 'Indicator overlays'
          }
          close={() => setDialog(null)}
        >
          {dialog === 'import' ? (
            <ImportForm save={addImport} />
          ) : dialog === 'list' ? (
            <Library assets={assets} ws={ws} toggle={toggle} />
          ) : (
            <>
              <p className="intro">
                Moving averages use the closing price of each bar.
              </p>
              {(['sma', 'ema'] as const).map((k) => (
                <label key={k} className="indicator-option">
                  <span>
                    <strong>
                      {k === 'sma'
                        ? 'Simple moving average'
                        : 'Exponential moving average'}
                    </strong>
                    <small>
                      {k === 'sma' ? 'SMA · 20 bars' : 'EMA · 9 bars'}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={ws[k]}
                    onChange={(e) => update({ ...ws, [k]: e.target.checked })}
                  />
                </label>
              ))}
            </>
          )}
        </Dialog>
      )}
    </>
  )
}
