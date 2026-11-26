import { fixed } from './fixed-point'
import type { DrawingEndpoint, DrawingMeasurement } from './market-core'
import { utc } from './workspace'

export type EndpointName = 'start' | 'end'
type EndpointFields = { time: string; price: string }
export type DrawingFields = Record<EndpointName, EndpointFields>

export function endpointFields(point: DrawingEndpoint): EndpointFields {
  return { time: utc(point.time), price: fixed(BigInt(point.ticks), 6) }
}

export function parseEndpoint(fields: EndpointFields): DrawingEndpoint {
  const timestamp = fields.time.trim()
  const time = Date.parse(timestamp) / 1000
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp) ||
      !Number.isSafeInteger(time) || utc(time) !== timestamp) {
    throw Error('Enter endpoint times as YYYY-MM-DDTHH:MM:SSZ in UTC.')
  }
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(fields.price.trim())
  if (!match) throw Error('Enter endpoint prices with up to six decimal places.')
  const [, sign, whole, fraction = ''] = match
  const magnitude = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'))
  return { time, ticks: sign && magnitude ? -magnitude : magnitude }
}

export function MeasurementReadout({ measurement }: { measurement: DrawingMeasurement }) {
  const { elapsedSeconds, priceTicks, returnPctMicros } = measurement
  return (
    <dl className="measurement-readout" aria-label="Drawing measurement">
      <div><dt>Elapsed</dt><dd>{elapsedSeconds} s</dd></div>
      <div><dt>Price change</dt><dd>{fixed(priceTicks, 6)}</dd></div>
      <div><dt>Percent change</dt><dd>{returnPctMicros === null ? 'Unavailable' : fixed(returnPctMicros, 6) + '%'}</dd></div>
    </dl>
  )
}

export function DrawingEditor({
  fields, picking, error, saving, onChange, onPick, onSave, onCancel,
}: {
  fields: DrawingFields
  picking: EndpointName | null
  error: string
  saving: boolean
  onChange: (point: EndpointName, fields: EndpointFields) => void
  onPick: (point: EndpointName) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <form className="drawing-editor" aria-label="Measurement endpoints" onSubmit={event => {
      event.preventDefault()
      onSave()
    }}>
      {(['start', 'end'] as const).map(point => (
        <fieldset key={point}>
          <legend>{point === 'start' ? 'Start' : 'End'}</legend>
          <label>Time (UTC)
            <input type="text" value={fields[point].time} spellCheck={false}
              onChange={event => onChange(point, { ...fields[point], time: event.target.value })} />
          </label>
          <label>Price
            <input type="text" inputMode="decimal" value={fields[point].price}
              onChange={event => onChange(point, { ...fields[point], price: event.target.value })} />
          </label>
          <button type="button" aria-pressed={picking === point} onClick={() => onPick(point)}>
            Pick {point} on chart
          </button>
        </fieldset>
      ))}
      {picking && <p role="status">Select a point in the price plot for the {picking} endpoint.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="drawing-buttons">
        <button type="submit" disabled={saving}>Save measurement</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
