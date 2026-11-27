import { useState } from 'react'
import type { OverlayPeriods } from './catalog-schema'
import { MAX_INDICATOR_PERIOD, validIndicatorPeriod } from './market-core'
import { STUDIES, validStudyPeriod } from './studies'
import type { StudyKind, StudySettings } from './studies'

export function IndicatorPeriods({ label, periods, saving, onApply }: {
  label: string
  periods: OverlayPeriods
  saving: boolean
  onApply: (periods: OverlayPeriods) => void
}) {
  const [values, setValues] = useState({ sma: String(periods.sma), ema: String(periods.ema) })
  const [error, setError] = useState(false)
  return (
    <form className="indicator-periods" aria-label={label} onSubmit={event => {
      event.preventDefault()
      const next = { sma: Number(values.sma), ema: Number(values.ema) }
      if (!Object.values(values).every(value => /^\d+$/.test(value.trim())) ||
          !Object.values(next).every(validIndicatorPeriod)) {
        setError(true)
        return
      }
      onApply(next)
    }}>
      <fieldset>
        <legend>{label}</legend>
        {(['sma', 'ema'] as const).map(kind => (
          <label key={kind}>
            {kind.toUpperCase()} period (bars)
            <input type="text" inputMode="numeric" value={values[kind]} disabled={saving}
              onChange={event => {
                setValues({ ...values, [kind]: event.target.value })
                setError(false)
              }} />
          </label>
        ))}
        <button type="submit" disabled={saving}>Apply periods</button>
        {error && <p role="alert">Enter whole periods from 1 through {MAX_INDICATOR_PERIOD.toLocaleString('en-US')} bars.</p>}
      </fieldset>
    </form>
  )
}

export function StudyControls({ kind, label, settings, saving, onApply }: {
  kind: StudyKind
  label: string
  settings: StudySettings
  saving: boolean
  onApply: (settings: StudySettings) => void
}) {
  const { name, minPeriod } = STUDIES[kind]
  const [enabled, setEnabled] = useState(settings.enabled)
  const [period, setPeriod] = useState(String(settings.period))
  const [error, setError] = useState(false)
  return (
    <form className="indicator-periods" aria-label={label} onSubmit={event => {
      event.preventDefault()
      const bars = Number(period)
      if (!/^\d+$/.test(period.trim()) || !validStudyPeriod(kind, bars)) {
        setError(true)
        return
      }
      onApply({ enabled, period: bars })
    }}>
      <fieldset>
        <legend>{label}</legend>
        <label>Show {name}
          <input type="checkbox" checked={enabled} disabled={saving}
            onChange={event => setEnabled(event.target.checked)} />
        </label>
        <label>{name} period (bars)
          <input type="text" inputMode="numeric" value={period} disabled={saving}
            onChange={event => { setPeriod(event.target.value); setError(false) }} />
        </label>
        <button type="submit" disabled={saving}>Apply {name}</button>
        {error && <p role="alert">Enter a whole {name} period from {minPeriod} through 100,000 bars.</p>}
      </fieldset>
    </form>
  )
}
