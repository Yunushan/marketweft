export interface ImportPolicy {
  readonly maxBytes: number
  readonly maxBars: number
}

export function readImportPolicy(env: Record<string, string | undefined>): ImportPolicy {
  function limit(name: string, fallback: number, ceiling: number) {
    const value = env[name]
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(parsed) || parsed > ceiling) {
      throw new Error(`${name} must be a positive decimal integer from 1 through ${ceiling}.`)
    }
    return parsed
  }
  return {
    maxBytes: limit('VITE_MARKETWEFT_IMPORT_MAX_BYTES', 1_500_000, 8 * 1024 * 1024),
    maxBars: limit('VITE_MARKETWEFT_IMPORT_MAX_BARS', 100_000, 100_000),
  }
}

/** Reject excess rows before allocating a WASM output or materializing bars. */
export function checkImportRows(csv: string, policy: ImportPolicy) {
  let nonempty = 0
  let start = 0
  while (csv.charCodeAt(start) === 0xfeff) start++
  // Rust str::trim uses Unicode White_Space. Match it for blank CSV rows.
  const content = /[^\p{White_Space}]/u
  while (start < csv.length) {
    const newline = csv.indexOf('\n', start)
    const end = newline === -1 ? csv.length : newline
    if (content.test(csv.slice(start, end)) && ++nonempty > policy.maxBars + 1) {
      throw new Error(`A CSV may contain at most ${policy.maxBars.toLocaleString('en-US')} bars.`)
    }
    start = end + 1
  }
}
