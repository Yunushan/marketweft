import { useMemo, useState } from 'react'
import type { ComponentProps } from 'react'
import { Chart } from './Chart'
import type { TimeframeView } from './chart-export'
import type { MarketCore } from './market-core'

type Props = Omit<ComponentProps<typeof Chart>, 'sma' | 'ema' | 'timeframe'> & {
  core: MarketCore
  activeSma?: boolean
  activeEma?: boolean
}

export function TimeframeChart({ core, activeSma, activeEma, asset, periods, onTimestamp,
  ...chart }: Props) {
  const initialSource = asset.source === 'sample' ? '86400' : ''
  const [source, setSource] = useState(initialSource)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [rolled, setRolled] = useState<(TimeframeView & { sourceBars: typeof asset.bars }) | null>(null)
  const timeframe = rolled?.sourceBars === asset.bars ? rolled : undefined
  const display = useMemo(() => timeframe ?
    { ...asset, bars: timeframe.buckets.map(entry => entry.bar) } : asset, [asset, timeframe])
  const sma = useMemo(() => activeSma && periods ?
    core.indicator('sma', periods.sma, display.bars) : [], [core, activeSma, periods?.sma, display.bars])
  const ema = useMemo(() => activeEma && periods ?
    core.indicator('ema', periods.ema, display.bars) : [], [core, activeEma, periods?.ema, display.bars])

  function apply() {
    try {
      if (!/^\d+$/.test(source.trim()) || !/^\d+$/.test(target.trim())) {
        throw new Error('Enter both durations in whole seconds.')
      }
      const sourceSeconds = Number(source)
      const targetSeconds = Number(target)
      const buckets = core.aggregateTimeframe(asset.bars, sourceSeconds, targetSeconds)
      onTimestamp?.(null)
      setRolled({ sourceSeconds, targetSeconds, buckets, sourceBars: asset.bars })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not aggregate this timeframe.')
    }
  }

  return (
    <>
      <details className="chart-export timeframe-control">
        <summary>{timeframe ? 'Timeframe · ' + timeframe.targetSeconds + ' seconds' : 'Timeframe'}</summary>
        <form aria-label="Fixed-duration timeframe" onSubmit={event => {
          event.preventDefault()
          apply()
        }}>
          <label>Source interval (seconds)
            <input inputMode="numeric" value={source} onChange={event => setSource(event.target.value)} />
          </label>
          <label>Target interval (seconds)
            <input inputMode="numeric" value={target} onChange={event => setTarget(event.target.value)} />
          </label>
          <button className="outline" type="submit">Apply timeframe</button>
          {timeframe && <button className="outline" type="button" onClick={() => {
            setRolled(null)
            setError('')
            onTimestamp?.(null)
          }}>Show source bars</button>}
          {error && <p role="alert">{error}</p>}
        </form>
      </details>
      <Chart {...chart} key={timeframe ? `${timeframe.sourceSeconds}:${timeframe.targetSeconds}` : 'source'}
        asset={display} sma={sma} ema={ema} periods={periods}
        timeframe={timeframe} onTimestamp={onTimestamp} />
    </>
  )
}
