import { useState } from 'react'
import {
  ANNOTATION_NAMES, formatAnnotationAnchor, hasTwoPoints, parseAnnotationAnchor, validateAnnotationGeometry,
} from './chart-annotations'
import type { AnnotationCoordinate, AnnotationKind, ChartAnnotation } from './chart-annotations'
import type { DrawingEndpoint } from './market-core'

type Point = 'start' | 'end'
type PointFields = Record<AnnotationCoordinate, string>
type Draft = {
  kind: AnnotationKind
  points: Record<Point, PointFields>
  offset: string
  original?: ChartAnnotation
}

export type AnnotationPicker = { point: Point; accept: (anchor: DrawingEndpoint) => void }

function pointFields({ ticks, time }: DrawingEndpoint): PointFields {
  return { price: formatAnnotationAnchor('price', ticks), time: formatAnnotationAnchor('time', time) }
}

function pointValue(fields: PointFields): DrawingEndpoint {
  return { time: parseAnnotationAnchor('time', fields.time), ticks: parseAnnotationAnchor('price', fields.price) }
}

function draftAnnotation(draft: Draft, id: string): ChartAnnotation {
  const { kind, points } = draft
  if (kind === 'price') return { id, kind, ticks: parseAnnotationAnchor(kind, points.start.price) }
  if (kind === 'time') return { id, kind, time: parseAnnotationAnchor(kind, points.start.time) }
  const start = pointValue(points.start)
  if (kind === 'ray') return { id, kind, start }
  const end = pointValue(points.end)
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
    case 'trend':
    case 'rectangle':
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
  picking: Point | null
  setPicker: (picker: AnnotationPicker | null) => void
  defaults: Record<Point, DrawingEndpoint>
  save: (before: ChartAnnotation | undefined, after: ChartAnnotation | undefined) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  function edit(kind: AnnotationKind, original?: ChartAnnotation) {
    setPicker(null)
    setError('')
    const points = { start: pointFields(hasTwoPoints(kind) ? defaults.start : defaults.end), end: pointFields(defaults.end) }
    if (original?.kind === 'price') points.start.price = formatAnnotationAnchor('price', original.ticks)
    if (original?.kind === 'time') points.start.time = formatAnnotationAnchor('time', original.time)
    if (original && 'start' in original) points.start = pointFields(original.start)
    if (original && 'end' in original) points.end = pointFields(original.end)
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

  function pick(point: Point) {
    if (!draft || picking === point) { setPicker(null); return }
    setPicker({ point, accept(anchor) {
      setError('')
      setDraft(current => current && { ...current, points: { ...current.points, [point]: pointFields(anchor) } })
    } })
  }

  function pointEditor(point: Point, current: Draft) {
    const outerLabel = point === 'start' ? 'Start' : 'End'
    const twoPoints = hasTwoPoints(current.kind)
    const coordinates: readonly AnnotationCoordinate[] = current.kind === 'price' || current.kind === 'time' ?
      [current.kind] : ['time', 'price']
    return <fieldset key={point}>
      <legend>{twoPoints ? outerLabel : ANNOTATION_NAMES[current.kind]}</legend>
      {coordinates.map(coordinate => <label key={coordinate}>{coordinate === 'price' ? 'Price' : 'Time (UTC)'}
        <input type="text" inputMode={coordinate === 'price' ? 'decimal' : undefined}
          spellCheck={false} value={current.points[point][coordinate]} disabled={busy}
          onChange={event => {
            const fields = { ...current.points[point], [coordinate]: event.target.value }
            setDraft({ ...current, points: { ...current.points, [point]: fields } })
            setError('')
          }} />
      </label>)}
      <button type="button" aria-pressed={picking === point} disabled={busy} onClick={() => pick(point)}>
        {twoPoints ? 'Pick ' + point + ' on chart' : 'Pick on chart'}
      </button>
    </fieldset>
  }

  return (
    <section className="annotation-tools" aria-label="Chart drawings">
      {draft ? <form className="drawing-editor" aria-label={ANNOTATION_NAMES[draft.kind]}
        onSubmit={event => { event.preventDefault(); void commit() }}>
        {pointEditor('start', draft)}
        {hasTwoPoints(draft.kind) && pointEditor('end', draft)}
        {draft.kind === 'channel' && <fieldset>
          <legend>Parallel edge</legend>
          <label>Price offset
            <input type="text" inputMode="decimal" spellCheck={false} value={draft.offset} disabled={busy}
              onChange={event => { setDraft({ ...draft, offset: event.target.value }); setError('') }} />
          </label>
        </fieldset>}
        {picking && <p role="status">Select a point in the price plot.</p>}
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
