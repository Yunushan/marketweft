import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { quoteText } from './chart-export'
import { sourcePermissionRestriction, type SourceRights } from './catalog-schema'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { Mark } from './Icons'
import type { MarketCore, MonthlyClose, MonthlyReturn } from './market-core'
import { utc, type Asset } from './workspace'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthStatus(month: MonthlyReturn) {
  if (month.window === 'future') return 'Future'
  if (!month.current) return 'No close'
  if (!month.prior) return 'No prior close'
  if (month.prior.ticks === 0n) return 'Zero prior close'
  return 'Available'
}

function closeFields(close: MonthlyClose | null) {
  return close ? [utc(close.at), fixed(close.ticks, 6)] : ['', '']
}

export function MonthlyReturnsResearch({ core, asset, sourceLabel, sourceRights, close }: {
  core: MarketCore; asset: Asset; sourceLabel: string; sourceRights?: SourceRights; close: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const lastObserved = utc(asset.bars[asset.bars.length - 1].time)
  const [firstYear, setFirstYear] = useState(lastObserved.slice(0, 4))
  const [lastYear, setLastYear] = useState(lastObserved.slice(0, 4))
  const [through, setThrough] = useState(lastObserved)
  const [report, setReport] = useState<{ months: MonthlyReturn[]; cutoff: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { title.current?.focus() }, [])

  function run(event: FormEvent) {
    event.preventDefault()
    setReport(null)
    const restriction = sourcePermissionRestriction(sourceRights, 'automatedUse')
    if (restriction) {
      setError(restriction === 'permission'
        ? 'Monthly returns require granted automated-use permission.'
        : 'Monthly returns are unavailable because the source grant has expired.')
      return
    }
    try {
      const cutoff = through.trim()
      const second = Date.parse(cutoff) / 1000
      if (!Number.isSafeInteger(second) || utc(second) !== cutoff) {
        throw new Error('Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.')
      }
      const months = core.monthlyReturns(asset.bars, Number(firstYear), Number(lastYear), second)
      setReport({ months, cutoff })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not calculate monthly returns.')
    }
  }

  function download() {
    if (!report) return
    const restriction = sourcePermissionRestriction(sourceRights, 'redistribution')
    if (restriction) {
      setError(restriction === 'permission'
        ? 'Monthly returns CSV requires granted redistribution permission.'
        : 'Monthly returns CSV is unavailable because the source grant has expired.')
      return
    }
    const prefix = [asset.id, sourceLabel, report.cutoff].map(quoteText)
    const rows = report.months.map(month => [
      ...prefix, String(month.year).padStart(4, '0'), String(month.month).padStart(2, '0'), month.window,
      monthStatus(month).toLowerCase(), ...closeFields(month.prior), ...closeFields(month.current),
      month.percent === null ? '' : fixed(month.percent, 6),
    ].join(','))
    const header = 'instrument,source,known_through_utc,year,month,window,status,prior_close_utc,prior_close,close_utc,close,return_percent'
    downloadFile('monthly-returns.csv', new Blob([[header, ...rows].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
    setError('')
  }

  return <>
    <header className="app-header">
      <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
      <button className="outline" onClick={close}>Return to workspace</button>
    </header>
    <main className="replay-page">
      <div className="page-head"><h1 ref={title} tabIndex={-1}>Monthly returns calendar</h1></div>
      <section className="side-card replay-panel" aria-label="Calendar inputs">
        <h2>{asset.id}</h2>
        <p>Each return compares the last visible close of its UTC month with the last close of the preceding month.</p>
        <form className="universe-query" onSubmit={run}>
          <label>First year <input type="number" min="1" max="9999" required value={firstYear}
            onChange={event => setFirstYear(event.target.value)} /></label>
          <label>Last year <input type="number" min="1" max="9999" required value={lastYear}
            onChange={event => setLastYear(event.target.value)} /></label>
          <label>Observed through (UTC) <input required value={through}
            onChange={event => setThrough(event.target.value)} /></label>
          <button className="primary">Calculate monthly returns</button>
        </form>
        {error && <p role="alert" className="warning">{error}</p>}
      </section>
      {report && <section className="side-card replay-panel" aria-label="Monthly return results">
        <p role="status">{sourceLabel} · Observed through {report.cutoff}</p>
        <div className="replay-table-scroll" role="region" aria-label="Scrollable calendar" tabIndex={0}>
          <table className="universe-table monthly-returns" aria-label="Monthly returns by UTC calendar year">
            <thead><tr><th scope="col">Year</th>{MONTH_NAMES.map(month => <th scope="col" key={month}>{month}</th>)}</tr></thead>
            <tbody>{Array.from({ length: report.months.length / 12 }, (_, index) => {
              const months = report.months.slice(index * 12, index * 12 + 12)
              return <tr key={months[0].year}><th scope="row">{String(months[0].year).padStart(4, '0')}</th>
                {months.map(month => {
                  const value = month.percent
                  const sign = value === null || value === 0n ? undefined : value > 0n ? 'positive' : 'negative'
                  return <td key={month.month} data-return={sign}>
                    {value === null ? monthStatus(month) : `${value > 0n ? '+' : ''}${fixed(value, 6)}%`}
                    {month.window === 'month-to-date' && <small>Month to date</small>}
                  </td>
                })}
              </tr>
            })}</tbody>
          </table>
        </div>
        <button className="outline" onClick={download}>Download monthly returns CSV</button>
      </section>}
    </main>
  </>
}
