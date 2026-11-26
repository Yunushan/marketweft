import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { FinancialIssuer, MarketCore, Multiple, Valuation } from './market-core'
import { Mark } from './Icons'
import { fixed } from './fixed-point'
import { utc } from './workspace'
import demoFilings from '../../../crates/core/tests/fixtures/synthetic-financial-filings.csv?raw'
import demoCaps from '../../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv?raw'

const capHeader = 'issuer_id,source_id,valuation_at,observed_at,currency,market_cap'
const missing = {
  'missing-filing': 'Filing not yet known',
  'missing-cap': 'Capitalization missing at valuation time',
  currency: 'Currencies differ',
  'missing-denominator': 'Denominator missing from filing',
  'nonpositive-denominator': 'Denominator is zero or negative',
}

type FinancialInputs = {
  filings: string
  caps: string
  source: string
  issuers: FinancialIssuer[]
  demo: boolean
}
type Query = { issuer: string; at: string; known: string }

function multiple(value: Multiple) {
  return value.kind === 'value' ? fixed(value.units, 6) + '×' : missing[value.kind]
}

function money(value: bigint | null, code: string) {
  if (value === null) return 'Missing'
  const [whole, fraction] = fixed(value, 6).split('.')
  return code + ' ' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '')
}

async function reportText(file: File) {
  if (file.size > 1024 * 1024) throw new Error('Each financial report CSV must fit within 1 MiB.')
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
}

