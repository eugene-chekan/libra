import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ApiError, messageFor } from '../api/errors'
import type { Book, Tag } from '../api/types'
import { BookActions } from '../book/BookActions'
import { BookEditForm } from '../book/BookEditForm'
import { DetailCover } from '../book/DetailCover'
import { NotesPanel } from '../book/NotesPanel'
import { ProgressPanel } from '../book/ProgressPanel'
import { RatingStars } from '../book/RatingStars'
import { useBook, useSendToKindle, useSetBookState, useUpdateBook } from '../book/useBook'
import { useShelves } from '../library/useShelves'
import { useTags } from '../library/useTags'
import { routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { useSaveKindleEmail } from '../session/useSaveKindleEmail'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Icon } from '../widgets/Icon'
import { KindleEmailModal } from '../widgets/KindleEmailModal'
import { Skeleton, SkeletonDelay } from '../widgets/Skeleton'
import { NotFoundScreen } from './screens'
import styles from './BookScreen.module.css'

/**
 * `/books/:id` — one book: what it is, where you are in it, and what you can
 * do with it.
 *
 * **Two kinds of write live on this screen, and they behave differently on
 * purpose.** Rating and shelf placement are the reader's own state — nobody
 * else sees them, so they commit the moment they change and there is nothing
 * to confirm. Title, author, year, pages and blurb are the shared catalog: one
 * correction changes what everyone sees, so they sit behind an explicit edit
 * mode with Save and Cancel. The endpoints split the same way, and
 * `PATCH /books/{id}` is admin-only, which is why Edit Book appears only for an
 * admin rather than opening a form that cannot be saved.
 */
export function BookScreen() {
  const { id } = useParams()
  const bookId = Number(id)

  // A non-numeric id is a typed URL, not a bug. It gets the same not-found
  // page as any other address that names nothing, rather than a request for
  // `/api/books/NaN`.
  if (!Number.isInteger(bookId)) return <NotFoundScreen />

  return <LoadedBookScreen bookId={bookId} />
}

function LoadedBookScreen({ bookId }: { bookId: number }) {
  const book = useBook(bookId)
  const [editing, setEditing] = useState(false)

  if (book.isPending) {
    return (
      <SkeletonDelay>
        <div className={styles.layout} aria-hidden="true">
          <div className={styles.coverColumn}>
            <Skeleton height="292px" />
          </div>
          <div className={styles.details}>
            <Skeleton height="34px" width="60%" />
            <Skeleton height="16px" width="35%" />
            <Skeleton height="13px" width="45%" />
          </div>
        </div>
      </SkeletonDelay>
    )
  }

  if (book.isError) {
    const gone = book.error instanceof ApiError && book.error.status === 404
    return (
      <>
        <BackLink />
        <ErrorBlock
          message={gone ? 'That book is not in this library.' : messageFor(book.error)}
          // A 404 will 404 again. Offering a retry there would say otherwise.
          onRetry={gone ? undefined : () => void book.refetch()}
        />
      </>
    )
  }

  return (
    <>
      <BackLink />
      <div className={styles.layout}>
        <div className={styles.coverColumn}>
          <DetailCover book={book.data} />
          {book.data.blurb && <p className={styles.blurb}>{book.data.blurb}</p>}
        </div>

        <div className={styles.details}>
          {editing ? (
            <EditMode book={book.data} onDone={() => setEditing(false)} />
          ) : (
            <ViewMode book={book.data} onEdit={() => setEditing(true)} />
          )}
        </div>
      </div>
    </>
  )
}

function BackLink() {
  return (
    <Link className={styles.back} to={routes.library}>
      <Icon name="arrow-left" size={16} />
      Back to Library
    </Link>
  )
}

/**
 * Everything about the book that is not the cover.
 *
 * It reads the shelves, the tags and the signed-in reader itself rather than
 * being handed them. Threading four values through the frame above would make
 * that component depend on things it does not draw, which is the prop-drilling
 * rule in docs/specs/code-style.md.
 */
