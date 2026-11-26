import { useState } from 'react'
import type { SeriesMetadata } from './catalog-schema'
import { chartCsv } from './chart-export'
import type { BarRange, ExportOverlay, TimeframeView } from './chart-export'
import { downloadFile } from './download'
import type { Asset } from './workspace'

export function ChartExport({ asset, visible, metadata, overlays, timeframe }: {
  asset: Asset
  visible: BarRange
  metadata?: SeriesMetadata
  overlays: ExportOverlay[]
  timeframe?: TimeframeView
}) {
  const [range, setRange] = useState('visible')
  const [format, setFormat] = useState('bars')
  const [error, setError] = useState('')
  function download() {
    const interval = range === 'visible' ? visible : { start: 0, end: asset.bars.length }
    const analysis = format === 'analysis' ? { metadata, overlays, timeframe } : undefined
    const identity = (asset.venue + '-' + asset.symbol).replace(/[^A-Za-z0-9_.-]/g, '_')
    const intervalName = timeframe ? '-' + timeframe.targetSeconds + 's' : ''
    setError('')
    try {
      const csv = chartCsv(asset, interval, analysis)
      downloadFile(identity + intervalName + '-' + range + '-' + format + '.csv',
        new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not export chart data.')
    }
  }
  return (
    <details className="chart-export">
      <summary>Export CSV</summary>
      <form aria-label="Chart CSV options" onSubmit={event => {
        event.preventDefault()
        download()
      }}>
        <label>Range
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="visible">Visible bars ({visible.end - visible.start})</option>
            <option value="all">All bars ({asset.bars.length})</option>
          </select>
        </label>
        <label>Contents
          <select value={format} onChange={event => setFormat(event.target.value)}>
            <option value="bars">OHLCV bars for reimport</option>
            <option value="analysis">Bars, provenance and enabled indicators</option>
          </select>
        </label>
        <button className="outline" type="submit">Download CSV</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  )
}
