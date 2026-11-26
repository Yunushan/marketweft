import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { MarketCore, OptionReport, OptionSnapshot, OptionSource, OptionUnavailable } from './market-core'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoUnderlying from '../../../crates/core/tests/fixtures/synthetic-option-underlying.csv?raw'
import demoQuotes from '../../../crates/core/tests/fixtures/synthetic-option-exercise-quotes.csv?raw'

const statusText: Record<OptionUnavailable, string> = {
  expired: 'Expired',
  'stale-option': 'Stale option quote',
  'missing-bid-ask': 'Missing bid or ask',
  crossed: 'Crossed spread',
  'missing-underlying': 'Missing underlying',
  'stale-underlying': 'Stale underlying',
  'model-range': 'Input outside model range',
  'price-bounds': 'Midpoint outside model bounds',
  'unresolved-vol': 'Implied volatility unresolved',
  'american-volatility-required': 'American model needs a volatility input',
  'missing-contract': 'No contract observation at these cutoffs',
  'european-contract': 'Select an American contract',
}
const price = (value: bigint | null) => value === null ? '—' : fixed(value, 6)
const volatility = (value: number) => (value * 100).toFixed(2) + '%'
const metric = (value: number) => value.toFixed(6)

type Query = { effective: string; known: string; age: string }
type Dataset = OptionSource & { underlying: string; quotes: string; source: string; demo: boolean }

function AmericanPricing({ core, dataset, query, contracts }: {
  core: MarketCore
  dataset: Dataset
  query: Query
  contracts: OptionReport[]
}) {
  const [contract, setContract] = useState(contracts[0].id)
  const [annualVolatility, setAnnualVolatility] = useState('25')
  const [steps, setSteps] = useState('128')
  const [estimate, setEstimate] = useState<{ contract: string; value: number } | null>(null)
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    setEstimate(null)
    setError('')
    try {
      const value = core.americanOptionPrice(dataset.underlying, dataset.quotes, contract,
        query.effective, query.known, Number(query.age), Number(annualVolatility) / 100, Number(steps))
      if (typeof value === 'number') setEstimate({ contract, value })
      else setError(statusText[value])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not price the American option.')
    }
  }

  return <section className="side-card replay-panel" aria-labelledby="american-pricing-title">
    <h2 id="american-pricing-title">American exercise pricing</h2>
    <form className="universe-query" onSubmit={submit}>
      <label>American contract
        <select value={contract} onChange={event => {
          setContract(event.target.value)
          setEstimate(null)
          setError('')
        }}>
          {contracts.map(row => <option key={row.id}>{row.id}</option>)}
        </select>
      </label>
      <label>Annual volatility (%)
        <input required type="number" min="0" max="1000" step="any" value={annualVolatility}
          onChange={event => { setAnnualVolatility(event.target.value); setEstimate(null); setError('') }} />
      </label>
      <label>Lattice steps
        <input required type="number" min="1" max="256" step="1" value={steps}
          onChange={event => { setSteps(event.target.value); setEstimate(null); setError('') }} />
      </label>
      <button className="primary">Price American option</button>
    </form>
    {estimate && <p role="status">{estimate.contract} model price {metric(estimate.value)} {dataset.currency}</p>}
    {error && <p className="warning" role="alert">{error}</p>}
  </section>
}