function ViewMode({ book, onEdit }: { book: Book; onEdit: () => void }) {
  const { status } = useSession()
  const shelves = useShelves().data ?? []
  const tags = useTags().data ?? []
  const setState = useSetBookState(book.id)
  const sendToKindle = useSendToKindle(book.id)
  const saveKindleEmail = useSaveKindleEmail()
  const [kindleModalOpen, setKindleModalOpen] = useState(false)

  const user = status.status === 'signed-in' ? status.user : null
  const shelf = shelves.find((candidate) => candidate.id === book.shelf_id) ?? null
  const bookTags = tags.filter((tag) => book.tag_ids.includes(tag.id))

  return (
    <>
      <header className={styles.heading}>
        <h1 className={styles.title}>{book.title}</h1>
        <p className={styles.author}>{book.author}</p>
        <p className={styles.metadata}>{metadataLine(book, shelf?.name ?? null)}</p>
      </header>

      <RatingStars
        rating={book.rating}
        // Immediate, because a rating is nobody's business but this reader's.
        // Progress goes along for the ride: the endpoint is a PUT, so sending
        // only the rating would reset how far they had got.
        onRate={(rating) => setState.mutate({ rating, progress: book.progress })}
      />

      {bookTags.length > 0 && (
        <ul className={styles.tags}>
          {bookTags.map((tag) => (
            <li key={tag.id}>
              <TagPill tag={tag} />
            </li>
          ))}
        </ul>
      )}

      <ProgressPanel progress={book.progress} pages={book.pages} />

      <BookActions
        book={book}
        shelves={shelves}
        // `PATCH /books/{id}` is admin-only, so a reader is offered no Edit
        // Book rather than a form whose Save is certain to be refused.
        canEdit={user?.is_admin ?? false}
        hasKindleAddress={user?.kindle_email != null}
        onEdit={onEdit}
        onMoveToShelf={(shelfId) =>
          setState.mutate({ rating: book.rating, progress: book.progress, shelf_id: shelfId })
        }
        // Deliberately handed the raw promise: the Kindle button owns this
        // failure and prints the reason itself, so the rejection has to reach
        // it rather than being swallowed into the page-level error below.
        onSendToKindle={() => sendToKindle.mutateAsync()}
        onSetUpKindle={() => setKindleModalOpen(true)}
      />

      {setState.isError && <ErrorBlock message={messageFor(setState.error)} />}

      <NotesPanel bookId={book.id} />

      {kindleModalOpen && user && (
        <KindleEmailModal
          currentEmail={user.kindle_email}
          onClose={() => setKindleModalOpen(false)}
          onSave={async (email) => {
            await saveKindleEmail(email)
            setKindleModalOpen(false)
          }}
        />
      )}
    </>
  )
}

function EditMode({ book, onDone }: { book: Book; onDone: () => void }) {
  const update = useUpdateBook(book.id)
  return <BookEditForm book={book} onSave={(patch) => update.mutateAsync(patch)} onDone={onDone} />
}

/** A tag is a filter, here as in the sidebar: clicking one asks "what else is like this?". */
function TagPill({ tag }: { tag: Tag }) {
  return (
    <Link className={styles.tagPill} to={`${routes.library}?tags=${tag.id}`}>
      {tag.name}
    </Link>
  )
}

/**
 * Only what the file actually declared, joined by dots.
 *
 * A book whose EPUB carries no year or page count shows neither, rather than
 * an invented one — the same rule the server follows in leaving those columns
 * null.
 */
function metadataLine(book: Book, shelfName: string | null): string {
  return [
    book.format.toUpperCase(),
    book.year !== null ? String(book.year) : null,
    book.pages !== null ? `${book.pages} pages` : null,
    shelfName,
  ]
    .filter((part): part is string => part !== null)
    .join('  ·  ')
}
