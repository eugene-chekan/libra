import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useBook } from '../book/useBook'
import { bookPath } from '../routes'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { ReaderError, type OpenBook } from './BookReader'
import { useBookReader } from './BookReaderContext'
import styles from './ReaderScreen.module.css'

/** `/books/:id/read` — the whole window, with no application furniture. */
export function ReaderScreen() {
  const { id } = useParams()
  const bookId = Number(id)
  const reader = useBookReader()
  const book = useBook(bookId)
  const host = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState<OpenBook | null>(null)
  const [failure, setFailure] = useState<ReaderError | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    let cancelled = false
    setFailure(null)
    setOpen(null)

    reader
      .open(bookId, mount)
      .then((opened) => {
        if (!cancelled) setOpen(opened)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setFailure(
          error instanceof ReaderError
            ? error
            : new ReaderError('parse', 'This book could not be opened.')
        )
      })

    return () => {
      cancelled = true
      reader.destroy()
    }
  }, [reader, bookId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const title = open?.title ?? book.data?.title ?? 'Book'

  return (
    <div className={styles.screen}>
      <div className={styles.body}>
        <div className={styles.column}>
          <div
            ref={host}
            className={styles.page}
            role="region"
            aria-label={title}
            aria-busy={open === null}
            hidden={open === null || failure !== null}
          />
          {failure && (
            <ErrorBlock
              message={failure.message}
              onRetry={failure.kind === 'download' ? retry : undefined}
              action={
                failure.kind === 'parse' ? (
                  <Link className={styles.backLink} to={bookPath(bookId)}>
                    Back to the book
                  </Link>
                ) : undefined
              }
            />
          )}
          {!failure && open === null && <OpeningSkeleton />}
        </div>
      </div>
    </div>
  )
}

/** Prose-shaped placeholder lines, and after two seconds a word about why. */
function OpeningSkeleton() {
  const [visible, setVisible] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 200)
    const nag = setTimeout(() => setSlow(true), 2000)
    return () => {
      clearTimeout(show)
      clearTimeout(nag)
    }
  }, [])

  if (!visible) return null
  return (
    <div>
      {[92, 100, 96, 88, 100, 70].map((width, index) => (
        <div key={index} className={styles.skeletonLine} style={{ width: `${width}%` }} />
      ))}
      {slow && <p className={styles.slowNote}>Downloading the book. Large books take a moment.</p>}
    </div>
  )
}
