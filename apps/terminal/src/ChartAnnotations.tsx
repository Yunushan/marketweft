import { fixed } from './fixed-point'
import { useState } from 'react'
import {
  ANNOTATION_NAMES, fibonacciExtensions, fibonacciTimeZones, formatAnnotationAnchor, hasPointList, hasRange, hasTwoPoints, parseAnnotationAnchor, rangeBounds, rangeCoordinate, validateAnnotationGeometry, validateNoteText, validatePolyline, validateThreePoints,
} from './chart-annotations'
import type { AnnotationCoordinate, AnnotationKind, ChartAnnotation } from './chart-annotations'
import type { DrawingEndpoint, MarketCore, RiskRewardMeasurement, RiskRewardSide } from './market-core'

type PointFields = Record<AnnotationCoordinate, string>
type Draft = {
  kind: AnnotationKind
  points: PointFields[]
  offset: string
  text: string
  side: RiskRewardSide
  original?: ChartAnnotation
}

export type AnnotationPicker = { point: number; sourceTime?: boolean; accept: (anchor: DrawingEndpoint) => void }

function pointFields({ ticks, time }: DrawingEndpoint): PointFields {
  return { price: formatAnnotationAnchor('price', ticks), time: formatAnnotationAnchor('time', time) }
}

function pointValue(fields: PointFields): DrawingEndpoint {
  return { time: parseAnnotationAnchor('time', fields.time), ticks: parseAnnotationAnchor('price', fields.price) }
}

function draftAnnotation(draft: Draft, id: string, core: MarketCore): ChartAnnotation {
  const { kind, points } = draft
  if (kind === 'price') return { id, kind, ticks: parseAnnotationAnchor(kind, points[0].price) }
  if (kind === 'time' || kind === 'anchored-vwap')
    return { id, kind, time: parseAnnotationAnchor('time', points[0].time) }
  if (hasPointList(kind)) {
    const anchors = points.map(pointValue)
    if (kind !== 'polyline') {
      validateThreePoints(anchors, kind)
      return { id, kind, points: anchors }
    }
    validatePolyline(anchors)
    return { id, kind, points: anchors }
  }
  if (hasRange(kind)) {
    const coordinate = rangeCoordinate(kind)
    const [first, last] = points.map(point => parseAnnotationAnchor(coordinate, point[coordinate]))
    const [lower, upper] = kind === 'fibonacci-time-zones' ? [first, last] : [Math.min(first, last), Math.max(first, last)]
    return { id, kind, ...rangeBounds(kind, lower, upper) }
  }
  const start = pointValue(points[0])
  if (kind === 'ray') return { id, kind, start }
  if (kind === 'note') {
    validateNoteText(draft.text)
    return { id, kind, start, text: draft.text }
  }
  const end = pointValue(points[1])
  if (kind === 'risk-reward') {
    const stopTicks = parseAnnotationAnchor('price', points[2].price)
    const plan = { id, kind, start, end, stopTicks, side: draft.side } as const
    validateAnnotationGeometry(plan)
    core.measureRiskReward(plan.side, start.ticks, stopTicks, end.ticks)
    return plan
  }
  const annotation = kind === 'channel' ?
    { id, kind, start, end, offsetTicks: parseAnnotationAnchor('price', draft.offset) } :
    { id, kind, start, end }
  validateAnnotationGeometry(annotation)
  return annotation
}

function describePoint(point: DrawingEndpoint): string {
  const { time, price } = pointFields(point)
  return price + ' at ' + time
}

function describeAnnotation(entry: ChartAnnotation): string {
  const name = ANNOTATION_NAMES[entry.kind] + ' '
  switch (entry.kind) {
    case 'price': return name + formatAnnotationAnchor('price', entry.ticks)
    case 'time':
    case 'anchored-vwap': return name + formatAnnotationAnchor('time', entry.time)
    case 'price-range':
    case 'time-range':
    case 'regression-channel':
    case 'fibonacci-time-zones': {
      const coordinate = rangeCoordinate(entry.kind)
      return name + formatAnnotationAnchor(coordinate, entry.lower) + ' to ' + formatAnnotationAnchor(coordinate, entry.upper)
    }
    case 'ray': return name + describePoint(entry.start)
    case 'note': return name + entry.text + ', ' + describePoint(entry.start)
    case 'polyline':
      return name + entry.points.length + ' points, ' +
        describePoint(entry.points[0]) + ' to ' + describePoint(entry.points[entry.points.length - 1])
    case 'triangle':
    case 'pitchfork':
    case 'fibonacci-extension':
      return name + entry.points.map(describePoint).join(', ')
    case 'trend':
    case 'rectangle':
    case 'ellipse':
    case 'fibonacci':
    case 'arrow':
      return name + describePoint(entry.start) + ' to ' + describePoint(entry.end)
    case 'risk-reward':
      return name + entry.side + ' from ' + describePoint(entry.start) + ' to ' + describePoint(entry.end) +
        ', stop ' + formatAnnotationAnchor('price', entry.stopTicks)
    case 'channel':
      return name + describePoint(entry.start) + ' to ' + describePoint(entry.end) +
        ', offset ' + formatAnnotationAnchor('price', entry.offsetTicks)
  }
}

