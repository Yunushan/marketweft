import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BacktestConfig, FormulaWalkFold, FormulaWalkQuery, FormulaWalkScore, MarketCore } from './market-core'
import { BacktestReceiptTable, backtestEvidenceRows } from './RecordedTradeReplay'
import type { BacktestBook } from './RecordedTradeReplay'
import { quoteText } from './chart-export'
import { downloadFile } from './download'
import { fixed } from './fixed-point'
import { MAX_STRATEGY_PACKAGE_BYTES, parseFormulaStrategy } from './formula-strategy'
import { utc } from './workspace'
import sampleTrades from '../../../crates/core/tests/fixtures/synthetic-backtest-trades.csv?raw'

type Candidate = FormulaWalkQuery['candidates'][number]
type DraftCandidate = Candidate & { key: number; packageName?: string }
type Source = { name: string; csv: string }
type Search = { source: string; query: FormulaWalkQuery; folds: FormulaWalkFold[] }
const limit = 16
const initialCandidates = [
  { key: 1, id: 'Late', entry: 'close >= 13', exit: 'close <= 10' },
  { key: 2, id: 'Rising', entry: 'close > lag(close, 1)', exit: 'close <= 10' },
]
const money = (amount: bigint) => fixed(amount, 6)

function scoreFields(score: FormulaWalkScore) {
  return [money(score.equity), money(score.drawdown), money(score.turnover), money(score.fees),
    score.fills, score.unavailableConditions]
}

