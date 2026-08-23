import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import { Icon } from '../widgets/Icon'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { SkeletonDelay, SkeletonRows } from '../widgets/Skeleton'
import { useCreateNote, useDeleteNote, useNotes } from './useNotes'
import buttons from './actionButtons.module.css'
import styles from './NotesPanel.module.css'

/**
 * Notes and highlights, against the real endpoints.
 *
 * Every note here belongs to the reader looking at it — the API returns no
 * others and accepts no others, not even for an admin — so there is no author
 * line and nothing to share. The panel is deliberately plain: a note is
 * something you wrote to yourself, and decorating it would be the wrong
 * emphasis.
 *
 * **No page box on the form.** `page` is optional on the endpoint and a
 * reflowable EPUB has no pages to cite, so there is nothing honest to put in
 * it until the reader (#36) can say where the note was made. A stored page is
 * still shown, because an import or a later milestone may supply one.
 *
 * Reads its own data from `bookId` rather than being handed a list, for the
 * same reason the account row reads the session itself: nothing above it uses
 * notes, so passing them down would make the page depend on something it does
 * not draw.
 */
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
        // Cleared only once the server has it. Clearing on submit would lose
        // what somebody wrote if the request then failed.
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
