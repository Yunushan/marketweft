import { useState } from 'react'
import type { FormEvent } from 'react'
import { fixed, parsePriceSize } from './fixed-point'
import type { MarketCore } from './market-core'

type PluginResult = { name: string; digest: string; input: bigint; output: bigint }

export function ScalarPlugin({ core }: { core: MarketCore }) {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PluginResult | null>(null)
  const [error, setError] = useState('')

  async function run(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setResult(null)
    setError('')
    try {
      if (file.size > 64 * 1024) throw new Error('Scalar plugin exceeds 64 KiB.')
      const value = source.trim()
      const magnitude = parsePriceSize(value.replace(/^-/, ''))
      if (magnitude === null) throw new Error('Enter a signed number with up to six decimal places.')
      const input = value.startsWith('-') ? -magnitude : magnitude
      const bytes = await file.arrayBuffer()
      const output = core.evaluateScalarPlugin(new Uint8Array(bytes), input)
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
      const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
      setResult({ name: file.name, digest, input, output })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not evaluate the scalar plugin.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="research-details">
    <summary>Scalar Wasm plugin</summary>
    <form className="formula-form" aria-label="Scalar Wasm plugin" onSubmit={run}>
      <p>Run a local plugin on one signed decimal value. The plugin runs with fixed memory and execution limits.</p>
      <div className="universe-query">
        <label>WebAssembly module
          <input type="file" accept=".wasm,application/wasm" required disabled={busy}
            onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <label>Plugin input
          <input value={source} maxLength={21} required disabled={busy}
            onChange={event => setSource(event.target.value)} />
        </label>
        <button className="outline" disabled={busy || !file}>Run scalar plugin</button>
      </div>
      {error && <p role="alert" className="warning">{error}</p>}
      {result && <div role="status">
        <p>{result.name} transformed {fixed(result.input, 6)} to <strong>{fixed(result.output, 6)}</strong>.</p>
        <p className="formula-source">SHA-256 {result.digest}</p>
      </div>}
    </form>
  </details>
}