function PlanValues({ value }: { value: RiskRewardMeasurement }) {
  return <div className="ohlc chart-overlay-values" role="group" aria-label="Risk/reward values">
    <span><small>Risk</small> {fixed(value.riskTicks, 6)}</span>
    <span><small>Reward</small> {fixed(value.rewardTicks, 6)}</span>
    <span><small>Reward per unit of risk</small> {fixed(value.rewardPerRiskMicros, 6)}</span>
  </div>
}

export function ChartAnnotations({
  entries, busy, picking, setPicker, defaults, sourceDefaults, core, save,
}: {
  entries: readonly ChartAnnotation[]
  busy: boolean
  picking: number | null
  setPicker: (picker: AnnotationPicker | null) => void
  defaults: { prior: DrawingEndpoint; start: DrawingEndpoint; end: DrawingEndpoint }
  sourceDefaults: { start: number; end: number }
  core: MarketCore
  save: (before: ChartAnnotation | undefined, after: ChartAnnotation | undefined) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  function edit(kind: AnnotationKind, original?: ChartAnnotation) {
    setPicker(null)
    setError('')
    const points = hasPointList(kind) ?
      (original && 'points' in original ? original.points : [defaults.prior, defaults.start, defaults.end]).map(pointFields) :
      hasTwoPoints(kind) || hasRange(kind) ?
        [pointFields(defaults.start), pointFields(defaults.end)] : [pointFields(defaults.end)]
    if (kind === 'risk-reward') {
      points.push({ time: points[1].time, price: original?.kind === 'risk-reward' ?
        formatAnnotationAnchor('price', original.stopTicks) : '' })
    }
    if (kind === 'anchored-vwap') points[0].time = formatAnnotationAnchor('time', sourceDefaults.end)
    if (kind === 'regression-channel' || kind === 'fibonacci-time-zones') {
      points[0].time = formatAnnotationAnchor('time', sourceDefaults.start)
      points[1].time = formatAnnotationAnchor('time', sourceDefaults.end)
    }
    if (original?.kind === 'price') points[0].price = formatAnnotationAnchor('price', original.ticks)
    if (original?.kind === 'time' || original?.kind === 'anchored-vwap') points[0].time = formatAnnotationAnchor('time', original.time)
    if (original && hasRange(original.kind) && 'lower' in original) {
      const coordinate = rangeCoordinate(original.kind)
      points[0][coordinate] = formatAnnotationAnchor(coordinate, original.lower)
      points[1][coordinate] = formatAnnotationAnchor(coordinate, original.upper)
    }
    if (original && 'start' in original) points[0] = pointFields(original.start)
    if (original && 'end' in original) points[1] = pointFields(original.end)
    const offset = formatAnnotationAnchor('price', original?.kind === 'channel' ? original.offsetTicks : 1_000_000)
    const text = original?.kind === 'note' ? original.text : ''
    setDraft({ kind, original, points, offset, text, side: original?.kind === 'risk-reward' ? original.side : 'long' })
  }

  function cancel() {
    setPicker(null)
    setError('')
    setDraft(null)
  }

  async function commit(remove = false, original = draft?.original) {
    if (busy) return
    try {
      const next = !remove && draft ? draftAnnotation(draft, original?.id ?? crypto.randomUUID(), core) : undefined
      await save(original, next)
      cancel()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the chart drawing.')
    }
  }

  function pick(point: number) {
    if (!draft || picking === point) { setPicker(null); return }
    setPicker({ point, sourceTime: draft.kind === 'anchored-vwap' || draft.kind === 'regression-channel' ||
      draft.kind === 'fibonacci-extension' || draft.kind === 'fibonacci-time-zones', accept(anchor) {
      setError('')
      setDraft(current => current && {
        ...current, points: current.points.map((value, index) => index === point ? pointFields(anchor) : value),
      })
    } })
  }

  function changePoints(next: PointFields[]) {
    if (!draft) return
    setDraft({ ...draft, points: next })
    setPicker(null)
    setError('')
  }

  function pointEditor(point: number, current: Draft) {
    const { kind } = current
    const vertex = hasPointList(kind)
    const range = hasRange(kind)
    const twoPoints = range || hasTwoPoints(kind)
    const plan = kind === 'risk-reward'
    const label = plan ? ['Entry', 'Target', 'Stop'][point] :
      kind === 'fibonacci-extension' ? ['Move start', 'Move end', 'Projection anchor'][point] :
      vertex ? 'Point ' + (point + 1) :
      twoPoints ? point === 0 ? 'Start' : 'End' : ANNOTATION_NAMES[kind]
    const pickLabel = plan || vertex || twoPoints ? 'Pick ' + label.toLowerCase() + ' on chart' : 'Pick on chart'
    const coordinates: readonly AnnotationCoordinate[] = plan && point === 2 ? ['price'] : kind === 'price' || kind === 'time' || kind === 'anchored-vwap' ?
      [kind === 'price' ? 'price' : 'time'] : range ? [rangeCoordinate(kind)] : ['time', 'price']
    return <fieldset key={point}>
      <legend>{label}</legend>
      {coordinates.map(coordinate => <label key={coordinate}>{coordinate === 'price' ? 'Price' : 'Time (UTC)'}
        <input type="text" inputMode={coordinate === 'price' ? 'decimal' : undefined}
          spellCheck={false} value={current.points[point][coordinate]} disabled={busy}
          onChange={event => {
            const fields = { ...current.points[point], [coordinate]: event.target.value }
            setDraft({ ...current, points: current.points.map((value, index) => index === point ? fields : value) })
            setError('')
          }} />
      </label>)}
      <button type="button" aria-pressed={picking === point} disabled={busy} onClick={() => pick(point)}>
        {pickLabel}
      </button>
      {current.kind === 'polyline' && current.points.length > 3 && <button type="button" disabled={busy}
        onClick={() => changePoints(current.points.filter((_, index) => index !== point))}>
        Remove {label.toLowerCase()}
      </button>}
    </fieldset>
  }

  return (
    <section className="annotation-tools" aria-label="Chart drawings">
      {draft ? <form className="drawing-editor" aria-label={ANNOTATION_NAMES[draft.kind]}
        onSubmit={event => { event.preventDefault(); void commit() }}>
        {draft.kind === 'risk-reward' && <label>Direction
          <select value={draft.side} disabled={busy} onChange={event => {
            setDraft({ ...draft, side: event.target.value === 'short' ? 'short' : 'long' })
            setError('')
          }}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>}
        {draft.points.map((_, index) => pointEditor(index, draft))}
        {draft.kind === 'polyline' && <button type="button" disabled={busy}
          onClick={() => changePoints([...draft.points, pointFields(defaults.end)])}>Add point</button>}
        {draft.kind === 'note' && <fieldset>
          <legend>Label</legend>
          <label>Note text
            <input type="text" value={draft.text} disabled={busy}
              onChange={event => { setDraft({ ...draft, text: event.target.value }); setError('') }} />
          </label>
        </fieldset>}
        {draft.kind === 'channel' && <fieldset>
          <legend>Parallel edge</legend>
          <label>Price offset
            <input type="text" inputMode="decimal" spellCheck={false} value={draft.offset} disabled={busy}
              onChange={event => { setDraft({ ...draft, offset: event.target.value }); setError('') }} />
          </label>
        </fieldset>}
        {picking !== null && <p role="status">Select a point in the price plot.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="drawing-buttons">
          <button type="submit" disabled={busy}>Save {ANNOTATION_NAMES[draft.kind].toLowerCase()}</button>
          <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      </form> : <>
        <div className="drawing-buttons">
          {(Object.keys(ANNOTATION_NAMES) as AnnotationKind[]).map(kind =>
            <button key={kind} type="button" disabled={busy} onClick={() => edit(kind)}>
              New {ANNOTATION_NAMES[kind].toLowerCase()}
            </button>
          )}
        </div>
        {entries.length > 0 && <ul className="annotation-list">
          {entries.map(entry => {
            const description = describeAnnotation(entry)
            return <li key={entry.id}>
              <span>{description}</span>
              {entry.kind === 'risk-reward' &&
                <PlanValues value={core.measureRiskReward(entry.side, entry.start.ticks, entry.stopTicks, entry.end.ticks)} />}
              {entry.kind === 'fibonacci-time-zones' && <details className="research-details">
                <summary>Projected times</summary>
                <div className="ohlc chart-overlay-values" role="group" aria-label="Fibonacci projected UTC times">
                  {fibonacciTimeZones(entry.lower, entry.upper).map(({ multiplier, time }) =>
                    <span key={multiplier}><small>{multiplier}×</small> {formatAnnotationAnchor('time', time)}</span>)}
                </div>
              </details>}
              {entry.kind === 'fibonacci-extension' && <details className="research-details">
                <summary>Projection levels</summary>
                <div className="ohlc chart-overlay-values" role="group" aria-label="Fibonacci extension levels">
                  {fibonacciExtensions(entry.points).map(level =>
                    <span key={level.label}><small>{level.label}</small> {fixed(level.ticks, 6)}</span>)}
                </div>
              </details>}
              <div className="drawing-buttons">
                <button type="button" aria-label={'Edit ' + description} disabled={busy}
                  onClick={() => edit(entry.kind, entry)}>Edit</button>
                <button type="button" aria-label={'Remove ' + description} disabled={busy}
                  onClick={() => void commit(true, entry)}>Remove</button>
              </div>
            </li>
          })}
        </ul>}
        {error && <p role="alert">{error}</p>}
      </>}
    </section>
  )
}
