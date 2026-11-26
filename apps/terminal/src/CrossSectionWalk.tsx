import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { CrossSectionFold, CrossSectionScore, CrossSectionWalkConfig } from './market-core'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { utc } from './workspace'

type WalkProps = {
  calculate: (settings: CrossSectionWalkConfig) => CrossSectionFold[]
  metadata: readonly (readonly [string, string])[]
}

const initial = { trainingDecisions: '2', testDecisions: '2', candidates: '60:1,60:2' }
const money = (value: bigint | null) => value === null ? '' : fixed(value, 6)
const candidate = (score: CrossSectionScore) => `${score.lookbackSeconds}:${score.topListings}`

function exportFolds(folds: CrossSectionFold[], settings: CrossSectionWalkConfig, metadata: WalkProps['metadata']) {
  const header = [...metadata.map(([name]) => name), 'training_decisions', 'test_decisions',
    'training_from_utc', 'training_through_utc', 'test_from_utc', 'test_through_utc', 'phase',
    'rank', 'lookback_seconds', 'top_listings', 'equity', 'cash', 'turnover', 'fees',
    'accepted_fills', 'decisions', 'ranked_observations', 'missing_observations']
  const source = [...metadata.map(([, value]) => quoteText(value)), settings.trainingDecisions.trim(),
    settings.testDecisions.trim()]
  const values = (score: CrossSectionScore) => [score.lookbackSeconds, score.topListings,
    money(score.equity), money(score.cash), money(score.turnover), money(score.fees),
    score.acceptedFills, score.decisions, score.ranked, score.missing]
  const rows = folds.flatMap(fold => {
    const prefix = [...source, utc(fold.trainingFrom), utc(fold.trainingThrough), utc(fold.testFrom), utc(fold.testThrough)]
    return [
      ...fold.trainingScores.map((score, i) => [...prefix, 'training', i + 1, ...values(score)]),
      fold.testScore ? [...prefix, 'test', '', ...values(fold.testScore)]
        : [...prefix, 'no-test', ...Array<string>(11).fill('')],
    ]
  })
  downloadFile('cross-sectional-walk-forward.csv', new Blob([
    [header, ...rows].map(row => row.join(',')).join('\r\n') + '\r\n',
  ], { type: 'text/csv;charset=utf-8' }))
}

function Scores({ fold }: { fold: CrossSectionFold }) {
  const test = fold.testScore
  const equity = (score: CrossSectionScore) => money(score.equity) || 'Incomplete marks'
  return <>
    <dl className="replay-times">
      <div><dt>Training window</dt><dd>{utc(fold.trainingFrom)} to {utc(fold.trainingThrough)}</dd></div>
      <div><dt>Test window</dt><dd>{utc(fold.testFrom)} to {utc(fold.testThrough)}</dd></div>
      <div><dt>Selected candidate</dt><dd>{test ? candidate(test) : 'No marked candidate'}</dd></div>
      {test && <div><dt>Test equity</dt><dd>{equity(test)}</dd></div>}
      {test && <div><dt>Test turnover</dt><dd>{money(test.turnover)}</dd></div>}
    </dl>
    <div className="replay-table-scroll" tabIndex={0} role="region" aria-label="Scrollable walk-forward scores">
      <table className="universe-table" aria-label="Cross-sectional walk-forward scores">
        <thead><tr><th scope="col">Phase</th><th scope="col">Lookback seconds</th>
          <th scope="col">Top listings</th><th scope="col">Equity</th><th scope="col">Cash</th>
          <th scope="col">Turnover</th><th scope="col">Fees</th><th scope="col">Fills</th>
          <th scope="col">Ranked</th><th scope="col">Missing</th></tr></thead>
        <tbody>{[...fold.trainingScores, ...(test ? [test] : [])].map((score, i) => (
          <tr key={i}><th scope="row">{i < fold.trainingScores.length ? 'Training ' + (i + 1) : 'Test'}</th>
            <td>{score.lookbackSeconds}</td><td>{score.topListings}</td><td>{equity(score)}</td>
            <td>{money(score.cash)}</td><td>{money(score.turnover)}</td><td>{money(score.fees)}</td>
            <td>{score.acceptedFills}</td><td>{score.ranked}</td><td>{score.missing}</td></tr>
        ))}</tbody>
      </table>
    </div>
  </>
}

export function CrossSectionWalk({ calculate, metadata }: WalkProps) {
  const [draft, setDraft] = useState(initial)
  const [accepted, setAccepted] = useState<{ calculate: WalkProps['calculate'];
    settings: CrossSectionWalkConfig; folds: CrossSectionFold[] } | null>(null)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const result = useMemo(() => {
    if (!accepted) return null
    if (accepted.calculate === calculate) return { folds: accepted.folds }
    try {
      return { folds: calculate(accepted.settings) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not run walk-forward optimization.' }
    }
  }, [calculate, accepted])
  const folds = result?.folds
  const fold = folds?.[Math.min(selected, folds.length - 1)]

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      setAccepted({ calculate, settings: draft, folds: calculate(draft) })
      setSelected(0)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run walk-forward optimization.')
    }
  }

  return <details className="research-details">
    <summary>Cross-sectional walk-forward</summary>
    <section aria-label="Cross-sectional walk-forward">
      <form className="universe-query" onSubmit={submit}>
        <label>Training decisions
          <input type="number" min="2" max="512" required value={draft.trainingDecisions}
            onChange={event => setDraft({ ...draft, trainingDecisions: event.target.value })} />
        </label>
        <label>Test decisions
          <input type="number" min="2" max="512" required value={draft.testDecisions}
            onChange={event => setDraft({ ...draft, testDecisions: event.target.value })} />
        </label>
        <label>Candidates (lookback seconds:top listings)
          <input required value={draft.candidates}
            onChange={event => setDraft({ ...draft, candidates: event.target.value })} />
        </label>
        <button type="submit" className="outline">Run cross-sectional walk-forward</button>
      </form>
      {(error || result?.error) && <p className="warning" role="alert">{error || result?.error}</p>}
      {folds && <p role="status">{folds.length} completed {folds.length === 1 ? 'fold' : 'folds'}</p>}
      {folds && fold && accepted && <>
        <label>Completed cross-sectional fold
          <select value={Math.min(selected, folds.length - 1)} onChange={event => setSelected(Number(event.target.value))}>
            {folds.map((row, i) => <option key={row.testFrom} value={i}>{i + 1} · Test begins {utc(row.testFrom)}</option>)}
          </select>
        </label>
        <Scores fold={fold} />
        <button type="button" className="outline" onClick={() => exportFolds(folds, accepted.settings, metadata)}>
          Download cross-sectional walk-forward
        </button>
      </>}
    </section>
  </details>
}
