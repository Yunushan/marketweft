import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BacktestConfig, MarketCore, ScenarioConfig, ScenarioReport } from './market-core'
import { fixed } from './fixed-point'
import { utc } from './workspace'

type Source = { bars: string; calendar: string; interval: number; instrument: string; times: number[] }

export function ScenarioReplay({ source, execution, core }: {
  source: Source; execution: BacktestConfig; core: MarketCore
}) {
  const [cutoff, setCutoff] = useState(() => utc(source.times[source.times.length - 1]))
  const [config, setConfig] = useState<ScenarioConfig>({ seed: '20250403', paths: '256', horizon: '8' })
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [error, setError] = useState('')

  function run(event: FormEvent) {
    event.preventDefault()
    try {
      setReport(core.scenarios(source.instrument, source.calendar, source.bars, source.interval,
        cutoff.trim(), execution, config))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run scenarios.')
    }
  }

  return (
    <section className="side-card replay-panel replay-results" aria-labelledby="scenario-title">
      <h2 id="scenario-title">Seeded scenarios</h2>
      <p>Replay the same strategy on sampled close moves and volumes from observations available by the cutoff.</p>
      <form className="universe-query" onSubmit={run}>
        <label>Scenario cutoff (UTC)
          <input required value={cutoff} onChange={event => setCutoff(event.target.value)} />
        </label>
        <label>Seed
          <input required inputMode="numeric" maxLength={20} value={config.seed}
            onChange={event => setConfig({ ...config, seed: event.target.value })} />
        </label>
        <label>Paths
          <input required type="number" min="1" max="10000" value={config.paths}
            onChange={event => setConfig({ ...config, paths: event.target.value })} />
        </label>
        <label>Moves per path
          <input required type="number" min="1" max="1000" value={config.horizon}
            onChange={event => setConfig({ ...config, horizon: event.target.value })} />
        </label>
        <button className="primary">Run seeded scenarios</button>
      </form>
      {error && <p role="alert" className="warning replay-error">{error}</p>}
      {report && (
        <>
          <p role="status">{report.paths.length} paths · Seed {report.seed.toString()} · Known through {utc(report.cutoff)}</p>
          <dl className="replay-times">
            <div><dt>Observed moves</dt><dd>{report.eligibleMoves}</dd></div>
            <div><dt>Moves per path</dt><dd>{report.horizon}</dd></div>
            <div><dt>Anchor (UTC)</dt><dd>{utc(report.anchor)}</dd></div>
            <div><dt>Ending below starting cash</dt><dd>{report.lossPaths} of {report.paths.length}</dd></div>
          </dl>
          <div className="replay-table-scroll">
            <table className="universe-table" aria-label="Scenario risk statistics">
              <thead><tr><th scope="col">Metric</th><th scope="col">Observed baseline</th>
                <th scope="col">5th percentile</th><th scope="col">Median</th><th scope="col">95th percentile</th></tr></thead>
              <tbody>{([
                ['Ending equity', 'endingEquity'], ['Maximum drawdown', 'maxDrawdown'], ['Maximum market exposure', 'maxExposure'],
              ] as const).map(([label, key]) => (
                <tr key={key}>
                  <th scope="row">{label}</th><td>{fixed(report.baseline[key], 6)}</td>
                  <td>{fixed(report[key].p05, 6)}</td><td>{fixed(report[key].p50, 6)}</td><td>{fixed(report[key].p95, 6)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