function Surface({ rows }: { rows: OptionReport[] }) {
  const maturities = new Map<number, Map<bigint, { call: OptionReport[]; put: OptionReport[] }>>()
  for (const row of rows) {
    const strikes = maturities.get(row.expiration) ?? new Map()
    maturities.set(row.expiration, strikes)
    const quotes = strikes.get(row.strike) ?? { call: [], put: [] }
    strikes.set(row.strike, quotes)
    quotes[row.side].push(row)
  }
  return (
    <div className="option-surface">
      <p>Each cell shows an observed strike and expiry. A dash marks an unavailable implied volatility.</p>
      {[...maturities].map(([expiration, strikes]) => (
        <div className="replay-table-scroll" key={expiration}>
          <table className="universe-table">
            <caption>Expiry {utc(expiration)}</caption>
            <thead><tr><th scope="col">Strike</th><th scope="col">Call IV</th><th scope="col">Put IV</th></tr></thead>
            <tbody>
              {[...strikes].map(([strike, quotes]) => (
                <tr key={strike.toString()}>
                  <th scope="row">{price(strike)}</th>
                  {(['call', 'put'] as const).map(side => (
                    <td key={side} className="option-surface-points">
                      {quotes[side].length === 0 ? '—' : quotes[side].map(row => {
                        const iv = typeof row.result === 'string' ? null : row.result.volatility
                        const heat = iv === null ? '0%' : Math.min(90, 12 + iv * 140) + '%'
                        return <span key={row.id} style={{ '--option-heat': heat } as CSSProperties}>
                          {iv === null ? '—' : volatility(iv)} <small>{row.id}</small>
                        </span>
                      })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function OptionReplay({ core, close }: { core: MarketCore; close: () => void }) {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [result, setResult] = useState<{ query: Query; snapshot: OptionSnapshot } | null>(null)
  const [draft, setDraft] = useState<Query>({ effective: '', known: '', age: '300' })
  const [underlyingFile, setUnderlyingFile] = useState<File | null>(null)
  const [quotesFile, setQuotesFile] = useState<File | null>(null)
  const [showSurface, setShowSurface] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  function run(data: Dataset, input: Query) {
    const query = { effective: input.effective.trim(), known: input.known.trim(), age: input.age.trim() }
    if (!query.age) throw new Error('Enter a maximum quote age in seconds.')
    const snapshot = core.optionSnapshot(data.underlying, data.quotes, query.effective, query.known, Number(query.age))
    setDraft(query)
    setResult({ query, snapshot })
    setError('')
  }

  function start(underlying: string, quotes: string, source: string, demo = false) {
    const book = { ...core.optionIndex(underlying, quotes), underlying, quotes, source, demo }
    const at = demo ? '2025-04-03T14:00:00Z' : utc(book.firstObservedAt)
    run(book, { effective: at, known: at, age: '300' })
    setDataset(book)
  }

  function startDemo() {
    try {
      start(demoUnderlying, demoQuotes, 'Synthetic underlying and option quotes', true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the option demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!underlyingFile || !quotesFile) return
    setBusy(true)
    setError('')
    try {
      const read = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) throw new Error('Each option input CSV must fit within 2 MiB.')
        return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      }
      const [underlying, quotes] = await Promise.all([read(underlyingFile), read(quotesFile)])
      start(underlying, quotes, underlyingFile.name + ' · ' + quotesFile.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the option chain.')
    } finally {
      setBusy(false)
    }
  }

  function submit(query: Query) {
    if (!dataset) return
    try {
      run(dataset, query)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not query the option chain.')
    }
  }

  const underlying = result?.snapshot.underlying
  const american = result?.snapshot.options.filter(row => row.exerciseStyle === 'american') ?? []
  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Option chain</h1></div>
        {!dataset || !result ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Option chain demo</h2>
              <p>Compare observed quotes and Greeks across strikes and expiries.</p>
              <button className="primary" disabled={busy} onClick={startDemo}>Start option demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open option quotes</h2>
              <label>Underlying CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={event => setUnderlyingFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>Option quotes CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={event => setQuotesFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !underlyingFile || !quotesFile}>Load option chain</button>
            </form>
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div><h2>{dataset.instrument} · {dataset.currency}</h2><p>{dataset.source}</p></div>
                <button className="outline" onClick={() => {
                  setDataset(null)
                  setResult(null)
                  setUnderlyingFile(null)
                  setQuotesFile(null)
                  setShowSurface(false)
                  setError('')
                  heading.current?.focus()
                }}>Change chain</button>
              </div>
              <form className="universe-query" onSubmit={event => { event.preventDefault(); submit(draft) }}>
                <label>Effective time (UTC)
                  <input required value={draft.effective} spellCheck={false} autoComplete="off"
                    onChange={event => setDraft({ ...draft, effective: event.target.value })} />
                </label>
                <label>Known time (UTC)
                  <input required value={draft.known} spellCheck={false} autoComplete="off"
                    onChange={event => setDraft({ ...draft, known: event.target.value })} />
                </label>
                <label>Maximum quote age (seconds)
                  <input type="number" required min="0" max="4294967295" step="1" value={draft.age}
                    onChange={event => setDraft({ ...draft, age: event.target.value })} />
                </label>
                <button className="primary">Run option query</button>
              </form>
              {dataset.demo && (
                <div className="replay-controls">
                  {[
                    ['Before late quotes', '14:00:00'],
                    ['Late option quote', '14:02:00'],
                    ['Updated underlying', '14:03:00'],
                    ['Corrected spread', '14:04:00'],
                  ].map(([label, time]) => (
                    <button className="outline" key={time} onClick={() => submit({
                      effective: '2025-04-03T14:00:00Z', known: '2025-04-03T' + time + 'Z', age: '300',
                    })}>{label}</button>
                  ))}
                </div>
              )}
            </section>
            <section className="side-card replay-panel replay-results" aria-labelledby="option-results">
              <h2 id="option-results">Option snapshot</h2>
              <p role="status">Effective {result.query.effective} · Known {result.query.known} · Maximum age {result.query.age}s</p>
              {underlying ? (
                <dl className="replay-times">
                  <div><dt>Underlying spot</dt><dd>{price(underlying.spot)} {dataset.currency}</dd></div>
                  <div><dt>Continuous rate</dt><dd>{price(underlying.rate)}</dd></div>
                  <div><dt>Continuous dividend yield</dt><dd>{price(underlying.dividendYield)}</dd></div>
                  <div><dt>Underlying quoted</dt><dd>{utc(underlying.at)}</dd></div>
                  <div><dt>Underlying observed</dt><dd>{utc(underlying.observedAt)}</dd></div>
                </dl>
              ) : <p>No underlying observation at these cutoffs.</p>}
              {result.snapshot.options.length === 0 ? <p>No option quotes at these cutoffs.</p> : (
                <>
                  <div className="replay-table-scroll">
                    <table className="universe-table" aria-label="Option chain results">
                      <thead>
                        <tr>
                          {['Contract', 'Expiry UTC', 'Side', 'Exercise', 'Strike', 'Bid', 'Ask', 'IV', 'Delta', 'Gamma',
                            'Vega / point', 'Theta / day', 'Rho / point', 'Quoted UTC', 'Observed UTC'].map(name =>
                            <th scope="col" key={name}>{name}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {result.snapshot.options.map(row => (
                          <tr key={row.id}>
                            <th scope="row">{row.id}</th><td>{utc(row.expiration)}</td>
                            <td>{row.side}</td><td>{row.exerciseStyle}</td><td>{price(row.strike)}</td>
                            <td>{price(row.bid)}</td><td>{price(row.ask)}</td>
                            {typeof row.result === 'string' ? (
                              <td colSpan={6}>{statusText[row.result]}</td>
                            ) : (
                              <>
                                <td>{volatility(row.result.volatility)}</td>
                                <td>{metric(row.result.delta)}</td><td>{metric(row.result.gamma)}</td>
                                <td>{metric(row.result.vega)}</td><td>{metric(row.result.theta)}</td>
                                <td>{metric(row.result.rho)}</td>
                              </>
                            )}
                            <td>{utc(row.at)}</td><td>{utc(row.observedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details onToggle={event => setShowSurface(event.currentTarget.open)}>
                    <summary>Implied volatility surface</summary>
                    {showSurface && <Surface rows={result.snapshot.options} />}
                  </details>
                </>
              )}
            </section>
            {american.length > 0 && <AmericanPricing
              key={[result.query.effective, result.query.known, result.query.age].join('/')}
              core={core} dataset={dataset} query={result.query} contracts={american} />}
          </>
        )}
        {error && <p className="warning replay-error" role="alert">{error}</p>}
      </main>
    </>
  )
}
