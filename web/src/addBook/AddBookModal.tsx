import { useState, type DragEvent } from 'react'

import { messageFor } from '../api/errors'
import type { Book } from '../api/types'
import {
  BookFields,
  bookFieldsToPatch,
  bookFieldsValuesFrom,
  checkBookFields,
  type BookFieldsValues,
} from '../book/BookFields'
import { BookTags } from '../book/BookTags'
import { MoveToShelfButton } from '../book/MoveToShelfButton'
import { useBook, useSetBookState, useUpdateBook } from '../book/useBook'
import { BookCover } from '../library/BookCover'
import { useShelves } from '../library/useShelves'
import { useSession } from '../session/SessionProvider'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Icon } from '../widgets/Icon'
import { Modal, ModalFooter } from '../widgets/Modal'
import styles from './AddBookModal.module.css'
import { useUploadBook } from './useUploadBook'

/** Drop an EPUB, then confirm or correct what the server parsed out of it. */
export function AddBookModal({ onClose }: { onClose: () => void }) {
  const [uploadedId, setUploadedId] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const upload = useUploadBook()

  async function handleFile(file: File) {
    setUploadError(null)
    try {
      const book = await upload.mutateAsync(file)
      setUploadedId(book.id)
    } catch (caught) {
      setUploadError(messageFor(caught))
    }
  }

  return (
    <Modal title="Add Book" width={480} onClose={onClose}>
      {uploadedId === null ? (
        <DropStep
          uploading={upload.isPending}
          error={uploadError}
          onFile={(file) => void handleFile(file)}
          onCancel={onClose}
        />
      ) : (
        <ConfirmStep bookId={uploadedId} onDone={onClose} />
      )}
    </Modal>
  )
}

interface DropStepProps {
  uploading: boolean
  error: string | null
  onFile: (file: File) => void
  onCancel: () => void
}

function DropStep({ uploading, error, onFile, onCancel }: DropStepProps) {
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(event: DragEvent<HTMLInputElement>) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <>
      <label className={dragOver ? `${styles.dropzone} ${styles.dragOver}` : styles.dropzone}>
        {/* The handlers sit on the input, the one interactive element here —
            a `<label>` or `<div>` carrying them would need a role it does
            not otherwise have, and the input is a valid drop target on its
            own. */}
        <input
          type="file"
          accept=".epub"
          className={styles.hiddenInput}
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onFile(file)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        />
        <Icon name="upload" size={28} />
        <p className={styles.prompt}>
          {uploading
            ? 'Uploading…'
            : dragOver
              ? 'Drop it here'
              : 'Drag an EPUB here, or click to browse'}
        </p>
      </label>

      {error && <ErrorBlock message={error} />}

      <ModalFooter>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </ModalFooter>
    </>
  )
}

function ConfirmStep({ bookId, onDone }: { bookId: number; onDone: () => void }) {
  const book = useBook(bookId)

  if (book.isPending) return null
  if (book.isError) {
    return <ErrorBlock message={messageFor(book.error)} onRetry={() => void book.refetch()} />
  }

  return <ConfirmForm book={book.data} onDone={onDone} />
}

function ConfirmForm({ book, onDone }: { book: Book; onDone: () => void }) {
  const { status } = useSession()
  const shelves = useShelves().data ?? []
  const setState = useSetBookState(book.id)
  const update = useUpdateBook(book.id)
  const isAdmin = status.status === 'signed-in' && status.user.is_admin

  const [parsed] = useState(() => bookFieldsValuesFrom(book))
  const [values, setValues] = useState(parsed)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Shelf and tags save the moment they change, so Done is where the fields save too. */
  async function finish() {
    if (!changedFrom(parsed, values)) {
      onDone()
      return
    }

    const problem = checkBookFields(values)
    if (problem) {
      setSaveError(problem)
      return
    }

    setSaveError(null)
    try {
      await update.mutateAsync(bookFieldsToPatch(values))
    } catch (caught) {
      setSaveError(messageFor(caught))
      return
    }
    onDone()
  }

  return (
    <>
      <div className={styles.scroller}>
        <div className={styles.cover}>
          <BookCover id={book.id} title={book.title} coverVersion={book.cover_version} />
        </div>

        <div className={styles.fields}>
          <BookFields values={values} onChange={setValues} disabled={!isAdmin} />
          {saveError && <ErrorBlock message={saveError} />}
        </div>

        <div className={styles.row}>
          <MoveToShelfButton
            shelves={shelves}
            currentShelfId={book.shelf_id}
            onSelect={(shelfId) =>
              setState.mutate({ rating: book.rating, progress: book.progress, shelf_id: shelfId })
            }
          />
        </div>

        <BookTags book={book} />
      </div>

      <ModalFooter>
        <button
          type="button"
          className={styles.done}
          disabled={update.isPending}
          onClick={() => void finish()}
        >
          Done
        </button>
      </ModalFooter>
    </>
  )
}

function changedFrom(before: BookFieldsValues, after: BookFieldsValues): boolean {
  return (Object.keys(before) as (keyof BookFieldsValues)[]).some(
    (key) => before[key] !== after[key]
  )
}
