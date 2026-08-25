import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import type { Book, BookPatch } from '../api/types'
import { ErrorBlock } from '../widgets/ErrorBlock'
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
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [year, setYear] = useState(book.year?.toString() ?? '')
  const [pages, setPages] = useState(book.pages?.toString() ?? '')
  const [blurb, setBlurb] = useState(book.blurb ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return

    const problem = check({ title, author, year, pages })
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        author: author.trim(),
        year: numberOrNull(year),
        pages: numberOrNull(pages),
        blurb: blurb.trim() === '' ? null : blurb.trim(),
      })
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

      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Author</span>
        <input
          className={styles.input}
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
        />
      </label>

      <div className={styles.pair}>
        <label className={styles.field}>
          <span className={styles.label}>Year</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Pages</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Blurb</span>
        <textarea
          className={styles.textarea}
          rows={4}
          value={blurb}
          placeholder="A short description of what this book is about…"
          onChange={(event) => setBlurb(event.target.value)}
        />
      </label>

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

/** The one sentence to show, or null when the form is fit to send. */
function check({
  title,
  author,
  year,
  pages,
}: {
  title: string
  author: string
  year: string
  pages: string
}): string | null {
  if (title.trim() === '') return 'A book needs a title.'
  if (author.trim() === '') return 'A book needs an author. Use "Unknown" if nobody knows.'
  if (year.trim() !== '' && numberOrNull(year) === null) return 'The year has to be a number.'
  if (pages.trim() !== '') {
    const value = numberOrNull(pages)
    if (value === null || value < 1) return 'Pages has to be a whole number, 1 or more.'
  }
  return null
}

/** A blank box means "no value", which the server stores as null. */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) ? value : null
}
