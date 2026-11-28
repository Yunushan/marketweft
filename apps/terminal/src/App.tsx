import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode, FormEvent } from 'react'
import type { MarketCore, MeasuredDrawing } from './market-core'
import { DEFAULT_INDICATOR_PERIODS } from './market-core'
import { Spark } from './Chart'
import { TimeframeChart } from './TimeframeChart'
import { FootprintResearch } from './FootprintResearch'
import { IndicatorPeriods, StudyControls } from './IndicatorPeriods'
import { EMPTY_ANNOTATIONS, sameAnnotation } from './chart-annotations'
import type { ChartAnnotation } from './chart-annotations'
import { Icon, Mark } from './Icons'
import { changeString, dateLabel, movement, price, volume } from './workspace'
import type { Asset, SavedImport } from './workspace'
import { CatalogConflictError, createHistory } from './catalog'
import type {
  Catalog,
  CatalogData,
  CatalogSnapshot,
  ComparisonPreferences,
  Preferences,
  SeriesMetadata,
} from './catalog'
import { parseProviderHistoryFixture, SOURCE_RIGHTS } from './catalog-schema'
import type {
  ChartPane, ChartType, OverlayPeriods, SwingSettings, SourceRight, SourceRights, SourceRightStatus,
} from './catalog-schema'
import { defaultStudySettings, extraStudyPeriods, STUDIES, STUDY_KINDS } from './studies'
import type { StudyKind, StudySet, StudySettings } from './studies'
import { WorkspaceBackup } from './WorkspaceBackup'
import { checkImportRows, type ImportPolicy } from './import-policy'
import { MAX_PROVIDER_VERIFICATION_BYTES } from './provider-signature'

