import { useState } from 'react'
import type { OverlayPeriods } from './catalog-schema'
import { MAX_INDICATOR_PERIOD, validIndicatorPeriod } from './market-core'
import { extraStudyPeriods, EXTRA_STUDY_PERIODS, STUDIES, studyPeriodOrderError, validStudyPeriod } from './studies'
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
  const study = STUDIES[kind]
  const { name } = study
  const minPeriod = 'minPeriod' in study ? study.minPeriod : undefined
  const [enabled, setEnabled] = useState(settings.enabled)
  const [period, setPeriod] = useState(settings.period === undefined ? '' : String(settings.period))
  const extraPeriods = extraStudyPeriods(kind)
  const [extraValues, setExtraValues] = useState(() => Object.fromEntries(extraPeriods.map(key =>
    [key, String(settings[key] ?? EXTRA_STUDY_PERIODS[key].defaultPeriod)],
  )))
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="indicator-periods" aria-label={label} onSubmit={event => {
      event.preventDefault()
      const next: StudySettings = { enabled }
      if (minPeriod !== undefined) {
        const bars = Number(period)
        if (!/^\d+$/.test(period.trim()) || !validStudyPeriod(kind, bars)) {
          setError('period')
          return
        }
        next.period = bars
      }
      for (const key of extraPeriods) {
        const value = extraValues[key]
        const parsed = Number(value)
        if (!/^\d+$/.test(value.trim()) || !validIndicatorPeriod(parsed)) {
          setError('period')
          return
        }
        next[key] = parsed
      }
      const orderError = studyPeriodOrderError(kind, next)
      if (orderError) {
        setError(orderError)
        return
      }
      onApply(next)
    }}>
      <fieldset>
        <legend>{label}</legend>
        <label>Show {name}
          <input type="checkbox" checked={enabled} disabled={saving}
            onChange={event => setEnabled(event.target.checked)} />
        </label>
        {minPeriod !== undefined && <label>{'periodLabel' in study ? study.periodLabel : name} period (bars)
          <input type="text" inputMode="numeric" value={period} disabled={saving}
            onChange={event => { setPeriod(event.target.value); setError(null) }} />
        </label>}
        {extraPeriods.map(key => <label key={key}>{EXTRA_STUDY_PERIODS[key].label} period (bars)
          <input type="text" inputMode="numeric" value={extraValues[key]} disabled={saving}
            onChange={event => { setExtraValues({ ...extraValues, [key]: event.target.value }); setError(null) }} />
        </label>)}
        <button type="submit" disabled={saving}>Apply {name}</button>
        {error && <p role="alert">{error !== 'period' ? error : kind === 'macd' || kind === 'ppo' ?
          `Enter whole ${name} periods from 1 through 100,000 bars.` : kind === 'keltner' ?
          'Enter whole EMA and ATR periods from 1 through 100,000 bars.' : kind === 'stochastic' ?
          'Enter whole Stochastic periods from 1 through 100,000 bars.' :
          kind === 'stochastic_rsi' ? 'Enter a whole Wilder RSI period from 2 through 100,000 bars and other periods from 1 through 100,000 bars.' :
          kind === 'ultimate' ? 'Enter whole Ultimate Oscillator periods from 1 through 100,000 bars.' :
          `Enter a whole ${name} period from ${minPeriod} through 100,000 bars.`}</p>}
      </fieldset>
    </form>
  )
}
