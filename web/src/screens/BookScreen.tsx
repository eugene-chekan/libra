import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError, messageFor } from '../api/errors'
import type { Book } from '../api/types'
import { BookActions } from '../book/BookActions'
import { BookEditForm } from '../book/BookEditForm'
import { BookTags } from '../book/BookTags'
import { DetailCover } from '../book/DetailCover'
import { NotesPanel } from '../book/NotesPanel'
import { ProgressPanel } from '../book/ProgressPanel'
import { RatingStars } from '../book/RatingStars'
import {
  useBook,
  useDeleteBook,
  useSendToKindle,
  useSetBookState,
  useUpdateBook,
} from '../book/useBook'
import { useShelves } from '../library/useShelves'
import { routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { useSaveKindleEmail } from '../session/useSaveKindleEmail'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Icon } from '../widgets/Icon'
import { KindleEmailModal } from '../widgets/KindleEmailModal'
import { Skeleton, SkeletonDelay } from '../widgets/Skeleton'
import { NotFoundScreen } from './screens'
import styles from './BookScreen.module.css'

/** `/books/:id` — one book: what it is, where you are in it, and what you can do with it. */
export function BookScreen() {
  const { id } = useParams()
  const bookId = Number(id)

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
          // A 404 will 404 again, and offering a retry would say otherwise.
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

/** Everything about the book that is not the cover. */
function ViewMode({ book, onEdit }: { book: Book; onEdit: () => void }) {
  const { status } = useSession()
  const navigate = useNavigate()
  const shelves = useShelves().data ?? []
  const setState = useSetBookState(book.id)
  const sendToKindle = useSendToKindle(book.id)
  const remove = useDeleteBook(book.id)
  const saveKindleEmail = useSaveKindleEmail()
  const [kindleModalOpen, setKindleModalOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const user = status.status === 'signed-in' ? status.user : null
  const shelf = shelves.find((candidate) => candidate.id === book.shelf_id) ?? null

  return (
    <>
      <header className={styles.heading}>
        <h1 className={styles.title}>{book.title}</h1>
        <p className={styles.author}>{book.author}</p>
        <p className={styles.metadata}>{metadataLine(book, shelf?.name ?? null)}</p>
      </header>

      <RatingStars
        rating={book.rating}
        onRate={(rating) => setState.mutate({ rating, progress: book.progress })}
      />

      <BookTags book={book} />

      <ProgressPanel progress={book.progress} pages={book.pages} />

      <BookActions
        book={book}
        shelves={shelves}
        canEdit={user?.is_admin ?? false}
        hasKindleAddress={user?.kindle_email != null}
        onEdit={onEdit}
        onDelete={() => setConfirmingDelete(true)}
        onMoveToShelf={(shelfId) =>
          setState.mutate({ rating: book.rating, progress: book.progress, shelf_id: shelfId })
        }
        onSendToKindle={() => sendToKindle.mutateAsync()}
        onSetUpKindle={() => setKindleModalOpen(true)}
      />

      {setState.isError && <ErrorBlock message={messageFor(setState.error)} />}
      {remove.isError && <ErrorBlock message={messageFor(remove.error)} />}

      <NotesPanel bookId={book.id} />

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete ${book.title}?`}
          message="The book, its file, and everyone's notes, tags, rating and reading place all go. This cannot be undone."
          confirmLabel="Delete"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            remove.mutate(undefined, {
              onSuccess: () => void navigate(routes.library),
            })
          }}
        />
      )}

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

/** Only what the file actually declared, joined by dots. */
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