declare const __MARKETWEFT_IMPORT_POLICY__: ImportPolicy
const importPolicy = __MARKETWEFT_IMPORT_POLICY__
const researchLoading = <p role="status">Loading research…</p>
const HistoricalReplay = lazy(async () => {
  const module = await import('./HistoricalReplay')
  return { default: module.HistoricalReplay }
})
const TickBarsResearch = lazy(async () => {
  const module = await import('./TickBarsResearch')
  return { default: module.TickBarsResearch }
})
const RangeBarsResearch = lazy(async () => {
  const module = await import('./TickBarsResearch')
  return { default: module.RangeBarsResearch }
})
const VolumeBarsResearch = lazy(async () => {
  const module = await import('./TickBarsResearch')
  return { default: module.VolumeBarsResearch }
})
const DepthResearch = lazy(async () => {
  const module = await import('./DepthResearch')
  return { default: module.DepthResearch }
})
const FormulaResearch = lazy(async () => {
  const module = await import('./FormulaResearch')
  return { default: module.FormulaResearch }
})
const MonthlyReturnsResearch = lazy(async () => {
  const module = await import('./MonthlyReturnsResearch')
  return { default: module.MonthlyReturnsResearch }
})
const ProviderRevisionResearch = lazy(async () => {
  const module = await import('./ProviderRevisionResearch')
  return { default: module.ProviderRevisionResearch }
})
const chartTypeLabels: Record<ChartType, string> = {
  candles: 'Candles',
  'hollow-candles': 'Hollow candles',
  'volume-candles': 'Volume-weighted candles',
  line: 'Close line',
  area: 'Close area',
  'step-line': 'Step line',
  baseline: 'Baseline',
  'close-change': 'Close-change histogram',
  'close-distribution': 'Close distribution',
  'high-low-band': 'High-low band',
  'rebased-percent': 'Rebased percent change',
  drawdown: 'Peak-to-trough drawdown',
  'confirmed-swings': 'Confirmed close swings',
  ohlc: 'OHLC bars',
  'heikin-ashi': 'Heikin-Ashi',
  renko: 'Renko',
  'three-line-break': 'Three Line Break',
  kagi: 'Kagi',
  'point-and-figure': 'Point and Figure',
}

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
  const dismissOnEscape = useEffectEvent(close)
  useLayoutEffect(() => {
    const el = ref.current!
    el.showModal()
    // Disabling a focused form control can move keyboard events to the document.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing)
        return
      event.preventDefault()
      dismissOnEscape()
    }
    el.ownerDocument.addEventListener('keydown', onKeyDown)
    return () => {
      el.ownerDocument.removeEventListener('keydown', onKeyDown)
      el.close()
    }
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

const rightLabels: Record<SourceRight, string> = {
  display: 'Display',
  storage: 'Storage',
  redistribution: 'Redistribution',
  automatedUse: 'Automated use',
}
const rightStatusLabels: Record<SourceRightStatus, string> = {
  unconfirmed: 'Unconfirmed',
  granted: 'Granted',
  restricted: 'Restricted',
}

function ImportForm({
  save,
}: {
  save: (item: SavedImport, metadata: SeriesMetadata) => Promise<void>
}) {
  const [venue, setVenue] = useState('LOCAL'),
    [symbol, setSymbol] = useState(''),
    [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [barInterval, setBarInterval] = useState('')
  const [source, setSource] = useState('')
  const [grant, setGrant] = useState('Local storage and analysis')
  const [adjustment, setAdjustment] = useState('')
  const [rights, setRights] = useState<SourceRights>({
    display: 'unconfirmed', storage: 'unconfirmed',
    redistribution: 'unconfirmed', automatedUse: 'unconfirmed',
  })
  const [expiresOn, setExpiresOn] = useState('')
  const [providerFixture, setProviderFixture] = useState(false)
  const [verificationKey, setVerificationKey] = useState<File | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!file) {
      setError(providerFixture ? 'Choose a provider history fixture.' : 'Choose a CSV file.')
      return
    }
    if (file.size > importPolicy.maxBytes) {
      setError(
        `Choose a ${providerFixture ? 'provider fixture' : 'CSV'} of at most ${importPolicy.maxBytes.toLocaleString('en-US')} bytes.`,
      )
      return
    }
    setBusy(true)
    try {
      const text = await file.text()
      if (providerFixture) {
        if (verificationKey && verificationKey.size > MAX_PROVIDER_VERIFICATION_BYTES)
          throw Error('The provider verification file exceeds 64 KiB.')
        const publicKey = await verificationKey?.text()
        const { item, metadata } = await parseProviderHistoryFixture(text, file.name, publicKey)
        checkImportRows(item.csv, importPolicy)
        await save(item, metadata)
        return
      }
      checkImportRows(text, importPolicy)
      const declared = Boolean(expiresOn || SOURCE_RIGHTS.some((key) => rights[key] !== 'unconfirmed'))
      await save(
        { venue, symbol, filename: file.name, csv: text },
        {
          barInterval: barInterval.trim() || 'unspecified',
          source: source.trim() || file.name,
          usageGrant: grant.trim() || 'unspecified',
          adjustmentPolicy: adjustment.trim() || 'unspecified',
          ...(declared ? { sourceRights: { ...rights, ...(expiresOn ? { expiresOn } : {}) } } : {}),
        },
      )
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
      <label className="import-format">
        Input format
        <select value={providerFixture ? 'provider' : 'csv'} onChange={(event) => {
          setProviderFixture(event.target.value === 'provider')
          setFile(null)
          setVerificationKey(null)
          setError('')
        }}>
          <option value="csv">CSV file</option>
          <option value="provider">Provider history fixture</option>
        </select>
      </label>
      {!providerFixture && <div className="fields">
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
      </div>}
      <label className="file-field">
        <Icon name="file" size={22} />
        <strong>{providerFixture ? 'Provider history JSON' : 'Historical CSV'}</strong>
        <input
          key={String(providerFixture)}
          type="file"
          aria-label={providerFixture ? 'Provider history JSON' : 'Historical CSV file'}
          required
          accept={providerFixture ? '.json,application/json' : '.csv,text/csv'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {providerFixture && <label className="file-field">
        <Icon name="file" size={22} />
        <strong>Provider verification key or registry</strong>
        <input type="file" accept=".pem,.json,application/x-pem-file,application/json"
          onChange={(event) => setVerificationKey(event.target.files?.[0] ?? null)} />
      </label>}
      {!providerFixture && <><details className="series-details">
        <summary>Series details</summary>
        <div className="metadata-fields">
          <label>
            Bar interval
            <input
              value={barInterval}
              placeholder="e.g. 1 day"
              onChange={(e) => setBarInterval(e.target.value)}
            />
          </label>
          <label>
            Source
            <input
              value={source}
              placeholder={file?.name || 'CSV filename'}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label>
            Usage grant
            <input value={grant} onChange={(e) => setGrant(e.target.value)} />
          </label>
          <label>
            Adjustment policy
            <input
              value={adjustment}
              placeholder="e.g. split-adjusted"
              onChange={(e) => setAdjustment(e.target.value)}
            />
          </label>
        </div>
        <fieldset className="metadata-fields source-rights">
          <legend>Source permissions</legend>
          {SOURCE_RIGHTS.map((key) => (
            <label key={key}>
              {rightLabels[key]}
              <select value={rights[key]} onChange={(event) =>
                setRights({ ...rights, [key]: event.target.value as SourceRightStatus })
              }>
                {Object.entries(rightStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Grant expiration in UTC
            <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </label>
        </fieldset>
      </details>
      <details>
        <summary>CSV format</summary>
        <p>
          Use ascending UTC timestamps or dates with a header and up to six
          decimal places. Maximum per file:{' '}
          {importPolicy.maxBytes.toLocaleString('en-US')} bytes and{' '}
          {importPolicy.maxBars.toLocaleString('en-US')} bars.
        </p>
        <pre>
          time,open,high,low,close,volume{'\n'}2025-01-02,10,12,9,11,500
        </pre>
      </details></>}
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
  saving,
}: {
  assets: Asset[]
  ws: Preferences
  toggle: (a: Asset) => void
  saving: boolean
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
                disabled={saving || (added && ws.watchlist.length === 1)}
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

export function App({
  core,
  catalog,
  initial,
}: {
  core: MarketCore
  catalog: Catalog
  initial: CatalogSnapshot
}) {
  const samples = useMemo(
    () => initial.assets.filter((asset) => asset.source === 'sample'),
    [initial],
  )
  const [saved, setSaved] = useState(initial)
  const [replaying, setReplaying] = useState(false)
  const [marketResearch, setMarketResearch] = useState<
    'tick-bars' | 'range-bars' | 'volume-bars' | 'depth' | 'footprint' | 'formula' | 'monthly-returns' | 'provider-revisions' | null
  >(null)
  const replayButton = useRef<HTMLButtonElement>(null)
  const tickResearchButton = useRef<HTMLButtonElement>(null)
  const [tradePane, setTradePane] = useState<ChartPane>('primary')
  const rangeResearchButton = useRef<HTMLButtonElement>(null)
  const comparisonRangeButton = useRef<HTMLButtonElement>(null)
  const volumeResearchButton = useRef<HTMLButtonElement>(null)
  const comparisonVolumeButton = useRef<HTMLButtonElement>(null)
  const depthResearchButton = useRef<HTMLButtonElement>(null)
  const footprintResearchButton = useRef<HTMLButtonElement>(null)
  const formulaResearchButton = useRef<HTMLButtonElement>(null)
  const monthlyReturnsButton = useRef<HTMLButtonElement>(null)
  const providerResearchButton = useRef<HTMLButtonElement>(null)
  const restoreReplayFocus = useRef(false)
  const restoreResearchFocus = useRef<typeof marketResearch>(null)
  useLayoutEffect(() => {
    if (!replaying && restoreReplayFocus.current) {
      restoreReplayFocus.current = false
      replayButton.current?.focus()
    }
  }, [replaying])
  useEffect(() => {
    if (!marketResearch && restoreResearchFocus.current) {
      const button = {
        'tick-bars': tickResearchButton, 'range-bars': tradePane === 'primary' ? rangeResearchButton : comparisonRangeButton,
        'volume-bars': tradePane === 'primary' ? volumeResearchButton : comparisonVolumeButton,
        depth: depthResearchButton, footprint: footprintResearchButton,
        formula: formulaResearchButton, 'monthly-returns': monthlyReturnsButton, 'provider-revisions': providerResearchButton,
      }[restoreResearchFocus.current]
      restoreResearchFocus.current = null
      button.current?.focus()
    }
  }, [marketResearch, tradePane])
  const [pendingPrefs, setPendingPrefs] = useState<{
    revision: number
    prefs: Preferences
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const dismissAfterSave = useRef(false)
  const { assets, warning } = saved
  const ws =
    pendingPrefs?.revision === saved.revision
      ? pendingPrefs.prefs
      : saved.preferences
  const [dialog, setDialog] = useState<
    'import' | 'list' | 'indicators' | 'backup' | null
  >(null)
  const [saveError, setSaveError] = useState(''),
    [offlineReady, setOfflineReady] = useState(false)
  const [offlineUpdate, setOfflineUpdate] = useState(false)
  const [notice, setNotice] = useState('')
  const [crosshair, setCrosshair] = useState<{ identity: string; time: number | null } | null>(null)
  const asset =
    assets.find((a) => a.id === ws.selected) ??
    assets.find((a) => a.id === saved.preferences.selected)!
  const { bars } = asset,
    last = bars.at(-1)!,
    move = movement(bars)
  const color = move.delta === null ? 'muted' : move.delta < 0 ? 'down' : 'up'
  const primaryPeriods = ws.overlayPeriods?.primary ?? DEFAULT_INDICATOR_PERIODS
  const comparisonPeriods = ws.overlayPeriods?.comparison ?? DEFAULT_INDICATOR_PERIODS
  const primaryStudies = useMemo<StudySet>(() => ({
    ...(ws.rsi?.primary && { rsi: ws.rsi.primary }), ...ws.studies?.primary,
  }), [ws.rsi?.primary, ws.studies?.primary])
  const comparisonStudies = useMemo<StudySet>(() => ({
    ...(ws.rsi?.comparison && { rsi: ws.rsi.comparison }), ...ws.studies?.comparison,
  }), [ws.rsi?.comparison, ws.studies?.comparison])
  const comparison = ws.comparison
  const other = comparison && assets.find((item) => item.id === comparison.selected)
  const otherBars = other?.bars
  const chartIdentity =
    asset.id + ':' + bars.length + '|' + (other?.id ?? '') + ':' + (otherBars?.length ?? 0)
  const onCrosshair = useCallback((time: number | null) => {
    setCrosshair((previous) =>
      previous?.identity === chartIdentity && previous.time === time
        ? previous
        : { identity: chartIdentity, time },
    )
  }, [chartIdentity])
  const cursor =
    comparison?.linked && crosshair?.identity === chartIdentity ? crosshair.time : null
  const source = asset.source === 'sample' ? 'Synthetic sample' : 'Imported CSV'
  const descriptor = saved.series.find(
    (item) => item.id === asset.id,
  )?.descriptor
  const sourceRights = descriptor?.sourceRights
  const providerVerification = descriptor?.providerVerification
  const comparisonDescriptor = other && saved.series.find((item) => item.id === other.id)?.descriptor
  function accept(next: CatalogSnapshot) {
    setSaved((previous) =>
      next.revision >= previous.revision ? next : previous,
    )
  }
  useEffect(() => {
    let mounted = true
    const refresh = () => {
      catalog
        .read()
        .then((latest) => {
          if (mounted) accept(latest)
        })
        .catch((cause: unknown) => {
          if (mounted)
            setSaveError(
              cause instanceof Error
                ? cause.message
                : 'Could not refresh the workspace.',
            )
        })
    }
    const unsubscribe = catalog.subscribe(refresh)
    // A different tab may have committed between opening and mounting the catalog.
    refresh()
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [catalog])
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !('serviceWorker' in navigator) ||
      !['https:', 'http:'].includes(location.protocol)
    )
      return
    let mounted = true
    let stopWatching = () => {}
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        if (!mounted) return
        let worker: ServiceWorker | null = null
        const showUpdate = () => {
          if (registration.waiting && navigator.serviceWorker.controller) setOfflineUpdate(true)
        }
        const watchInstall = () => {
          worker?.removeEventListener('statechange', showUpdate)
          worker = registration.installing
          worker?.addEventListener('statechange', showUpdate)
        }
        registration.addEventListener('updatefound', watchInstall)
        watchInstall()
        showUpdate()
        stopWatching = () => {
          registration.removeEventListener('updatefound', watchInstall)
          worker?.removeEventListener('statechange', showUpdate)
        }
        return navigator.serviceWorker.ready
      })
      .then(() => {
        if (mounted) setOfflineReady(true)
      })
      .catch(() => {})
    return () => {
      mounted = false
      stopWatching()
    }
  }, [])
  async function commit(operation: () => Promise<CatalogSnapshot>) {
    if (inFlight.current)
      throw Error('Wait for the current workspace change to finish.')
    inFlight.current = true
    setSaving(true)
    setSaveError('')
    setNotice('')
    try {
      accept(await operation())
      if (dismissAfterSave.current) setDialog(null)
    } catch (cause) {
      if (cause instanceof CatalogConflictError) {
        accept(await catalog.read())
      }
      throw cause
    } finally {
      dismissAfterSave.current = false
      inFlight.current = false
      setSaving(false)
    }
  }
  function update(prefs: Preferences) {
    if (inFlight.current) return
    setPendingPrefs({ revision: saved.revision, prefs })
    void commit(() => catalog.savePreferences(saved.revision, prefs))
      .catch((cause) =>
        setSaveError(
          cause instanceof Error
            ? cause.message
            : 'Could not save the workspace.',
        ),
      )
      .finally(() => setPendingPrefs(null))
  }
  function toggleComparison() {
    if (comparison) {
      const { comparison: _comparison, ...preferences } = ws
      update(preferences)
      return
    }
    const selected = assets.find((item) => item.id !== asset.id)?.id ?? asset.id
    update({ ...ws, comparison: { selected, sma: ws.sma, ema: ws.ema, linked: true } })
  }
  function setComparison(change: Partial<ComparisonPreferences>) {
    if (!comparison) return
    if (change.linked !== undefined) setCrosshair(null)
    update({ ...ws, comparison: { ...comparison, ...change } })
  }
  function setPeriods(pane: ChartPane, periods: OverlayPeriods) {
    const existing = ws.overlayPeriods?.[pane] ?? DEFAULT_INDICATOR_PERIODS
    if (periods.sma === existing.sma && periods.ema === existing.ema) return
    const { overlayPeriods: current, ...preferences } = ws
    const overlayPeriods = { ...current }
    if (periods.sma === DEFAULT_INDICATOR_PERIODS.sma &&
        periods.ema === DEFAULT_INDICATOR_PERIODS.ema) {
      delete overlayPeriods[pane]
    } else {
      overlayPeriods[pane] = periods
    }
    update(Object.keys(overlayPeriods).length ? { ...preferences, overlayPeriods } : preferences)
  }
  function setStudy(pane: ChartPane, kind: StudyKind, settings: StudySettings) {
    const { rsi: legacy, studies: current, ...preferences } = ws
    const defaults = defaultStudySettings(kind)
    const useDefault = !settings.enabled && settings.period === defaults.period &&
      extraStudyPeriods(kind).every(key => settings[key] === defaults[key])
    if (useDefault && kind !== 'rsi' && !current) return
    if (kind === 'rsi' && !current) {
      const rsi = { ...legacy }
      if (useDefault) delete rsi[pane]
      else rsi[pane] = settings
      update(Object.keys(rsi).length ? { ...preferences, rsi } : preferences)
      return
    }
    const studies = { primary: primaryStudies, comparison: comparisonStudies }
    const next = { ...studies[pane] }
    if (useDefault) delete next[kind]
    else next[kind] = settings
    studies[pane] = next
    const configured = Object.fromEntries(Object.entries(studies).filter(([, value]) => Object.keys(value).length))
    update(Object.keys(configured).length ? { ...preferences, studies: configured } : preferences)
  }
  function setChartType(pane: ChartPane, type: ChartType) {
    const { chartTypes: current, ...preferences } = ws
    const chartTypes = { ...current }
    if (type === 'candles') delete chartTypes[pane]
    else chartTypes[pane] = type
    update(Object.keys(chartTypes).length ? { ...preferences, chartTypes } : preferences)
  }
  function setChartPriceTicks(pane: ChartPane, setting: 'renkoTicks' | 'kagiTicks' | 'pointFigureTicks' | 'baselineTicks', ticks: number) {
    update({ ...ws, [setting]: { ...ws[setting], [pane]: ticks } })
  }
  function setChartInterval(pane: ChartPane, setting: 'closeChangeSeconds' | 'highLowSeconds', seconds: number) {
    update({ ...ws, [setting]: { ...ws[setting], [pane]: seconds } })
  }
  function setRebaseTime(pane: ChartPane, time: number | null) {
    const { rebaseTimes: current, ...preferences } = ws
    const rebaseTimes = { ...current }
    if (time === null) delete rebaseTimes[pane]
    else rebaseTimes[pane] = time
    update(Object.keys(rebaseTimes).length ? { ...preferences, rebaseTimes } : preferences)
  }
  function setSwingSettings(pane: ChartPane, settings: SwingSettings) {
    update({ ...ws, swingSettings: { ...ws.swingSettings, [pane]: settings } })
  }
  function drawingTools(id: string) {
    return {
      core,
      saved: ws.drawings?.[id],
      annotations: ws.annotations?.[id] ?? EMPTY_ANNOTATIONS,
      busy: saving,
      async saveAnnotation(before: ChartAnnotation | undefined, next: ChartAnnotation | undefined) {
        const { annotations: current, ...preferences } = saved.preferences
        const original = before ?? next
        if (!original) return
        const annotations = { ...current }
        const entries = [...(annotations[id] ?? [])]
        const position = entries.findIndex(entry => entry.id === original.id)
        const previous = entries[position]
        if (before ? !previous || !sameAnnotation(previous, before)
          : previous !== undefined)
          throw Error('This drawing changed while you were editing. Cancel and reopen it.')
        if (position < 0 && next) entries.push(next)
        else if (next) entries[position] = next
        else entries.splice(position, 1)
        if (entries.length) annotations[id] = entries
        else delete annotations[id]
        const updated = Object.keys(annotations).length ? { ...preferences, annotations } : preferences
        await commit(() => catalog.savePreferences(saved.revision, updated))
      },
      async save(drawing: MeasuredDrawing | null) {
        const { drawings: current, ...preferences } = saved.preferences
        const drawings = { ...current }
        if (drawing) drawings[id] = drawing
        else delete drawings[id]
        const next = Object.keys(drawings).length ? { ...preferences, drawings } : preferences
        await commit(() => catalog.savePreferences(saved.revision, next))
      },
    }
  }
  async function addImport(item: SavedImport, metadata: SeriesMetadata) {
    const history = createHistory(core, item, metadata)
    await commit(() => catalog.addSeries(saved.revision, history))
    setDialog(null)
  }
  async function restore(revision: number, data: CatalogData) {
    await commit(() => catalog.restore(revision, data))
    setCrosshair(null)
    setDialog(null)
    setNotice('Workspace restored.')
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
  if (marketResearch) {
    const closeResearch = () => {
      restoreResearchFocus.current = marketResearch
      setMarketResearch(null)
    }
    if (marketResearch === 'range-bars' || marketResearch === 'volume-bars') {
      const series = tradePane === 'primary' ? asset : other
      if (!series) return <main className="replay-page">
        <p role="status">The comparison instrument is unavailable.</p>
        <button className="outline" onClick={closeResearch}>Return to workspace</button>
      </main>
      const Research = marketResearch === 'range-bars' ? RangeBarsResearch : VolumeBarsResearch
      const sizeSetting = marketResearch === 'range-bars' ? 'rangeTicks' : 'volumeTicks'
      return <Suspense fallback={researchLoading}>
        <Research key={series.id} core={core} asset={series} close={closeResearch}
          savedSizeTicks={saved.preferences[sizeSetting]?.[tradePane]} saveSizeTicks={ticks =>
            commit(() => catalog.savePreferences(saved.revision, { ...saved.preferences,
              [sizeSetting]: { ...saved.preferences[sizeSetting], [tradePane]: ticks } }))} />
      </Suspense>
    }
    const Research = { 'tick-bars': TickBarsResearch, depth: DepthResearch, footprint: FootprintResearch,
      formula: FormulaResearch, 'monthly-returns': MonthlyReturnsResearch, 'provider-revisions': ProviderRevisionResearch }[marketResearch]
    return <Suspense fallback={researchLoading}>
    <Research key={asset.id} core={core} asset={asset} sourceLabel={descriptor?.source ?? source}
      sourceRights={sourceRights} policy={importPolicy} close={closeResearch} />
    </Suspense>
  }
  if (replaying) {
    return (
      <Suspense fallback={researchLoading}>
        <HistoricalReplay
          core={core}
          assets={assets.filter((item) => item.source === 'import')}
          selected={ws.selected}
          histories={saved.series}
          readHistory={async id => (await catalog.read()).series.find(history => history.id === id)}
          close={() => {
            restoreReplayFocus.current = true
            setReplaying(false)
          }}
        />
      </Suspense>
    )
  }
  return (
    <>
      <header className="app-header">
        <div className="app-brand">
          <Mark />
          <strong>MarketWeft</strong>
        </div>
        <div className="status" aria-live="polite">
          <i />
          {saving ? 'Saving workspace…' : 'Local workspace'}
        </div>
        <button
          className="outline backup-btn"
          aria-label="Workspace backup"
          title="Workspace backup"
          disabled={saving}
          onClick={() => setDialog('backup')}
        >
          <Icon name="database" />
          <span>Workspace backup</span>
        </button>
        <button className="import-btn" onClick={() => setDialog('import')}>
          <Icon name="import" />
          Import CSV
        </button>
      </header>
      <main>
        <div className="page-head">
          <h1>Research terminal</h1>
          <div className="page-actions">
            <div className="asof">
              <span>{source} through</span>
              <b>{dateLabel(last.time)}</b>
            </div>
            <button
              ref={replayButton}
              className="outline"
              disabled={saving}
              onClick={() => setReplaying(true)}
            >
              <Icon name="chart" /> Historical replay
            </button>
            <button ref={tickResearchButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('tick-bars')}>Recorded tick bars</button>
            <button ref={rangeResearchButton} className="outline" disabled={saving}
              onClick={() => { setTradePane('primary'); setMarketResearch('range-bars') }}>Recorded range bars</button>
            <button ref={volumeResearchButton} className="outline" disabled={saving}
              onClick={() => { setTradePane('primary'); setMarketResearch('volume-bars') }}>Recorded volume bars</button>
            <button ref={depthResearchButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('depth')}>Recorded market depth</button>
            <button ref={footprintResearchButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('footprint')}>Recorded footprint</button>
            <button ref={formulaResearchButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('formula')}>Time-series formulas</button>
            <button ref={monthlyReturnsButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('monthly-returns')}>Monthly returns calendar</button>
            <button ref={providerResearchButton} className="outline" disabled={saving}
              onClick={() => setMarketResearch('provider-revisions')}>Provider revisions</button>
          </div>
        </div>
        {(warning || saveError) && (
          <p className="warning" role="alert">
            {saveError || warning}
          </p>
        )}
        {notice && (
          <p className="workspace-notice" role="status">
            {notice}
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
                <select aria-label="Primary chart type" value={ws.chartTypes?.primary ?? 'candles'}
                  disabled={saving}
                  onChange={event => setChartType('primary', event.target.value as ChartType)}>
                  {Object.entries(chartTypeLabels).map(([type, label]) =>
                    <option key={type} value={type}>{label}</option>)}
                </select>
                <i />
                {asset.source === 'sample' ? 'Daily bars' : 'Source bars'}
              </div>
              <div className="chart-actions">
                <button className="indicator-btn" onClick={() => setDialog('indicators')}>
                  <Icon name="sliders" />
                  Indicators <b>{Number(ws.sma) + Number(ws.ema)}</b>
                </button>
                <button className="outline" aria-label="Compare charts" aria-pressed={Boolean(comparison)}
                  onClick={toggleComparison} disabled={saving}>Compare</button>
              </div>
            </div>
            <div className="legend" aria-label="Chart legend">
              <span>
                <i className="candle-key" />
                {ws.chartTypes?.primary === 'heikin-ashi' ? 'Heikin-Ashi · observed volume' :
                  ws.chartTypes?.primary === 'renko' ? 'Renko · close-based' :
                  ws.chartTypes?.primary === 'three-line-break' ? 'Three Line Break · close-based' :
                  ws.chartTypes?.primary === 'kagi' ? 'Kagi · close-based' :
                  ws.chartTypes?.primary === 'point-and-figure' ? 'Point and Figure · close-based' : 'OHLCV'}
              </span>
              {ws.sma && (
                <span>
                  <i className="line-key sma" />
                  SMA {primaryPeriods.sma}
                </span>
              )}
              {ws.ema && (
                <span>
                  <i className="line-key ema" />
                  EMA {primaryPeriods.ema}
                </span>
              )}
            </div>
            {comparison && other && (
              <div className="comparison-preferences" role="group" aria-label="Comparison chart settings">
                <label>
                  Comparison instrument
                  <select value={comparison.selected} disabled={saving}
                    onChange={event => setComparison({ selected: event.target.value })}>
                    {assets.map(item => (
                      <option key={item.id} value={item.id}>{item.symbol} · {item.venue}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Comparison chart type
                  <select value={ws.chartTypes?.comparison ?? 'candles'} disabled={saving}
                    onChange={event => setChartType('comparison', event.target.value as ChartType)}>
                    {Object.entries(chartTypeLabels).map(([type, label]) =>
                      <option key={type} value={type}>{label}</option>)}
                  </select>
                </label>
                <div className="comparison-toggles">
                  <label>
                    <input type="checkbox" checked={comparison.sma} disabled={saving}
                      onChange={event => setComparison({ sma: event.target.checked })} />
                    SMA {comparisonPeriods.sma}
                  </label>
                  <label>
                    <input type="checkbox" checked={comparison.ema} disabled={saving}
                      onChange={event => setComparison({ ema: event.target.checked })} />
                    EMA {comparisonPeriods.ema}
                  </label>
                  <label>
                    <input type="checkbox" checked={comparison.linked} disabled={saving}
                      onChange={event => setComparison({ linked: event.target.checked })} />
                    Link by UTC
                  </label>
                </div>
              </div>
            )}
            <div className={other ? 'chart-panes is-comparison' : 'chart-panes'}>
              <section aria-label="Primary chart pane">
                {/* Replacing the history can invalidate bar-indexed viewport and crosshair state. */}
                <TimeframeChart key={`${asset.id}:${bars.length}`} asset={asset}
                  core={core} activeSma={ws.sma} activeEma={ws.ema}
                  linkedTimestamp={cursor} onTimestamp={comparison?.linked ? onCrosshair : undefined}
                  drawingTools={drawingTools(asset.id)} periods={primaryPeriods}
                  studySettings={primaryStudies}
                  type={ws.chartTypes?.primary}
                  renkoTicks={ws.renkoTicks?.primary} kagiTicks={ws.kagiTicks?.primary}
                  pointFigureTicks={ws.pointFigureTicks?.primary} baselineTicks={ws.baselineTicks?.primary} priceSizeSaving={saving}
                  onBaselineTicks={ticks => setChartPriceTicks('primary', 'baselineTicks', ticks)}
                  closeChangeSeconds={ws.closeChangeSeconds?.primary}
                  onCloseChangeSeconds={seconds => setChartInterval('primary', 'closeChangeSeconds', seconds)}
                  highLowSeconds={ws.highLowSeconds?.primary}
                  onHighLowSeconds={seconds => setChartInterval('primary', 'highLowSeconds', seconds)}
                  rebaseTime={ws.rebaseTimes?.primary} onRebaseTime={time => setRebaseTime('primary', time)}
                  swingSettings={ws.swingSettings?.primary} onSwingSettings={settings => setSwingSettings('primary', settings)}
                  onRenkoTicks={ticks => setChartPriceTicks('primary', 'renkoTicks', ticks)}
                  onKagiTicks={ticks => setChartPriceTicks('primary', 'kagiTicks', ticks)}
                  onPointFigureTicks={ticks => setChartPriceTicks('primary', 'pointFigureTicks', ticks)}
                  exportOptions={{ metadata: descriptor }} />
              </section>
              {comparison && other && (
                <section aria-label="Comparison chart pane">
                  <button ref={comparisonRangeButton} className="outline" disabled={saving}
                    onClick={() => { setTradePane('comparison'); setMarketResearch('range-bars') }}>Comparison range bars</button>
                  <button ref={comparisonVolumeButton} className="outline" disabled={saving}
                    onClick={() => { setTradePane('comparison'); setMarketResearch('volume-bars') }}>Comparison volume bars</button>
                  <TimeframeChart key={`${other.id}:${other.bars.length}`} asset={other}
                    core={core} activeSma={comparison.sma} activeEma={comparison.ema}
                    linkedTimestamp={cursor} onTimestamp={comparison.linked ? onCrosshair : undefined}
                    drawingTools={drawingTools(other.id)} periods={comparisonPeriods}
                    studySettings={comparisonStudies}
                    type={ws.chartTypes?.comparison}
                    renkoTicks={ws.renkoTicks?.comparison} kagiTicks={ws.kagiTicks?.comparison}
                    pointFigureTicks={ws.pointFigureTicks?.comparison} baselineTicks={ws.baselineTicks?.comparison} priceSizeSaving={saving}
                    onBaselineTicks={ticks => setChartPriceTicks('comparison', 'baselineTicks', ticks)}
                    closeChangeSeconds={ws.closeChangeSeconds?.comparison}
                    onCloseChangeSeconds={seconds => setChartInterval('comparison', 'closeChangeSeconds', seconds)}
                    highLowSeconds={ws.highLowSeconds?.comparison}
                    onHighLowSeconds={seconds => setChartInterval('comparison', 'highLowSeconds', seconds)}
                    rebaseTime={ws.rebaseTimes?.comparison} onRebaseTime={time => setRebaseTime('comparison', time)}
                    swingSettings={ws.swingSettings?.comparison} onSwingSettings={settings => setSwingSettings('comparison', settings)}
                    onRenkoTicks={ticks => setChartPriceTicks('comparison', 'renkoTicks', ticks)}
                    onKagiTicks={ticks => setChartPriceTicks('comparison', 'kagiTicks', ticks)}
                    onPointFigureTicks={ticks => setChartPriceTicks('comparison', 'pointFigureTicks', ticks)}
                    exportOptions={{ metadata: comparisonDescriptor }} />
                </section>
              )}
            </div>
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
                      disabled={saving}
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
        {descriptor && (
          <dl className="series-provenance">
            <div>
              <dt>Bar interval</dt>
              <dd>{descriptor.barInterval}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{descriptor.source}</dd>
            </div>
            <div>
              <dt>Usage grant</dt>
              <dd>{descriptor.usageGrant}</dd>
            </div>
            <div>
              <dt>Adjustment policy</dt>
              <dd>{descriptor.adjustmentPolicy}</dd>
            </div>
            {sourceRights && SOURCE_RIGHTS.map((key) => (
              <div key={key}>
                <dt>{rightLabels[key]}</dt>
                <dd>{rightStatusLabels[sourceRights[key]]}</dd>
              </div>
            ))}
            {sourceRights?.expiresOn && (
              <div>
                <dt>Grant expiration in UTC</dt>
                <dd><time dateTime={sourceRights.expiresOn}>{sourceRights.expiresOn}</time></dd>
              </div>
            )}
            {providerVerification && <>
              <div>
                <dt>Provider key SHA-256</dt>
                <dd>{providerVerification.keySha256}</dd>
              </div>
              <div>
                <dt>Provider CSV SHA-256</dt>
                <dd>{providerVerification.csvSha256}</dd>
              </div>
            </>}
          </dl>
        )}
        {offlineUpdate && (
          <p className="workspace-notice" role="status">
            Update ready. Close all MarketWeft tabs and reopen this address.
          </p>
        )}
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
            dialog === 'backup'
              ? 'Workspace backup'
              : dialog === 'import'
                ? 'Import historical data'
                : dialog === 'list'
                  ? 'Manage watchlist'
                  : 'Indicator overlays'
          }
          close={() => {
            if (!inFlight.current) setDialog(null)
            else if (dialog === 'list' || dialog === 'indicators')
              dismissAfterSave.current = true
          }}
        >
          {dialog === 'backup' ? (
            <WorkspaceBackup
              core={core}
              samples={samples}
              catalog={catalog}
              snapshot={saved}
              restore={restore}
            />
          ) : dialog === 'import' ? (
            <ImportForm save={addImport} />
          ) : dialog === 'list' ? (
            <Library assets={assets} ws={ws} toggle={toggle} saving={saving} />
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
                      {k.toUpperCase()} · {primaryPeriods[k]} bars
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={ws[k]}
                    onChange={(e) => update({ ...ws, [k]: e.target.checked })}
                  />
                </label>
              ))}
              <IndicatorPeriods label="Primary chart periods" periods={primaryPeriods} saving={saving}
                key={`primary:${primaryPeriods.sma}:${primaryPeriods.ema}`}
                onApply={periods => setPeriods('primary', periods)} />
              {STUDY_KINDS.map(kind => {
                const settings = primaryStudies[kind] ?? defaultStudySettings(kind)
                return <StudyControls key={`primary-${kind}:${JSON.stringify(settings)}`}
                  kind={kind} label={'Primary chart ' + STUDIES[kind].name} settings={settings} saving={saving}
                  onApply={value => setStudy('primary', kind, value)} />
              })}
              {comparison && <>
                <IndicatorPeriods label="Comparison chart periods" periods={comparisonPeriods} saving={saving}
                  key={`comparison:${comparisonPeriods.sma}:${comparisonPeriods.ema}`}
                  onApply={periods => setPeriods('comparison', periods)} />
                {STUDY_KINDS.map(kind => {
                  const settings = comparisonStudies[kind] ?? defaultStudySettings(kind)
                  return <StudyControls key={`comparison-${kind}:${JSON.stringify(settings)}`}
                    kind={kind} label={'Comparison chart ' + STUDIES[kind].name} settings={settings} saving={saving}
                    onApply={value => setStudy('comparison', kind, value)} />
                })}
              </>}
            </>
          )}
          {(dialog === 'list' || dialog === 'indicators') && (
            <>
              {saving && (
                <p className="intro" role="status">
                  Saving preferences…
                </p>
              )}
              {saveError && (
                <p className="error" role="alert">
                  {saveError}
                </p>
              )}
            </>
          )}
        </Dialog>
      )}
    </>
  )
}
