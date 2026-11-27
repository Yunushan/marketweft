import { useState } from 'react'
import {
  ANNOTATION_NAMES, formatAnnotationAnchor, hasTwoPoints, parseAnnotationAnchor, validateAnnotationGeometry, validatePolyline, validateTriangle,
} from './chart-annotations'
import type { AnnotationCoordinate, AnnotationKind, ChartAnnotation } from './chart-annotations'
import type { DrawingEndpoint } from './market-core'

type PointFields = Record<AnnotationCoordinate, string>
type Draft = {
  kind: AnnotationKind
  points: PointFields[]
  offset: string
  original?: ChartAnnotation
}

export type AnnotationPicker = { point: number; accept: (anchor: DrawingEndpoint) => void }

function pointFields({ ticks, time }: DrawingEndpoint): PointFields {
  return { price: formatAnnotationAnchor('price', ticks), time: formatAnnotationAnchor('time', time) }
}

function pointValue(fields: PointFields): DrawingEndpoint {
  return { time: parseAnnotationAnchor('time', fields.time), ticks: parseAnnotationAnchor('price', fields.price) }
}

function draftAnnotation(draft: Draft, id: string): ChartAnnotation {
  const { kind, points } = draft
  if (kind === 'price') return { id, kind, ticks: parseAnnotationAnchor(kind, points[0].price) }
  if (kind === 'time') return { id, kind, time: parseAnnotationAnchor(kind, points[0].time) }
  if (kind === 'polyline' || kind === 'triangle') {
    const anchors = points.map(pointValue)
    if (kind === 'triangle') {
      validateTriangle(anchors)
      return { id, kind, points: anchors }
    }
    validatePolyline(anchors)
    return { id, kind, points: anchors }
  }
  const start = pointValue(points[0])
  if (kind === 'ray') return { id, kind, start }
  const end = pointValue(points[1])
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
    case 'time': return name + formatAnnotationAnchor('time', entry.time)
    case 'ray': return name + describePoint(entry.start)
    case 'polyline':
      return name + entry.points.length + ' points, ' +
        describePoint(entry.points[0]) + ' to ' + describePoint(entry.points[entry.points.length - 1])
    case 'triangle':
      return name + entry.points.map(describePoint).join(', ')
    case 'trend':
    case 'rectangle':
    case 'ellipse':
    case 'fibonacci':
      return name + describePoint(entry.start) + ' to ' + describePoint(entry.end)
    case 'channel':
      return name + describePoint(entry.start) + ' to ' + describePoint(entry.end) +
        ', offset ' + formatAnnotationAnchor('price', entry.offsetTicks)
  }
}

export function ChartAnnotations({
  entries, busy, picking, setPicker, defaults, save,
}: {
  entries: readonly ChartAnnotation[]
  busy: boolean
  picking: number | null
  setPicker: (picker: AnnotationPicker | null) => void
  defaults: { prior: DrawingEndpoint; start: DrawingEndpoint; end: DrawingEndpoint }
  save: (before: ChartAnnotation | undefined, after: ChartAnnotation | undefined) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  function edit(kind: AnnotationKind, original?: ChartAnnotation) {
    setPicker(null)
    setError('')
    const points = kind === 'polyline' || kind === 'triangle' ?
      (original && 'points' in original ? original.points : [defaults.prior, defaults.start, defaults.end]).map(pointFields) :
      hasTwoPoints(kind) ? [pointFields(defaults.start), pointFields(defaults.end)] : [pointFields(defaults.end)]
    if (original?.kind === 'price') points[0].price = formatAnnotationAnchor('price', original.ticks)
    if (original?.kind === 'time') points[0].time = formatAnnotationAnchor('time', original.time)
    if (original && 'start' in original) points[0] = pointFields(original.start)
    if (original && 'end' in original) points[1] = pointFields(original.end)
    const offset = formatAnnotationAnchor('price', original?.kind === 'channel' ? original.offsetTicks : 1_000_000)
    setDraft({ kind, original, points, offset })
  }

  function cancel() {
    setPicker(null)
    setError('')
    setDraft(null)
  }

  async function commit(remove = false, original = draft?.original) {
    if (busy) return
    try {
      const next = !remove && draft ? draftAnnotation(draft, original?.id ?? crypto.randomUUID()) : undefined
      await save(original, next)
      cancel()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the chart drawing.')
    }
  }

  function pick(point: number) {
    if (!draft || picking === point) { setPicker(null); return }
    setPicker({ point, accept(anchor) {
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
    const vertex = current.kind === 'polyline' || current.kind === 'triangle'
    const label = vertex ? 'Point ' + (point + 1) :
      hasTwoPoints(current.kind) ? point === 0 ? 'Start' : 'End' : ANNOTATION_NAMES[current.kind]
    const pickLabel = vertex || hasTwoPoints(current.kind) ? 'Pick ' + label.toLowerCase() + ' on chart' : 'Pick on chart'
    const coordinates: readonly AnnotationCoordinate[] = current.kind === 'price' || current.kind === 'time' ?
      [current.kind] : ['time', 'price']
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
        {draft.points.map((_, index) => pointEditor(index, draft))}
        {draft.kind === 'polyline' && <button type="button" disabled={busy}
          onClick={() => changePoints([...draft.points, pointFields(defaults.end)])}>Add point</button>}
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
