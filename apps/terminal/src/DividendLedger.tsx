import { useMemo } from 'react'
import { dividendName } from './dividend-events'
import { utc } from './workspace'
import type { DividendEvent, DividendMovement } from './market-core'

const scale = 1_000_000n
const integer = new Intl.NumberFormat('en-US')
function money(ticks: bigint): string {
  const magnitude = ticks < 0n ? -ticks : ticks
  const decimals = String(magnitude % scale)
    .padStart(6, '0')
    .replace(/0+$/, '')
    .padEnd(2, '0')
  return (
    (ticks < 0n ? '−' : '') + integer.format(magnitude / scale) + '.' + decimals
  )
}

function through(events: readonly DividendEvent[], cutoff: number) {
  let low = 0
  let high = events.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (events[mid].at <= cutoff) low = mid + 1
    else high = mid
  }
  return low
}

export function DividendLedger({
  events,
  shares,
  cutoff,
  current,
}: {
  events: DividendEvent[]
  shares: number | null
  cutoff: number
  current: readonly DividendEvent[]
}) {
  const visible = through(events, cutoff)
  const { balances, postings, entitlements } = useMemo(() => {
    const balances = new Map<string, DividendMovement>()
    const entitlements = new Map<string, DividendEvent>()
    const postings: {
      at: number
      id: string
      currency: string
      delta: bigint
    }[] = []
    for (const event of events.slice(0, visible)) {
      if (shares === null) entitlements.set(event.id, event)
      for (const movement of event.movements) {
        balances.set(movement.currency, movement)
        if (movement.cashDelta !== 0n) {
          postings.push({
            at: event.at,
            id: event.id,
            currency: movement.currency,
            delta: movement.cashDelta,
          })
        }
      }
    }
    return {
      balances: Array.from(balances.values()).sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
      postings: postings.reverse(),
      entitlements: Array.from(entitlements.values()).sort((a, b) => a.id.localeCompare(b.id)),
    }
  }, [events, shares, visible])

  return (
    <section
      className="side-card replay-panel replay-results"
      aria-labelledby="dividend-ledger-heading"
    >
      <div className="replay-heading">
        <h2 id="dividend-ledger-heading">Dividend ledger</h2>
        <p>{shares === null ? 'Entitlement from dated positions' : integer.format(shares) + ' entitled shares per distribution'}</p>
      </div>
      {current.length > 0 && (
        <div className="dividend-reports">
          {current.map((event) => (
            <dl key={event.id} className="replay-times dividend-report">
              <div>
                <dt>Distribution</dt>
                <dd>
                  {event.id} · {dividendName[event.kind]}
                </dd>
              </div>
              <div>
                <dt>Amount per share</dt>
                <dd>
                  {event.currency} {money(event.amountPerShare)}
                </dd>
              </div>
              <div>
                <dt>Announced</dt>
                <dd>{utc(event.announcedAt)}</dd>
              </div>
              <div>
                <dt>Ex-date</dt>
                <dd>{utc(event.exAt)}</dd>
              </div>
              <div>
                <dt>Pay date</dt>
                <dd>{utc(event.payAt)}</dd>
              </div>
              <div>
                <dt>Report observed</dt>
                <dd>{utc(event.observedAt)}</dd>
              </div>
            </dl>
          ))}
        </div>
      )}
      {entitlements.length > 0 && (
        <div className="replay-table-scroll">
          <table aria-label="Dividend entitlements">
            <thead><tr><th scope="col">Distribution</th><th scope="col">Ex-date (UTC)</th>
              <th scope="col">Entitled shares</th></tr></thead>
            <tbody>{entitlements.map(row => (
              <tr key={row.id}>
                <th scope="row">{row.id}</th><td>{utc(row.exAt)}</td>
                <td>{row.entitledShares == null
                  ? cutoff < row.exAt ? 'Pending ex-date' : 'Unavailable'
                  : integer.format(row.entitledShares)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {balances.length > 0 ? (
        <div className="replay-table-scroll">
          <table aria-label="Dividend balances">
            <thead>
              <tr>
                <th scope="col">Currency</th>
                <th scope="col">Receivable</th>
                <th scope="col">Cash received</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <tr key={row.currency}>
                  <th scope="row">{row.currency}</th>
                  <td>{money(row.receivable)}</td>
                  <td>{money(row.cash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No dividend receivable or cash at this cutoff.</p>
      )}
      {postings.length > 0 && (
        <details>
          <summary>Cash postings ({postings.length})</summary>
          <div className="dividend-postings">
            <table aria-label="Dividend cash postings">
              <thead>
                <tr>
                  <th scope="col">Observed at</th>
                  <th scope="col">Distribution</th>
                  <th scope="col">Currency</th>
                  <th scope="col">Cash movement</th>
                </tr>
              </thead>
              <tbody>
                {postings.map((row) => (
                  <tr key={row.at + ':' + row.id + ':' + row.currency}>
                    <td>{utc(row.at)}</td>
                    <td>{row.id}</td>
                    <td>{row.currency}</td>
                    <td>{money(row.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
