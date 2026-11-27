import { useState } from 'react'
import {
  annotationAnchor, ANNOTATION_NAMES, formatAnnotationAnchor, makeAnnotation, parseAnnotationAnchor,
} from './chart-annotations'
import type { AnnotationKind, ChartAnnotation } from './chart-annotations'

type Draft = {
  kind: AnnotationKind
  value: string
  original?: ChartAnnotation
}

export type AnnotationPicker = { kind: AnnotationKind; accept: (anchor: number) => void }

export function ChartAnnotations({
  entries, busy, picking, setPicker, defaults, save,
}: {
  entries: readonly ChartAnnotation[]
  busy: boolean
  picking: boolean
  setPicker: (picker: AnnotationPicker | null) => void
  defaults: Record<AnnotationKind, number>
  save: (before: ChartAnnotation | undefined, after: ChartAnnotation | undefined) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  function edit(kind: AnnotationKind, original?: ChartAnnotation) {
    setPicker(null)
    setError('')
    setDraft({ kind, original, value: formatAnnotationAnchor(kind, original ? annotationAnchor(original) : defaults[kind]) })
  }

  function cancel() {
    setPicker(null)
    setError('')
    setDraft(null)
  }

  async function commit(remove = false, original = draft?.original) {
    if (busy) return
    try {
      const next = !remove && draft ? makeAnnotation(
        original?.id ?? crypto.randomUUID(), draft.kind, parseAnnotationAnchor(draft.kind, draft.value),
      ) : undefined
      await save(original, next)
      cancel()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the chart drawing.')
    }
  }

  function pick() {
    if (!draft || picking) { setPicker(null); return }
    const { kind } = draft
    setPicker({ kind, accept(anchor) {
      setError('')
      setDraft(current => current && { ...current, value: formatAnnotationAnchor(kind, anchor) })
    } })
  }

  return (
    <section className="annotation-tools" aria-label="Chart drawings">
      {draft ? <form className="drawing-editor" aria-label={ANNOTATION_NAMES[draft.kind]}
        onSubmit={event => { event.preventDefault(); void commit() }}>
        <fieldset>
          <legend>{ANNOTATION_NAMES[draft.kind]}</legend>
          <label>{draft.kind === 'price' ? 'Price' : 'Time (UTC)'}
            <input type="text" inputMode={draft.kind === 'price' ? 'decimal' : undefined}
              spellCheck={false} value={draft.value} disabled={busy}
              onChange={event => { setDraft({ ...draft, value: event.target.value }); setError('') }} />
          </label>
          <button type="button" aria-pressed={picking} disabled={busy} onClick={pick}>Pick on chart</button>
        </fieldset>
        {picking && <p role="status">Select a point in the price plot.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="drawing-buttons">
          <button type="submit" disabled={busy}>Save {ANNOTATION_NAMES[draft.kind].toLowerCase()}</button>
          <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      </form> : <>
        <div className="drawing-buttons">
          <button type="button" disabled={busy} onClick={() => edit('price')}>New price line</button>
          <button type="button" disabled={busy} onClick={() => edit('time')}>New time marker</button>
        </div>
        {entries.length > 0 && <ul className="annotation-list">
          {entries.map(entry => {
            const description = ANNOTATION_NAMES[entry.kind] + ' ' +
              formatAnnotationAnchor(entry.kind, annotationAnchor(entry))
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
