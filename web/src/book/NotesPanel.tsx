import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import { Icon } from '../widgets/Icon'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { SkeletonDelay, SkeletonRows } from '../widgets/Skeleton'
import { useCreateNote, useDeleteNote, useNotes } from './useNotes'
import buttons from './actionButtons.module.css'
import styles from './NotesPanel.module.css'

/** Notes and highlights, against the real endpoints. */
export function NotesPanel({ bookId }: { bookId: number }) {
  const notes = useNotes(bookId)
  const create = useCreateNote(bookId)
  const remove = useDeleteNote(bookId)
  const [draft, setDraft] = useState('')

  function add(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || create.isPending) return
    create.mutate(
      { text },
      {
        onSuccess: () => setDraft(''),
      }
    )
  }

  const writeError = create.error ?? remove.error

  return (
    <section className={styles.panel} aria-labelledby="notes-label">
      <h2 className={styles.label} id="notes-label">
        Notes &amp; Highlights
      </h2>

      <form className={styles.form} onSubmit={add}>
        <textarea
          className={styles.draft}
          rows={2}
          value={draft}
          placeholder="Add a note…"
          aria-label="New note"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={buttons.primary} disabled={create.isPending}>
          Add
        </button>
      </form>

      {writeError && <ErrorBlock message={messageFor(writeError)} />}

      {notes.isPending && (
        <SkeletonDelay>
          <SkeletonRows rows={2} height="64px" />
        </SkeletonDelay>
      )}

      {notes.isError && (
        <ErrorBlock message={messageFor(notes.error)} onRetry={() => void notes.refetch()} />
      )}

      {notes.isSuccess && notes.data.length === 0 && <p className={styles.empty}>No notes yet.</p>}

      {notes.isSuccess &&
        notes.data.map((note) => (
          <article className={styles.note} key={note.id}>
            <div className={styles.body}>
              <p className={styles.text}>{note.text}</p>
              {note.page !== null && <span className={styles.page}>p. {note.page}</span>}
            </div>
            <button
              type="button"
              className={styles.delete}
              aria-label={`Delete note: ${note.text}`}
              onClick={() => remove.mutate(note.id)}
            >
              <Icon name="trash" size={14} />
            </button>
          </article>
        ))}
    </section>
  )
}
