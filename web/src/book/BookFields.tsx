import type { BookPatch } from '../api/types'
import styles from './BookFields.module.css'

/** Title, author, year, pages and blurb, as the text boxes hold them — every number a string. */
export interface BookFieldsValues {
  title: string
  author: string
  year: string
  pages: string
  blurb: string
}

interface BookFieldsProps {
  values: BookFieldsValues
  onChange: (values: BookFieldsValues) => void
  /** Shown rather than hidden, so a reader without edit rights can still see what was parsed. */
  disabled?: boolean
}

/** The shared catalog fields: title, author, year, pages, blurb. Used by `BookEditForm` and the
 *  Add Book confirmation step, so the fields and their validation live in one place. */
export function BookFields({ values, onChange, disabled = false }: BookFieldsProps) {
  function set<K extends keyof BookFieldsValues>(key: K, value: string) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          value={values.title}
          disabled={disabled}
          onChange={(event) => set('title', event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Author</span>
        <input
          className={styles.input}
          value={values.author}
          disabled={disabled}
          onChange={(event) => set('author', event.target.value)}
        />
      </label>

      <div className={styles.pair}>
        <label className={styles.field}>
          <span className={styles.label}>Year</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={values.year}
            disabled={disabled}
            onChange={(event) => set('year', event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Pages</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={values.pages}
            disabled={disabled}
            onChange={(event) => set('pages', event.target.value)}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Blurb</span>
        <textarea
          className={styles.textarea}
          rows={4}
          value={values.blurb}
          disabled={disabled}
          placeholder="A short description of what this book is about…"
          onChange={(event) => set('blurb', event.target.value)}
        />
      </label>
    </div>
  )
}

/** The one sentence to show, or null when the form is fit to send. */
export function checkBookFields({ title, author, year, pages }: BookFieldsValues): string | null {
  if (title.trim() === '') return 'A book needs a title.'
  if (author.trim() === '') return 'A book needs an author. Use "Unknown" if nobody knows.'
  if (year.trim() !== '' && numberOrNull(year) === null) return 'The year has to be a number.'
  if (pages.trim() !== '') {
    const value = numberOrNull(pages)
    if (value === null || value < 1) return 'Pages has to be a whole number, 1 or more.'
  }
  return null
}

/** Assumes {@link checkBookFields} already passed. */
export function bookFieldsToPatch(values: BookFieldsValues): BookPatch {
  return {
    title: values.title.trim(),
    author: values.author.trim(),
    year: numberOrNull(values.year),
    pages: numberOrNull(values.pages),
    blurb: values.blurb.trim() === '' ? null : values.blurb.trim(),
  }
}

/** The inverse of {@link bookFieldsToPatch}: a book's fields as the boxes should start out. */
export function bookFieldsValuesFrom(book: {
  title: string
  author: string
  year: number | null
  pages: number | null
  blurb: string | null
}): BookFieldsValues {
  return {
    title: book.title,
    author: book.author,
    year: book.year?.toString() ?? '',
    pages: book.pages?.toString() ?? '',
    blurb: book.blurb ?? '',
  }
}

/** A blank box means "no value", which the server stores as null. */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) ? value : null
}
