import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import type { Book, BookPatch } from '../api/types'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { BookFields, bookFieldsToPatch, bookFieldsValuesFrom, checkBookFields } from './BookFields'
import buttons from './actionButtons.module.css'
import styles from './BookEditForm.module.css'

interface BookEditFormProps {
  book: Book
  /** Writes the change. */
  onSave: (patch: BookPatch) => Promise<unknown>
  /** Leaves edit mode — called after a successful save, and on Cancel. */
  onDone: () => void
}

/** Edit mode: the shared catalog, behind Save and Cancel. */
export function BookEditForm({ book, onSave, onDone }: BookEditFormProps) {
  const [values, setValues] = useState(bookFieldsValuesFrom(book))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return

    const problem = checkBookFields(values)
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(bookFieldsToPatch(values))
      onDone()
    } catch (caught) {
      setError(messageFor(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void save(event)}>
      <h2 className={styles.heading}>Edit Book</h2>

      <BookFields values={values} onChange={setValues} />

      {error && <ErrorBlock message={error} />}

      <div className={styles.footer}>
        <button
          type="button"
          className={`${buttons.outlined} ${buttons.small}`}
          onClick={onDone}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className={buttons.primary} disabled={saving}>
          Save
        </button>
      </div>
    </form>
  )
}
