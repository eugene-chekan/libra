import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import type { Book, BookPatch } from '../api/types'
import { ErrorBlock } from '../widgets/ErrorBlock'
import buttons from './actionButtons.module.css'
import styles from './BookEditForm.module.css'

interface BookEditFormProps {
  book: Book
  /** Writes the change. Rejects with the reason, which is shown in the form. */
  onSave: (patch: BookPatch) => Promise<unknown>
  /** Leaves edit mode — called after a successful save, and on Cancel. */
  onDone: () => void
}

/**
 * Edit mode: the shared catalog, behind Save and Cancel.
 *
 * Deferred rather than immediate, unlike the rating and the shelf on the same
 * screen. Those are the reader's own; these are everyone's. A field that
 * rewrote the catalog for the whole household the moment it lost focus is the
 * wrong shape for a correction somebody may be halfway through typing — so
 * nothing is written until Save, and Cancel throws the lot away.
 *
 * Only an admin ever sees this: `PATCH /api/books/{id}` is admin-only, because
 * a title describes what every reader sees.
 *
 * **An emptied box clears the value.** The Flutter build treated a blank year
 * as "no change", which left no way at all to remove a wrong one. The boxes
 * arrive filled in, so emptying one is a deliberate act and is treated as one.
 * Title and author are the exception: the server does not accept them empty,
 * so the form refuses before sending rather than turning a typo into a 422.
 *
 * A save can still be refused for an admin, because the flag can be taken away
 * while the form is open: the server is the authority and the hidden button
 * was only ever a courtesy.
 */
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

/**
 * The one sentence to show, or null when the form is fit to send.
 *
 * The page bound repeats the server's own `ge=1`, which turns a confusing 422
 * into a sentence beside the box that caused it.
 */
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

/**
 * A blank box means "no value", which the server stores as null.
 *
 * `Number` rather than `parseInt`: the latter reads "19x5" as 19 and would
 * save a year the reader never typed.
 */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) ? value : null
}