function exportSearch(book: BacktestBook, { source, query, folds }: Search) {
  const { effective, known, trainingBars, testBars, config, candidates } = query
  const { paper, targetShares, participation, slippage, limitBuffer, maxWait } = config
  const common = [book.title, source, book.instrument, effective, known, book.interval, trainingBars, testBars,
    targetShares, participation, slippage, limitBuffer, maxWait, paper.startingCash, paper.positionLimit,
    paper.exposureLimit, paper.feePerShare, paper.feePerOrder].map(value => quoteText(String(value)))
  const formulas = new Map(candidates.map(candidate => [candidate.id, candidate]))
  const hasLibraries = candidates.some(candidate => candidate.functions?.length)
  const libraryColumn = hasLibraries ? [''] : []
  const blank = (size: number) => Array<string>(size).fill('')
  const header = 'history_source,execution_source,instrument,effective_through_utc,known_through_utc,interval_seconds,training_bars,test_bars,target_shares,participation_bps,slippage_bps,limit_buffer_bps,max_wait_bars,starting_cash,position_limit,committed_cost_limit,fee_per_share,fee_per_order,fold,training_start_utc,training_end_utc,test_start_utc,test_end_utc,language_version,row,strategy_id,entry_formula,exit_formula,score_equity,score_drawdown,turnover,fees,accepted_fills,unavailable_conditions,ledger_row,observed_utc,event_id,order_id,source_id,execution_utc,action,status,shares,price,fee,cash_change,cash,reserved,equity,drawdown,bar_index,entry_value,exit_value,decision'
  const rows = folds.flatMap((fold, index) => {
    const prefix = [...common, index + 1, utc(fold.trainingStart), utc(fold.trainingEnd),
      utc(fold.testStart), utc(fold.testEnd), fold.report.version]
    const strategy = (id: string) => {
      const candidate = formulas.get(id)!
      return [id, candidate.entry, candidate.exit].map(quoteText)
    }
    const winner = strategy(fold.testScore.id)
    return [
      ...fold.scores.map(score => {
        const functions = index === 0 ? formulas.get(score.id)?.functions : undefined
        const evidence = functions?.length ? [quoteText(JSON.stringify(functions))] : libraryColumn
        return [...prefix, 'training', ...strategy(score.id), ...scoreFields(score), ...blank(20), ...evidence]
      }),
      [...prefix, 'test', ...winner, ...scoreFields(fold.testScore), ...blank(20), ...libraryColumn],
      ...backtestEvidenceRows(fold.report.backtest).map(row =>
        [...prefix, 'ledger', ...winner, ...blank(6), ...row, ...blank(4), ...libraryColumn]),
      ...fold.report.evaluations.map(row => [...prefix, 'evaluation', ...winner, ...blank(6), '', utc(row.at),
        ...blank(14), row.barIndex, row.entry === null ? '' : money(row.entry), row.exit === null ? '' : money(row.exit),
        row.decision ?? '', ...libraryColumn]),
    ]
  })
  const csv = [header + (hasLibraries ? ',function_library_json' : ''), ...rows.map(row => row.join(','))].join('\r\n') + '\r\n'
  downloadFile('formula-walk-forward.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

export function FormulaStrategyWalk({ core, book, config }: { core: MarketCore; book: BacktestBook; config: BacktestConfig }) {
  const lastBar = utc(book.times[book.times.length - 1])
  const [effective, setEffective] = useState(lastBar)
  const [known, setKnown] = useState(lastBar)
  const [trainingBars, setTrainingBars] = useState('6')
  const [testBars, setTestBars] = useState('2')
  const [recorded, setRecorded] = useState(false)
  const [tape, setTape] = useState<Source | null>(null)
  const [tradeFile, setTradeFile] = useState<File | null>(null)
  const [candidates, setCandidates] = useState<DraftCandidate[]>(initialCandidates)
  const [sequence, setSequence] = useState(3)
  const [packageFiles, setPackageFiles] = useState<File[]>([])
  const [search, setSearch] = useState<Search | null>(null)
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fold = search?.folds[selected]

  function append(formulas: Pick<DraftCandidate, 'entry' | 'exit' | 'functions' | 'packageName'>[]) {
    const ids = new Set(candidates.map(row => row.id.trim()))
    let next = sequence
    const added = formulas.map(item => {
      while (ids.has('Strategy-' + next)) next++
      const key = next++
      return { key, id: 'Strategy-' + key, ...item }
    })
    setCandidates([...candidates, ...added])
    setSequence(next)
  }

  async function addPackages() {
    setBusy(true)
    try {
      if (candidates.length + packageFiles.length > limit) throw new Error('Supply at most 16 formula candidates.')
      const decoder = new TextDecoder('utf-8', { fatal: true })
      const formulas = await Promise.all(packageFiles.map(async file => {
        if (file.size > MAX_STRATEGY_PACKAGE_BYTES) throw new Error('Formula strategy package exceeds 64 KiB.')
        const { entry, exit, functions } = parseFormulaStrategy(decoder.decode(await file.arrayBuffer()), core)
        return { entry, exit, functions, packageName: file.name }
      }))
      append(formulas)
      setPackageFiles([])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add formula strategy packages.')
    } finally {
      setBusy(false)
    }
  }

  function change(key: number, field: keyof Candidate, value: string) {
    setCandidates(candidates.map(row => row.key === key ? { ...row, [field]: value } : row))
  }

  async function run(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      let source = recorded ? tape : null
      if (recorded && tradeFile) {
        if (tradeFile.size > 8 * 1024 * 1024) throw new Error('Trade CSV exceeds 8 MiB.')
        source = { name: tradeFile.name, csv: new TextDecoder('utf-8', { fatal: true }).decode(await tradeFile.arrayBuffer()) }
      }
      if (recorded && !source?.csv.trim()) throw new Error('Supply recorded trades for trade execution.')
      const query = { effective: effective.trim(), known: known.trim(), trainingBars: Number(trainingBars),
        testBars: Number(testBars), config, candidates: candidates.map(({ id, entry, exit, functions }) =>
          ({ id: id.trim(), entry: entry.trim(), exit: exit.trim(), functions })) }
      const folds = core.formulaWalk(book.instrument, book.calendar, book.bars, source?.csv ?? '', book.interval, query)
      setSearch({ query, source: source?.name ?? 'Bar volume', folds })
      setSelected(0)
      if (recorded) {
        setTape(source)
        setTradeFile(null)
      }
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run formula walk-forward validation.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="side-card replay-panel research-details">
    <summary>Formula walk-forward validation</summary>
    <section aria-label="Formula walk-forward validation">
      <p>Rank candidates by training equity and test the winner on the following observed bars. Each test starts with the configured cash and an empty portfolio.</p>
      <div className="universe-query">
        <label>Candidate strategy packages
          <input key={sequence} type="file" accept=".json,application/json" multiple disabled={busy || candidates.length >= limit}
            onChange={event => setPackageFiles(Array.from(event.target.files ?? []))} />
        </label>
        <button type="button" className="outline" disabled={busy || !packageFiles.length || candidates.length >= limit}
          onClick={addPackages}>Add strategy packages</button>
      </div>
      <p>Packages supply candidate formulas and their functions. All candidates use the active backtest settings and the execution source below.</p>
      <form className="formula-form" onSubmit={run}>
        {candidates.map((row, index) => <fieldset key={row.key} disabled={busy} className="formula-form">
          <legend>Candidate {index + 1}{row.packageName && ' · ' + row.packageName}</legend>
          {row.functions?.length && <p className="formula-source">Functions {row.functions.map(item => item.name).join(', ')}</p>}
          <label>Strategy ID
            <input required maxLength={40} value={row.id} onChange={event => change(row.key, 'id', event.target.value)} />
          </label>
          <label>Entry formula
            <textarea required rows={2} maxLength={2048} spellCheck={false} value={row.entry}
              onChange={event => change(row.key, 'entry', event.target.value)} />
          </label>
          <label>Exit formula
            <textarea required rows={2} maxLength={2048} spellCheck={false} value={row.exit}
              onChange={event => change(row.key, 'exit', event.target.value)} />
          </label>
          <button type="button" className="outline" disabled={candidates.length <= 2}
            onClick={() => setCandidates(candidates.filter(candidate => candidate.key !== row.key))}>Remove candidate</button>
        </fieldset>)}
        <button type="button" className="outline" disabled={busy || candidates.length >= limit}
          onClick={() => { append([{ entry: '', exit: '' }]); setPackageFiles([]) }}>Add candidate</button>
        <div className="universe-query">
          <label>Validation effective cutoff (UTC)
            <input required disabled={busy} value={effective} onChange={event => setEffective(event.target.value)} />
          </label>
          <label>Validation known cutoff (UTC)
            <input required disabled={busy} value={known} onChange={event => setKnown(event.target.value)} />
          </label>
          <label>Training bars
            <input required type="number" min="2" max="5000" disabled={busy} value={trainingBars}
              onChange={event => setTrainingBars(event.target.value)} />
          </label>
          <label>Test bars
            <input required type="number" min="2" max="5000" disabled={busy} value={testBars}
              onChange={event => setTestBars(event.target.value)} />
          </label>
          <label>Validation execution source
            <select value={recorded ? 'trades' : 'bars'} disabled={busy} onChange={event => setRecorded(event.target.value === 'trades')}>
              <option value="bars">Bar volume</option><option value="trades">Recorded trades</option>
            </select>
          </label>
          {recorded && <label>Validation trades CSV
            <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => setTradeFile(event.target.files?.[0] ?? null)} />
          </label>}
          {recorded && book.demo && <button type="button" className="outline" disabled={busy} onClick={() => {
            setTape({ name: 'Synthetic execution trades', csv: sampleTrades })
            setTradeFile(null)
          }}>Use validation sample trades</button>}
          <button type="submit" className="outline" disabled={busy || recorded && !tradeFile && !tape}>Run formula walk-forward</button>
        </div>
      </form>
      {error && <p role="alert" className="warning">{error}</p>}
      {search && <p role="status">{search.folds.length} completed {search.folds.length === 1 ? 'fold' : 'folds'} · {search.source}</p>}
      {search && fold && <>
        <label>Completed formula fold
          <select value={selected} onChange={event => setSelected(Number(event.target.value))}>
            {search.folds.map((item, index) => <option key={item.testStart} value={index}>{utc(item.testStart)}</option>)}
          </select>
        </label>
        <dl className="replay-times">
          <div><dt>Training window (UTC)</dt><dd>{utc(fold.trainingStart)} to {utc(fold.trainingEnd)}</dd></div>
          <div><dt>Test window (UTC)</dt><dd>{utc(fold.testStart)} to {utc(fold.testEnd)}</dd></div>
          <div><dt>Selected strategy</dt><dd>{fold.testScore.id}</dd></div>
          <div><dt>Test cash</dt><dd>{money(fold.report.backtest.ledger.cash)}</dd></div>
        </dl>
        <div className="replay-table-scroll">
          <table className="universe-table" aria-label="Formula walk-forward scores">
            <thead><tr><th scope="col">Strategy</th><th scope="col">Equity</th><th scope="col">Drawdown</th>
              <th scope="col">Turnover</th><th scope="col">Fees</th><th scope="col">Fills</th><th scope="col">Unavailable conditions</th></tr></thead>
            <tbody>
              {fold.scores.map(score => <tr key={score.id}><th scope="row">Training {score.id}</th>
                {scoreFields(score).map((value, index) => <td key={index}>{value}</td>)}</tr>)}
              <tr><th scope="row">Test {fold.testScore.id}</th>
                {scoreFields(fold.testScore).map((value, index) => <td key={index}>{value}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <BacktestReceiptTable report={fold.report.backtest} label="Formula walk-forward test receipts" />
        <button type="button" className="outline" onClick={() => exportSearch(book, search)}>Download formula walk-forward</button>
      </>}
    </section>
  </details>
}