export function FundamentalReplay({ core, close }: { core: MarketCore; close: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [filingsFile, setFilingsFile] = useState<File | null>(null)
  const [capsFile, setCapsFile] = useState<File | null>(null)
  const [inputs, setInputs] = useState<FinancialInputs | null>(null)
  const [draft, setDraft] = useState<Query>({ issuer: '', at: '', known: '' })
  const [result, setResult] = useState<{ query: Query; valuation: Valuation } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { heading.current?.focus() }, [])

  function run(book: FinancialInputs, query: Query) {
    const valuation = core.financialAsOf(book.filings, book.caps, query.issuer, query.at, query.known)
    setDraft(query)
    setResult({ query, valuation })
  }

  function start(filings: string, caps: string, source: string, demo = false) {
    const issuers = core.financialIndex(filings, caps)
    const book = { filings, caps, source, issuers, demo }
    const at = utc(issuers[0].suggestedAt)
    run(book, { issuer: issuers[0].id, at, known: at })
    setInputs(book)
  }

  function openDemo() {
    setError('')
    try {
      start(demoFilings, demoCaps, 'Synthetic annual filings and market capitalizations', true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the financial demo.')
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!filingsFile) return
    setBusy(true)
    setError('')
    try {
      const [filings, caps] = await Promise.all([
        reportText(filingsFile), capsFile ? reportText(capsFile) : capHeader,
      ])
      const source = capsFile ? filingsFile.name + ' · ' + capsFile.name : filingsFile.name
      start(filings, caps, source)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the financial reports.')
    } finally {
      setBusy(false)
    }
  }

  function apply(query: Query) {
    if (!inputs) return
    setError('')
    try {
      run(inputs, { ...query, at: query.at.trim(), known: query.known.trim() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not query this valuation.')
    }
  }

  const filing = result?.valuation.filing
  const cap = result?.valuation.marketCap
  return (
    <>
      <header className="app-header">
        <div className="app-brand"><Mark /><strong>MarketWeft</strong></div>
        <button className="outline" onClick={close}>Return to historical replay</button>
      </header>
      <main className="replay-page">
        <div className="page-head"><h1 ref={heading} tabIndex={-1}>Financial statements</h1></div>
        {!inputs || !result ? (
          <div className="replay-setup">
            <section className="side-card replay-panel">
              <h2>Financial statements demo</h2>
              <p>Follow annual results through a delayed restatement and compare valuation multiples.</p>
              <button className="primary" disabled={busy} onClick={openDemo}>Start financial demo</button>
            </section>
            <form className="side-card replay-panel" onSubmit={load}>
              <h2>Open financial reports</h2>
              <label>Annual filings CSV
                <input type="file" accept=".csv,text/csv" required disabled={busy}
                  onChange={(event) => setFilingsFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>Capitalization CSV (optional)
                <input type="file" accept=".csv,text/csv" disabled={busy}
                  onChange={(event) => setCapsFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="primary" disabled={busy || !filingsFile}>Load financial reports</button>
            </form>
          </div>
        ) : (
          <>
            <section className="side-card replay-panel">
              <div className="replay-heading">
                <div><h2>Historical valuation</h2><p>{inputs.source}</p></div>
                <button className="outline" onClick={() => {
                  setInputs(null)
                  setResult(null)
                  setFilingsFile(null)
                  setCapsFile(null)
                  setError('')
                  heading.current?.focus()
                }}>Change reports</button>
              </div>
              <form className="universe-query" onSubmit={(event) => {
                event.preventDefault()
                apply(draft)
              }}>
                <label>Issuer
                  <select value={draft.issuer} onChange={(event) => {
                    const issuer = inputs.issuers.find((item) => item.id === event.target.value)
                    if (issuer) setDraft({ issuer: issuer.id, at: utc(issuer.suggestedAt), known: draft.known })
                  }}>
                    {inputs.issuers.map((issuer) => <option key={issuer.id}>{issuer.id}</option>)}
                  </select>
                </label>
                <label>Valuation time (UTC)
                  <input required value={draft.at} spellCheck={false} autoComplete="off"
                    onChange={(event) => setDraft({ ...draft, at: event.target.value })} />
                </label>
                <label>Known time (UTC)
                  <input required value={draft.known} spellCheck={false} autoComplete="off"
                    onChange={(event) => setDraft({ ...draft, known: event.target.value })} />
                </label>
                <button className="primary">Run valuation query</button>
              </form>
              {inputs.demo && (
                <div className="replay-controls">
                  {[
                    ['Original filing', '14:01:00'],
                    ['Restatement observed', '14:20:00'],
                    ['Revised capitalization', '14:35:00'],
                  ].map(([label, t]) => (
                    <button className="outline" key={t} onClick={() =>
                      apply({ issuer: 'DEMO-ALFA', at: '2025-04-03T14:00:00Z', known: '2025-04-03T' + t + 'Z' })
                    }>{label}</button>
                  ))}
                </div>
              )}
            </section>
            <section className="side-card replay-panel replay-results" aria-labelledby="valuation-results">
              <h2 id="valuation-results">Valuation results</h2>
              <p role="status">{result.query.issuer} · Valuation {result.query.at} · Known through {result.query.known}</p>
              <dl className="replay-times">
                <div><dt>Price / earnings</dt><dd>{multiple(result.valuation.priceEarnings)}</dd></div>
                <div><dt>Price / sales</dt><dd>{multiple(result.valuation.priceSales)}</dd></div>
                <div><dt>Price / book</dt><dd>{multiple(result.valuation.priceBook)}</dd></div>
              </dl>
              <h3>Annual financial filing</h3>
              {filing ? (
                <dl className="replay-times">
                  <div><dt>Source filing</dt><dd>{filing.sourceId}</dd></div>
                  <div><dt>Fiscal period</dt><dd>{utc(filing.fiscalStart).slice(0, 10)} to {utc(filing.fiscalEnd).slice(0, 10)}</dd></div>
                  <div><dt>Published</dt><dd>{utc(filing.publishedAt)}</dd></div>
                  <div><dt>Observed</dt><dd>{utc(filing.observedAt)}</dd></div>
                  <div><dt>Filing currency</dt><dd>{filing.currency}</dd></div>
                  <div><dt>Revenue</dt><dd>{money(filing.revenue, filing.currency)}</dd></div>
                  <div><dt>Common net income</dt><dd>{money(filing.commonNetIncome, filing.currency)}</dd></div>
                  <div><dt>Common equity</dt><dd>{money(filing.commonEquity, filing.currency)}</dd></div>
                  <div><dt>Operating cash flow</dt><dd>{money(filing.operatingCashFlow, filing.currency)}</dd></div>
                </dl>
              ) : <p>No annual filing was available at these cutoffs.</p>}
              <h3>Market capitalization</h3>
              {cap ? (
                <dl className="replay-times">
                  <div><dt>Source observation</dt><dd>{cap.sourceId}</dd></div>
                  <div><dt>Capitalization</dt><dd>{money(cap.ticks, cap.currency)}</dd></div>
                  <div><dt>Valued at</dt><dd>{utc(cap.at)}</dd></div>
                  <div><dt>Observed</dt><dd>{utc(cap.observedAt)}</dd></div>
                </dl>
              ) : <p>No known capitalization at the exact valuation time.</p>}
            </section>
          </>
        )}
        {error && <p className="warning replay-error" role="alert">{error}</p>}
      </main>
    </>
  )
}
